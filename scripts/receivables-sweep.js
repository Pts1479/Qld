/**
 * QLD Group / Sanctum — Claims & Receivables Sweep
 *
 * Paste the body of this file into the Wunderbuild MCP `run_query` tool.
 * It is READ-ONLY: it never creates, sends, or modifies a record.
 *
 * Returns five sections:
 *   A  Outstanding invoices, aged, with client contact details
 *   B  Approved variations with a claimable balance
 *   C  Jobs where delivery is running ahead of claiming
 *   D  Cost-capture gaps (actual cost booked vs estimated cost)
 *   E  Completed jobs carrying zero claim records (data-integrity check)
 *
 * All money from the Wunderbuild API is ex-GST EXCEPT progress-claim totals,
 * which are inc-GST. Section A is inc-GST; sections B-D are ex-GST. Labels below
 * carry the suffix so the two are never added together by accident.
 */

const rnd = n => Math.round(n || 0);
const today = new Date();
const daysSince = d => (d ? Math.round((today - new Date(d)) / 86400000) : null);

// ---------------------------------------------------------------- job universe
const active = await wb.jobs.list({ limit: 50 });
const activeIds = new Set(active.map(j => j._id));

let completed = [];
for (let page = 1; page <= 3; page++) {
  const rows = await wb.jobs.list({ limit: 50, completed: true, page });
  const list = Array.isArray(rows) ? rows : [];
  completed = completed.concat(list.filter(j => !activeIds.has(j._id)));
  if (list.length < 50) break;
}
const allJobs = active.concat(completed);

// ------------------------------------------- A: outstanding invoices, by age
const claimsByJob = await wb.mapConcurrent(allJobs, async job => {
  const res = await wb.jobs.progressClaims.list(job._id).catch(() => []);
  const claims = Array.isArray(res) ? res : [];
  return claims
    .filter(c => (c.outstandingTotal || 0) > 0)
    .map(c => ({
      invoice: c.invNumber,
      job: (job.name || '').slice(0, 40),
      client: [job.client && job.client.firstName, job.client && job.client.lastName]
        .filter(Boolean).join(' '),
      email: (job.client && job.client.email) || '',
      outstandingIncGst: rnd(c.outstandingTotal),
      invoicedIncGst: rnd(c.total),
      status: c.status,
      overdue: !!c.isOverdue,
      claimDate: (c.claimDate || '').slice(0, 10),
      dueDate: (c.dueDate || '').slice(0, 10),
      daysOverdue: c.isOverdue ? daysSince(c.dueDate) : 0
    }));
});

const outstanding = [].concat(...claimsByJob).sort((a, b) => b.outstandingIncGst - a.outstandingIncGst);
const overdue = outstanding.filter(c => c.overdue);

const bucket = d =>
  d <= 30 ? '0-30' : d <= 90 ? '31-90' : d <= 180 ? '91-180' : '180+';

const aging = {};
for (const c of overdue) {
  const k = bucket(c.daysOverdue);
  aging[k] = aging[k] || { count: 0, incGst: 0 };
  aging[k].count++;
  aging[k].incGst += c.outstandingIncGst;
}

// ------------------------------ B: approved variations with claimable balance
const variationsByJob = await wb.mapConcurrent(active, async job => {
  const res = await wb.jobs.variations.list(job._id, { limit: 50 }).catch(() => []);
  const list = Array.isArray(res) ? res : [];
  return list.map(v => ({
    job: (job.name || '').slice(0, 40),
    jobId: job._id,
    jobType: job.type,                       // CONTRACT => claim via variationItems[]
    variation: (v.name || '').slice(0, 40),
    variationId: v._id,
    status: v.status,
    subTotalExGst: rnd(v.subTotal),
    claimedExGst: rnd(v.claimedToDate),
    remainingExGst: rnd(
      v.claimRemaining != null ? v.claimRemaining : (v.subTotal || 0) - (v.claimedToDate || 0)
    )
  }));
});

const claimable = [].concat(...variationsByJob)
  .filter(v => v.remainingExGst > 0)
  .sort((a, b) => b.remainingExGst - a.remainingExGst);

// --------------------------- C + D: delivery-vs-claim and cost-capture gaps
const gaps = active
  .map(j => ({
    job: (j.name || '').slice(0, 40),
    contractExGst: rnd(j.contractTotal),
    claimedPct: rnd(j.totalClaimedPercent),
    estCostExGst: rnd(j.totalEstimated),
    actualCostExGst: rnd(j.totalActualCost),
    costCapturePct: j.totalEstimated ? rnd((j.totalActualCost || 0) / j.totalEstimated * 100) : 0,
    unclaimedExGst: rnd(j.totalUnclaimed),
    plannedMarginPct: j.contractTotal
      ? Math.round(((j.contractTotal - j.totalEstimated) / j.contractTotal) * 1000) / 10
      : null
  }))
  .sort((a, b) => a.costCapturePct - b.costCapturePct);

// ------------------------------------- E: completed jobs with no claim records
const zeroClaimProbe = await wb.mapConcurrent(
  completed.filter(j => (j.totalClaimed || 0) === 0 && (j.contractTotal || 0) > 15000),
  async job => {
    const res = await wb.jobs.progressClaims.list(job._id).catch(() => 'ERROR');
    const claims = Array.isArray(res) ? res : [];
    return {
      job: (job.name || '').slice(0, 40),
      contractExGst: rnd(job.contractTotal),
      costSunkExGst: rnd(job.totalActualCost),
      claimRecords: Array.isArray(res) ? claims.length : res,
      lastUpdated: (job.updatedAt || '').slice(0, 10)
    };
  }
);

// --------------------------------------------------------------------- output
return {
  generatedAt: today.toISOString().slice(0, 10),
  headline: {
    outstandingIncGst: rnd(outstanding.reduce((a, c) => a + c.outstandingIncGst, 0)),
    overdueIncGst: rnd(overdue.reduce((a, c) => a + c.outstandingIncGst, 0)),
    overdueCount: overdue.length,
    claimableVariationsExGst: rnd(claimable.reduce((a, v) => a + v.remainingExGst, 0)),
    approvedVariationsExGst: rnd(
      claimable.filter(v => v.status === 'APPROVED_BY_BUILDER')
        .reduce((a, v) => a + v.remainingExGst, 0)
    ),
    jobsBelowCostCaptureFloor: gaps.filter(g => g.costCapturePct < 90).length
  },
  A_outstanding: { aging, rows: outstanding },
  B_claimableVariations: claimable,
  CD_gaps: gaps,
  E_zeroClaimCompletedJobs: {
    count: zeroClaimProbe.length,
    contractValueExGst: rnd(zeroClaimProbe.reduce((a, j) => a + j.contractExGst, 0)),
    costSunkExGst: rnd(zeroClaimProbe.reduce((a, j) => a + j.costSunkExGst, 0)),
    rows: zeroClaimProbe
  }
};
