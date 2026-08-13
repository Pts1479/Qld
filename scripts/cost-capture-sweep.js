/**
 * QLD Group / Sanctum — Cost Capture Sweep
 *
 * Paste the body of this file into the Wunderbuild MCP `run_query` tool.
 * It is READ-ONLY: it never creates, sends, or modifies a record.
 *
 * Answers one question: why doesn't the cost side of the book match the revenue side?
 *
 *   A  Per-job cost capture — actual cost booked vs estimated cost
 *   B  Claim gate — jobs billing the client faster than they are booking cost
 *   C  Category-level gaps — which costing lines carry an estimate but no actual
 *   D  Unprocessed timesheets — logged labour that has never been costed
 *   E  Commitment coverage — POs, timesheets and internal charges per job
 *
 * NOT COVERED HERE: supplier bills from the accounting integration. Bills are not
 * exposed through the `wb` query API — run `manage_bills` separately (see the
 * cost-capture skill). That is where the largest gap was found on 2026-08-13:
 * 244 bills worth $395,414 inc-GST marked IGNORED instead of allocated to a job.
 *
 * All figures below are ex-GST.
 */

const rnd = n => Math.round(n || 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

const CAPTURE_FLOOR = 90;   // below this, a job's margin figure is not a margin
const CLAIM_GATE_GAP = 25;  // claimed% exceeding capture% by more than this is a flag

const active = await wb.jobs.list({ limit: 50 });

const jobs = await wb.mapConcurrent(active, async job => {
  const [poRes, tsRes, icRes, costRes] = await Promise.all([
    wb.jobs.purchaseOrders.list(job._id, { limit: 50 }).catch(() => []),
    wb.jobs.timesheets.list(job._id, { limit: 50 }).catch(() => []),
    wb.jobs.internalCharges.list(job._id, { limit: 50 }).catch(() => []),
    wb.jobs.costings.list(job._id).catch(() => [])
  ]);
  const arr = x => (Array.isArray(x) ? x : (x && (x.data || x.items)) || []);
  const pos = arr(poRes), sheets = arr(tsRes), charges = arr(icRes), costings = arr(costRes);

  const unprocessed = sheets.filter(t => !t.isProcessed);
  const processed = sheets.filter(t => t.isProcessed);

  // Costing categories carrying an estimate with nothing booked against them.
  const emptyCategories = costings
    .filter(c => (c.totalEstimatedCost || 0) > 0 && (c.totalActualCost || 0) === 0)
    .map(c => ({ category: c.name, estimateExGst: rnd(c.totalEstimatedCost), plannedMarginPct: c.ftcGrossMargin }))
    .sort((a, b) => b.estimateExGst - a.estimateExGst);

  const capturePct = pct(job.totalActualCost, job.totalEstimated);
  const claimedPct = rnd(job.totalClaimedPercent);

  return {
    job: (job.name || '').slice(0, 40),
    jobId: job._id,
    contractExGst: rnd(job.contractTotal),
    estCostExGst: rnd(job.totalEstimated),
    actualCostExGst: rnd(job.totalActualCost),
    capturePct,
    claimedPct,
    // How far ahead of cost-recording the billing has run.
    claimGateGap: claimedPct - capturePct,
    plannedMarginPct: job.contractTotal
      ? Math.round(((job.contractTotal - job.totalEstimated) / job.contractTotal) * 1000) / 10
      : null,
    exposureExGst: rnd(emptyCategories.reduce((a, c) => a + c.estimateExGst, 0)),
    purchaseOrders: pos.length,
    timesheetsTotal: sheets.length,
    timesheetsUnprocessed: unprocessed.length,
    internalCharges: charges.length,
    // No commitment records of any kind — the job is running entirely off-book.
    noCostRecordsAtAll: pos.length === 0 && sheets.length === 0 && charges.length === 0,
    costingCategories: costings.length,
    emptyCategoryCount: emptyCategories.length,
    topEmptyCategories: emptyCategories.slice(0, 6),
    // Average booked cost per processed sheet — used to value the unprocessed pile.
    avgCostPerProcessedSheet: processed.length
      ? rnd(processed.reduce((a, t) => a + (t.actualCost || 0), 0) / processed.length)
      : null
  };
});

const allProcessed = jobs.reduce((a, j) => a + (j.timesheetsTotal - j.timesheetsUnprocessed), 0);
const allUnprocessed = jobs.reduce((a, j) => a + j.timesheetsUnprocessed, 0);
const bookedFromSheets = jobs.reduce(
  (a, j) => a + (j.avgCostPerProcessedSheet || 0) * (j.timesheetsTotal - j.timesheetsUnprocessed), 0
);
const avgSheet = allProcessed ? bookedFromSheets / allProcessed : 0;

return {
  generatedAt: new Date().toISOString().slice(0, 10),
  headline: {
    activeJobs: jobs.length,
    portfolioCapturePct: pct(
      jobs.reduce((a, j) => a + j.actualCostExGst, 0),
      jobs.reduce((a, j) => a + j.estCostExGst, 0)
    ),
    totalExposureExGst: rnd(jobs.reduce((a, j) => a + j.exposureExGst, 0)),
    jobsBelowCaptureFloor: jobs.filter(j => j.capturePct < CAPTURE_FLOOR).length,
    jobsRunningOffBook: jobs.filter(j => j.noCostRecordsAtAll).length,
    unprocessedTimesheets: allUnprocessed,
    // Estimate only — the real figure resolves from rate cards at processing time.
    unprocessedTimesheetValueEstExGst: rnd(allUnprocessed * avgSheet),
    avgCostPerProcessedSheet: rnd(avgSheet)
  },
  A_capture: jobs
    .map(({ topEmptyCategories, jobId, ...rest }) => rest)
    .sort((a, b) => a.capturePct - b.capturePct),
  B_claimGateBreaches: jobs
    .filter(j => j.claimGateGap > CLAIM_GATE_GAP)
    .map(j => ({
      job: j.job,
      claimedPct: j.claimedPct,
      capturePct: j.capturePct,
      gap: j.claimGateGap,
      contractExGst: j.contractExGst,
      note: 'Billing the client ahead of recording cost — margin on this job is unknown'
    }))
    .sort((a, b) => b.gap - a.gap),
  C_categoryGaps: jobs
    .filter(j => j.exposureExGst > 0)
    .map(j => ({ job: j.job, exposureExGst: j.exposureExGst, emptyOf: `${j.emptyCategoryCount}/${j.costingCategories}`, categories: j.topEmptyCategories }))
    .sort((a, b) => b.exposureExGst - a.exposureExGst),
  D_timesheets: jobs
    .filter(j => j.timesheetsUnprocessed > 0)
    .map(j => ({ job: j.job, unprocessed: j.timesheetsUnprocessed, of: j.timesheetsTotal, avgSheetExGst: j.avgCostPerProcessedSheet }))
    .sort((a, b) => b.unprocessed - a.unprocessed),
  E_offBookJobs: jobs
    .filter(j => j.noCostRecordsAtAll)
    .map(j => ({ job: j.job, contractExGst: j.contractExGst, claimedPct: j.claimedPct, exposureExGst: j.exposureExGst }))
    .sort((a, b) => b.exposureExGst - a.exposureExGst)
};
