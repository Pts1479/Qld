/**
 * QLD Group / Sanctum — Daily Reconciliation
 *
 * Paste the body of this file into the Wunderbuild MCP `run_query` tool.
 * READ-ONLY: it never creates, sends, or modifies a record.
 *
 * Reconciles every active job across four domains and returns an EXCEPTION LIST —
 * only records whose fields fail to match. A clean day returns empty arrays.
 *
 *   TIMESHEET   unprocessed / no rate / not linked to a costing item
 *   COSTING     capture below floor, categories with an estimate and no actual
 *   PURCHASE    POs raised but never received (committed cost never booked)
 *   CLAIM       overdue invoices, approved variations never claimed, claim-gate
 *   INTEGRITY   category actuals vs job actual, claims vs totalClaimed
 *
 * Supplier bills are NOT here — they are not exposed through the `wb` query API.
 * Run `manage_bills` separately; the skill documents that half.
 *
 * Money is ex-GST EXCEPT progress-claim figures, which are inc-GST. Keys are
 * suffixed so the two can never be summed by accident.
 */

const rnd = n => Math.round(n || 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const today = new Date();
const daysSince = d => (d ? Math.round((today - new Date(d)) / 86400000) : null);

// --- thresholds -------------------------------------------------------------
const CAPTURE_FLOOR = 90;    // % of estimated cost that must be booked
const CLAIM_GATE_GAP = 25;   // claimed% - capture% tolerance
const TIMESHEET_AGE = 14;    // days an unprocessed sheet may sit
const INVOICE_GRACE = 7;     // days past due before chasing
const DRIFT_TOLERANCE = 1;   // $ rounding allowed in integrity checks

const active = await wb.jobs.list({ limit: 50 });

// A job that has not started yet SHOULD have no cost. Excluding these is what
// stops the sweep crying wolf over deposit claims on unstarted work.
const hasStarted = j => !j.startDate || new Date(j.startDate) <= today;

const perJob = await wb.mapConcurrent(active, async job => {
  const [poRes, tsRes, icRes, costRes, varRes, claimRes] = await Promise.all([
    wb.jobs.purchaseOrders.list(job._id, { limit: 50 }).catch(() => []),
    wb.jobs.timesheets.list(job._id, { limit: 50 }).catch(() => []),
    wb.jobs.internalCharges.list(job._id, { limit: 50 }).catch(() => []),
    wb.jobs.costings.list(job._id).catch(() => []),
    wb.jobs.variations.list(job._id, { limit: 50 }).catch(() => []),
    wb.jobs.progressClaims.list(job._id).catch(() => [])
  ]);
  const arr = x => (Array.isArray(x) ? x : (x && (x.data || x.items)) || []);
  return {
    job,
    pos: arr(poRes),
    sheets: arr(tsRes),
    charges: arr(icRes),
    costings: arr(costRes),
    variations: arr(varRes),
    claims: arr(claimRes)
  };
});

const ex = { timesheet: [], costing: [], purchase: [], claim: [], integrity: [] };
const name = j => (j.name || '').slice(0, 40);

for (const { job, pos, sheets, costings, variations, claims } of perJob) {
  const started = hasStarted(job);
  const capture = pct(job.totalActualCost, job.totalEstimated);
  const claimed = rnd(job.totalClaimedPercent);

  // --- TIMESHEET: field-level match --------------------------------------
  for (const t of sheets) {
    if (t.isProcessed) {
      // Processed but never bound to a costing line — cost landed in a generic
      // bucket instead of against the work it belongs to.
      if (!t.costingItemId) {
        ex.timesheet.push({
          type: 'TIMESHEET_UNLINKED', job: name(job),
          who: t.member ? [t.member.firstName, t.member.lastName].filter(Boolean).join(' ') : '',
          date: (t.startTime || '').slice(0, 10),
          costExGst: rnd(t.actualCost),
          category: t.costingCategoryName || null,
          fix: 'reallocate_timesheet to the correct costing item'
        });
      }
      continue;
    }
    const age = daysSince(t.startTime);
    if (age !== null && age > TIMESHEET_AGE) {
      ex.timesheet.push({
        type: 'TIMESHEET_UNPROCESSED', job: name(job),
        who: t.member ? [t.member.firstName, t.member.lastName].filter(Boolean).join(' ') : '',
        date: (t.startTime || '').slice(0, 10), ageDays: age,
        // hours and rate are both computed at processing time; zero here is
        // normal, not corrupt.
        fix: 'process_timesheet with useDefaultRate: true'
      });
    }
  }

  // --- PURCHASE: committed but never received ------------------------------
  for (const p of pos) {
    if (p.status === 'SENT' || p.status === 'DRAFT') {
      ex.purchase.push({
        type: 'PO_NOT_RECEIVED', job: name(job),
        reference: p.reference, status: p.status,
        ageDays: daysSince(p.date),
        fix: 'receive_purchase_order once goods have landed, else cancel'
      });
    }
  }

  // --- COSTING: capture and empty categories -------------------------------
  if (started && capture < CAPTURE_FLOOR) {
    const empty = costings.filter(c => (c.totalEstimatedCost || 0) > 0 && (c.totalActualCost || 0) === 0);
    ex.costing.push({
      type: 'CAPTURE_BELOW_FLOOR', job: name(job),
      capturePct: capture,
      estCostExGst: rnd(job.totalEstimated),
      actualCostExGst: rnd(job.totalActualCost),
      exposureExGst: rnd(empty.reduce((a, c) => a + (c.totalEstimatedCost || 0), 0)),
      emptyCategories: `${empty.length}/${costings.length}`,
      note: 'Margin on this job is not a margin until capture clears the floor'
    });
  }

  // --- CLAIM: gate, overdue invoices, unclaimed variations -----------------
  if (started && claimed - capture > CLAIM_GATE_GAP) {
    ex.claim.push({
      type: 'CLAIM_GATE', job: name(job),
      claimedPct: claimed, capturePct: capture, gap: claimed - capture,
      note: 'Billing the client ahead of recording cost'
    });
  }

  for (const v of variations) {
    const remaining = rnd(v.claimRemaining != null ? v.claimRemaining : (v.subTotal || 0) - (v.claimedToDate || 0));
    if (remaining <= 0) continue;
    ex.claim.push({
      type: v.status === 'APPROVED_BY_BUILDER' ? 'VARIATION_UNCLAIMED' : 'VARIATION_UNAPPROVED',
      job: name(job), variation: (v.name || '').slice(0, 38), status: v.status,
      remainingExGst: remaining,
      fix: v.status === 'APPROVED_BY_BUILDER'
        ? 'create_progress_claim with variationItems[]'
        : 'chase the client for approval'
    });
  }

  for (const c of claims) {
    if ((c.outstandingTotal || 0) <= 0) continue;
    const over = c.isOverdue ? daysSince(c.dueDate) : 0;
    if (over > INVOICE_GRACE) {
      ex.claim.push({
        type: 'INVOICE_OVERDUE', job: name(job),
        invoice: c.invNumber, outstandingIncGst: rnd(c.outstandingTotal),
        daysOverdue: over,
        client: job.client ? [job.client.firstName, job.client.lastName].filter(Boolean).join(' ') : '',
        email: (job.client && job.client.email) || ''
      });
    }
  }

  // --- INTEGRITY: do the totals agree with their parts? --------------------
  const catSum = costings.reduce((a, c) => a + (c.totalActualCost || 0), 0);
  if (Math.abs(catSum - (job.totalActualCost || 0)) > DRIFT_TOLERANCE) {
    ex.integrity.push({
      type: 'COSTING_SUM_DRIFT', job: name(job),
      categorySumExGst: rnd(catSum), jobActualExGst: rnd(job.totalActualCost),
      driftExGst: rnd(catSum - (job.totalActualCost || 0))
    });
  }
  const claimSum = claims.reduce((a, c) => a + (c.total || 0), 0);
  if (claimSum > 0 && Math.abs(claimSum - (job.totalClaims || 0)) > DRIFT_TOLERANCE) {
    ex.integrity.push({
      type: 'CLAIM_SUM_DRIFT', job: name(job),
      claimSumIncGst: rnd(claimSum), jobClaimsIncGst: rnd(job.totalClaims),
      driftIncGst: rnd(claimSum - (job.totalClaims || 0))
    });
  }
  // A contract priced at cost carries no margin by construction.
  if (rnd(job.totalEstimatedWithMarkup) === 0 && rnd(job.contractTotal) > 0) {
    ex.integrity.push({
      type: 'NO_MARKUP_RECORDED', job: name(job),
      contractExGst: rnd(job.contractTotal), estCostExGst: rnd(job.totalEstimated)
    });
  }
}

const counts = Object.fromEntries(Object.entries(ex).map(([k, v]) => [k, v.length]));
const total = Object.values(counts).reduce((a, n) => a + n, 0);

return {
  generatedAt: today.toISOString().slice(0, 10),
  activeJobs: active.length,
  jobsNotYetStarted: active.filter(j => !hasStarted(j)).length,
  portfolioCapturePct: pct(
    perJob.reduce((a, p) => a + (p.job.totalActualCost || 0), 0),
    perJob.reduce((a, p) => a + (p.job.totalEstimated || 0), 0)
  ),
  exceptionCount: total,
  counts,
  exceptions: ex,
  // Compact fingerprint for day-over-day diffing. Compare against the previous
  // run's list; report only what is new or resolved.
  fingerprints: Object.values(ex).flat()
    .map(e => [e.type, e.job, e.invoice || e.variation || e.reference || e.who || e.date || ''].join('|'))
    .sort()
};
