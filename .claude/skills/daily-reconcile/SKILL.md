---
name: daily-reconcile
description: >
  Daily reconciliation of the whole Wunderbuild book for QLD Group / Sanctum — supplier
  bills, progress claims, costings, purchase orders and timesheets matched field by field
  against every active job, returning only the records that don't line up. Use for the
  scheduled daily run, and whenever Paul asks "what needs attention", "reconcile the
  jobs", "what's out of sync", "run the daily check", or wants one view across money in,
  money out and cost capture. For a single domain in depth, use receivables-sweep (money
  owed) or cost-capture (money spent) instead — this skill is the daily net that catches
  breaks in all of them.
---

# Daily Reconcile

One pass over the book each morning. Reports **exceptions only** — records whose fields
fail to match — and stays silent when nothing changed.

Supersedes running `receivables-sweep` and `cost-capture` separately on a daily basis.
Those remain the right tools for a deep look at one side; this is the net.

## What "matching all fields" means here

Every record has to bind to a job, and usually to a costing line inside that job. A
break in any of these links is an exception:

| Record | Must bind to | Via | Break looks like |
|---|---|---|---|
| Supplier bill | a job | `items[].job` (Xero tracking) | `job: null` — uncoded line |
| Bill line | a costing category | `costingCategoryName` / `costingCategoryId` at process time | lands in Unallocated |
| Bill | a purchase order, if one exists | `purchaseOrderId` + `purchaseOrderItemId` | cost booked twice, once via PO and once via bill |
| Purchase order | a receipt | status `RECEIVED` | committed cost never becomes actual cost |
| Timesheet | a costing item | `costingItemId` | labour lands in a generic "Timesheet" bucket |
| Timesheet | a rate | rate cards at processing | `$0` rate — worker not configured |
| Variation | a progress claim | `variationItems[]` | approved work never invoiced |
| Progress claim | a receipt | `receivedTotal` | invoice raised, money not collected |
| Job | its own parts | Σ category actuals = `totalActualCost` | totals drifting from their components |

## Running it

Two halves. Both are read-only.

1. **Jobs, timesheets, costings, POs, claims, variations** — read
   `scripts/daily-reconcile.js` and pass its body to `run_query`. Returns the exception
   list plus a `fingerprints` array for diffing.
