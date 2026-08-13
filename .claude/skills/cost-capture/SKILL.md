---
name: cost-capture
description: >
  Run the QLD Group / Sanctum cost-capture sweep against live Wunderbuild data to find
  why booked costs don't match the revenue side — ignored supplier bills, unprocessed
  timesheets, missing purchase orders, and costing categories carrying an estimate with
  no actual. Use whenever Paul asks about job margin, gross profit, "are we making money
  on this job", cost tracking, WIP, why the numbers look wrong, or before any pricing,
  margin or profitability discussion. Also use when a margin figure looks implausibly
  high — that is the signature of missing cost data, not a good job. Do not use for
  chasing money owed by clients; that is the receivables-sweep skill.
---

# Cost Capture

Finds the cost data that should be in the job book and isn't.

Built 2026-08-13. The active book was showing 20.3% cost capture — $239,648 of actual
cost booked against $1,181,613 estimated — which is why Wunderbuild had been reporting
92–98% gross margins. Those were never margins. They were the absence of costs.

## Why this runs before anything else

Pricing work, margin targets and the estimate-integrity check are all downstream of
this. You cannot tell whether a pricing change worked if four-fifths of your costs
never reach the job. **Fix the instrument before reading it.**

## How to run it

The sweep has two halves, because bills live outside the query API.

### 1. Jobs, timesheets and costings

Read `scripts/cost-capture-sweep.js` and pass its body to the Wunderbuild MCP
`run_query` tool. Read-only. Returns per-job capture rates, claim-gate breaches,
category-level gaps, unprocessed timesheets, and jobs running entirely off-book.

### 2. Supplier bills

Bills are **not** in the `wb` query API. Use `manage_bills` directly:

- `manage_bills` action `list`, `importStatus: "UNPROCESSED"` — the live queue. Anything
  here is a supplier invoice that has arrived and not been allocated to a job yet.
- `manage_bills` action `list`, `importStatus: "IGNORED"` — the backlog. On 2026-08-13
  this held **244 bills worth $395,414 inc-GST**, dated mid-2025 to April 2026,
  including obvious job costs: CFS Tiling $20,152, Quantum Electrical $20,615,
  Plant Connections $21,808 and $18,709, Coastal Polished Concrete $13,728,
  Berding Concrete $13,365.

`list` renders a table rather than JSON, so total it deliberately — write the amounts
out and sum them rather than eyeballing a 244-row table.

## The two failure modes — treat them differently

They need different fixes, and conflating them produces useless advice.

**Off-book jobs** — no POs, no timesheets, no internal charges. Nothing was ever
entered. No agent can invent a cost record that does not exist; the fix is that
supplier invoices for that job must be allocated to it. Look for them in the ignored
bill list first before concluding the costs were never incurred.

**Drifting jobs** — the process is running but incomplete. Some POs, some timesheets,
partial allocation. These are recoverable by finishing the work already started, and
they are where the fastest wins are.

A job that is 100% claimed with zero cost booked is the worst case of the first mode:
the client has paid in full and the job's profitability is permanently unknowable
unless the bills are found.

## Thresholds

| Signal | Threshold | Meaning |
|---|---|---|
| Cost capture on an active job | < 90% of estimate | Margin figure is unreliable — say so, don't quote it |
| Cost capture | 0% with work underway | Job is running off-book |
| Claim gate: `claimedPct − capturePct` | > 25 points | Billing the client faster than recording cost |
| Unprocessed timesheets | any older than 14 days | Labour cost not yet in the job |
| Bills in IGNORED | any that look job-related | Needs a review pass, likely misfiled |
| Bills in UNPROCESSED | > 7 days old | Allocation is falling behind |

## Processing timesheets — this works, and it is the fastest fix

Unprocessed timesheets show `hours: 0` and `rate: 0`. **This is not corrupt data.**
Hours are computed from start/end times and rates resolve from the business rate cards
*at processing time*. The 62 already-processed sheets prove it: they carry real hours
and rates of $40–45/hr, booking $23,486 of labour cost.

So process them with `run_job_finances` → `process_timesheet` and `useDefaultRate: true`,
which makes the server walk job rate mapping → cost-code category rate → the worker's
default rate. **Never pass an invented `rate`.** If the user has not stated a specific
figure, `useDefaultRate` is the only correct option — there is no market-rate lookup in
this product, and a guessed rate silently corrupts the job's margin.

Check first with `manage_timesheets` action `get_rates`. A $0 result means the worker
has no rate configured — report that as a blocker rather than processing a zero.

Two quality notes worth raising while you're in there: most timesheets carry
`task: "No description"`, and none are linked to a costing item, so labour lands in a
generic bucket rather than against the cost line it belongs to. Costs reaching the job
at all is the win; attributing them to the right line is the next increment.

## Allocating an ignored bill — verified runbook

Worked out against live data on 2026-08-13. Follow it exactly; two of the steps are
non-obvious and the failure mode is a generic, uninformative error.

**The bills are already coded to jobs.** Xero's tracking carries through: every bill's
`items[].job` names the job it belongs to, and `manage_bills` action `list` accepts a
`jobId` filter *alongside* `importStatus: "IGNORED"`. So this is a batch job sorted by
job, not a forensic matching exercise. Never match by date — several jobs overlap in
any given month and you will misallocate.

**Step 1 — unarchive the job.** Completed jobs are archived AND `isLocked: true`, and a
locked job rejects `process`. `manage_job` action `unarchive` with `confirm: true`
clears both (status → active, `isLocked` → false). There is no separate unlock action.

**Step 2 — read each bill's line-item ids.** `manage_bills` action `get` returns
`items[]._id`. You need these; there is no way to skip this call, so budget two calls
per bill.

**Step 3 — process with an explicit `items[]` mapping.**

```
manage_bills action=process billId=<bill>
  data: { jobId, internalNote, items: [{ _id: <line id>, costingCategoryName: "Tiling" }] }
```

**`items[]` is mandatory.** Calling `process` with only a `jobId` fails with
"Something went wrong processing the request" — not a validation message naming the
missing field. This was verified twice, including once after the job was unlocked and a
costing category already existed, so it is the payload and not the lock. If you see
that generic error, the mapping is what's missing.

**Step 4 — re-archive** with `manage_job` action `archive` once the job's bills are
done. Until then the job shows in the active list and distorts portfolio views.

Derive `costingCategoryName` from the supplier and the line description, both of which
are usually explicit ("Corey Ison - Palm Drive", "BBQ Area", "50% deposit on pool fence,
deck screen and battens"). Trade-level categories give the reconstructed job a legible
cost breakdown; one lump category tells you nothing beyond the total.

Check `isCostCodeOnly` on the target job first — if set, every line must carry a
`costCodeCategoryId` and cannot be left unallocated.

`ignore` is reversible and takes an internal note. `delete` is destructive and needs
`confirm: true` — never delete a bill to tidy the queue.

### Watch for duplicates before allocating

Xero holds both quotes and invoices from some suppliers. On Ison & Wright, All Custom
Solutions appears as references `234` and `Q234` for an identical $1,161.60 — almost
certainly one job billed once. Allocating both would overstate that job's cost. Where
two bills from one supplier share an amount and differ only by a `Q` prefix, confirm
with Paul before processing either.

### Sequence the value, not the list

Bill values are steeply distributed. On Ison & Wright, 8 of 39 bills carried 79% of the
value and 12 carried 91%. Work each job's bills largest-first so a batch that stops
early has still captured the margin signal.

## Safety

- The `run_query` sweep is read-only. Processing timesheets and allocating bills are
  writes that change job costings and therefore margin, WIP and claimable positions.
- **Allocating a bill to the wrong job moves real money between jobs' P&Ls.** When the
  right job isn't obvious from the supplier, reference, date and site, ask — don't
  guess. A bill left unallocated for another day costs nothing; a misallocated one
  corrupts two jobs.
- Never mass-process the ignored backlog in one action. Work it in batches by job,
  confirm each batch, and expect some bills to be legitimately ignored — duplicates,
  credits, and genuine overheads that don't belong to any job.
- Do not change a bill's status to make a margin look better.

## Output contract

1. **Headline** — portfolio capture %, total exposure, jobs running off-book, ignored
   bill count and value.
2. **The two failure modes**, separated, each with its own job list.
3. **Fastest fixes first** — unprocessed timesheets, then the ignored bill review.
4. **Claim-gate breaches** — jobs billing ahead of costing, largest gap first.
5. **Category gaps** on the worst job, so someone knows which cost codes to chase.

Finish with what would actually change if the work were done: the capture rate, and
whether a real margin becomes visible. Do not quote a margin for any job under the
capture floor — state that it isn't known yet.

## Cadence

Weekly, alongside the receivables sweep. They are two halves of the same question:
receivables covers money owed to the business, cost capture covers money the business
has spent. Run together, they produce a real margin. Run apart, neither is trustworthy.