2. **Supplier bills** — not in the `wb` query API. Run `manage_bills` action `list` with
   `importStatus: "UNPROCESSED"` (today's arrivals) and again with `"IGNORED"` (the
   backlog, and a regression check that the ignore habit hasn't restarted).

## Report only what changed

A daily agent that repeats yesterday's list is noise, and noise gets ignored — which
defeats the point.

- Compare this run's `fingerprints` against `state/reconcile-latest.json`.
- Report **new** exceptions and **resolved** ones. Summarise the unchanged as a count.
- Write the new snapshot back to `state/reconcile-latest.json` and commit it.
- **If nothing is new and nothing resolved, say nothing.** No message, no commit.

Escalate immediately, outside the diff, for any of these regardless of age:

- A new `IGNORED` bill dated after 2026-04 — the habit that cost $395,414 restarting.
- An invoice crossing 90 days overdue.
- A job crossing 100% claimed while below the capture floor.
- Any `COSTING_SUM_DRIFT` or `CLAIM_SUM_DRIFT` — totals disagreeing with their parts
  usually means something was written outside the normal flow.

## Write policy — the part that matters

Paul authorised automatic timesheet processing on 2026-08-13. Everything else is still
proposed, not done. Three tiers:

**Automatic, every run — timesheets.**
Process every unprocessed timesheet older than the threshold with
`run_job_finances` → `process_timesheet`, `useDefaultRate: true`.

Guardrails, all of them binding:
- **`useDefaultRate: true` only.** Never a hand-typed, estimated or looked-up rate.
  There is no market-rate lookup in this product and a guessed rate silently corrupts
  the job's margin.
- **Check rates first** with `manage_timesheets` action `get_rates` over the batch. Any
  timesheet resolving to **$0 is skipped and flagged**, never processed — a zero booking
  looks like progress and changes nothing.
- **Skip timesheets on a locked or archived job**; flag them for a UI unarchive instead.
- **Cap at 60 per run.** A larger backlog is worked across runs so a bad batch can't
  run away.
- **Report every one processed** — job, worker, date, rate, cost booked.
- Reversible via `unprocess_timesheet` if a batch turns out wrong.

**Automatic, every run — unambiguous bills.**
Allocate a bill only when ALL of these hold; anything failing a test is flagged instead:
- `items[].job` is populated on **every** line (a null line means a human decides).
- The job is active and unlocked.
- No other bill from the same supplier shares its amount and date (the `234`/`Q234`
  duplicate signature).
- The line description names one site, not two (`"Client gifts — Poulsen & Ison"` is a
  shared cost needing a split, not an allocation).

**Never without an explicit, specific instruction:**
- Sending anything to a client or supplier. `send_progress_claim`, `send_variation`,
  `send_purchase_order` email real documents and cannot be unsent.
- Raising a progress claim, including for approved variations. Money going out the door
  to a client stays a human decision.
- Allocating a bill whose job coding is missing or contradicts the site.
- Deleting a bill, or ignoring one to tidy the queue.
- Re-archiving a job that still has unallocated bills.

**The asymmetry to hold on to:** a bill left unallocated for another day costs nothing.
A bill allocated to the wrong job moves real money between two jobs' P&Ls and corrupts
both. When the target isn't obvious from supplier, reference, date and site — flag it.

## Known traps

Learned the hard way against live data; each one cost a wrong conclusion or a failed call.

- **A job that hasn't started should have no cost.** Three Boshoff jobs with future start
  dates were reported as "running off-book" when their 50% deposit claims were entirely
  normal. The script now excludes unstarted jobs from capture and claim-gate checks.
- **Recently finished jobs need ~2 weeks** before their capture rate means anything —
  supplier invoices lag the site.
- **Zero hours and zero rate on an unprocessed timesheet is normal.** Both are computed
  at processing time. It is not corrupt data and it does not block processing.
- **`manage_bills process` requires `items[]`.** Passing only a `jobId` fails with a
  generic "Something went wrong" that names no field.
- **Completed jobs are archived AND locked.** `manage_job unarchive` clears both; there
  is no separate unlock. **As at 2026-08-13 unarchive fails via MCP after the first call
  in a session** — reopen from the Wunderbuild UI instead, then allocate via MCP.
- **Watch for supplier duplicates**: quote and invoice both synced from Xero, same
  amount, references differing by a `Q` prefix. Confirm before allocating either.

## The flagged issue list

Every run ends with a single numbered list Paul can work down — one line per issue, most
costly first, each naming the job, the amount and the one action that clears it. That
list IS the deliverable; the exception JSON is working material.

Group it in this order, because it is descending order of how fast each converts:

1. **Money owed to us** — overdue invoices, approved variations never claimed.
2. **Money we owe** — bills unpaid and unallocated.
3. **Data that is wrong** — capture below floor, claim-gate breaches, totals drift.
4. **Blocked** — anything needing a UI unarchive or a decision only Paul can make.

Then a one-line **"fixed automatically this run"** summary: timesheets processed, bills
allocated, with totals. Never bury an automatic write — if the agent changed the books,
say so on the same screen as the flags.

## Cadence and scope

**Two runs daily, Brisbane time:**

| Run | Purpose |
|---|---|
| **6am** | Overnight sync — bills that arrived from Xero, yesterday's timesheets. Sets up the day. |
| **3pm** | Mid-afternoon — catches the day's site activity before knock-off, so nothing sits overnight. |

The 3pm run diffs against the 6am snapshot, not against yesterday, so it reports only
what moved during the day. Both write to `state/reconcile-latest.json`.

Covers **active jobs** in full — completed jobs don't change day to day and are handled
by the backlog review in `reports/bill-backlog-progress.md`.

Keep the run inside `run_query` limits: it fans out six calls per active job, so it is
comfortable to about 20 active jobs. Past that, split the sweep by board stage rather
than raising the timeout.

## Until the data is real

This agent is not finished. It runs against a book that is still being rebuilt, and the
following are known-open — each run should re-check them and report movement:

- **Cost capture is 26%.** The floor is 90%. Until it clears, no margin figure on any
  job is quotable, and the agent should keep saying so rather than reporting a number.
- **$323,949 of ignored bills remain** across 25 completed jobs, all locked. Blocked on
  UI unarchive.
- **Four bills held on job 1005** pending Paul's decisions; job stays unarchived.
- **No markup recorded** on Kersey, David Poulsen, Ison & Wright and Geall — contract
  equals estimated cost, so they were sold at cost on paper.

When cost capture clears 90% and the ignored backlog is empty, the agent's job changes
from rebuilding to holding the line — and the estimate-integrity check (workflow 3)
becomes worth building, because there will finally be a real margin to check against.
