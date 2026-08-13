# QLD Group / Sanctum — AI Operating Layer

Internal tooling for QLD Group (trading as Sanctum), a Queensland outdoor
construction business. The purpose of this repo is narrow and deliberate:

> **Deploy AI to run the business, not as a product to sell.**

That decision came out of a board review on 2026-08-13. The short version: the
active book was priced at **3.2% gross margin on contracts** (21.8% only once
variations are counted), just **20.3% of costs were being booked**, and roughly
**$390K of already-earned money** was sitting uncollected — $279,902 overdue plus
$100,225 of builder-approved variations that had never been invoiced. Building
software to sell to other trades would not have touched any of that.

## What's here

| Path | What it does |
|---|---|
| `.claude/skills/daily-reconcile/` | **The daily agent.** Matches bills, claims, costings, POs and timesheets field-by-field against every active job; reports exceptions only |
| `.claude/skills/receivables-sweep/` | Deep look at money owed — aged debtors, claimable variations |
| `.claude/skills/cost-capture/` | Deep look at money spent — ignored bills, unprocessed timesheets, empty costing lines |
| `scripts/daily-reconcile.js` | Read-only sweep behind the daily agent |
| `scripts/receivables-sweep.js` | Read-only query, pasted into the Wunderbuild MCP `run_query` tool |
| `scripts/cost-capture-sweep.js` | Read-only query for the cost side. Bills are fetched separately via `manage_bills` |
| `state/reconcile-latest.json` | Previous run's fingerprints, so the daily agent reports changes rather than repeating itself |
| `reports/` | Dated output. Each report is a snapshot, not a living document |

## The daily agent

Runs at **7am Brisbane**, ahead of the day being committed. One pass over the active
book, reporting only records whose fields don't line up:

- a bill with no job coding, or coded but never allocated to a costing category
- a purchase order raised and never received, so committed cost never became actual
- a timesheet unprocessed past 14 days, or processed but not linked to a costing item
- an approved variation never claimed, or an invoice past its grace period
- a job billing the client more than 25 points ahead of its recorded cost
- totals disagreeing with the sum of their parts

**If nothing is new and nothing resolved, it says nothing.** A daily report that repeats
yesterday gets ignored, which defeats the point.

Schedule: `trig_01BnAeaqFoawSHdRnE5TMhLN`, cron `0 21 * * *` UTC. The routine was created
from a session that could not pass connectors through, so the **Wunderbuild connector is
attached manually via the claude.ai Routines UI**. If a run reports no data or cannot
reach Wunderbuild, check that first — the sweep itself is validated.

## Running the sweep

Ask Claude to *run the receivables sweep*, or invoke the skill directly. It reads
live Wunderbuild data and returns five sections: aged outstanding invoices with
client contacts, approved variations with a claimable balance, jobs where delivery
has run ahead of claiming, cost-capture gaps, and completed jobs carrying no claim
records.

The sweep is **read-only**. It cannot create, modify, or send anything.

## Ground rules

- **Nothing goes to a client without Paul approving that specific document, to that
  specific client, for that specific amount.** `send_progress_claim` emails a real
  invoice and cannot be unsent. Always preview first.
- **Never mix GST bases.** Progress-claim totals from Wunderbuild are inc-GST;
  contract, costing and variation figures are ex-GST. Label which you're quoting.
- **Below 90% cost capture, a margin figure is not a margin.** Say the data is
  missing rather than quoting the number.

## Roadmap

Ordered by how fast each converts to cash. Cost capture sits second because until
costs are actually booked, nothing downstream is measurable.

1. **Claims & receivables sweep** — built
2. **Cost-capture agent** — built. First run found **244 supplier bills worth
   $395,414 inc-GST marked IGNORED** instead of allocated to a job, 46 unprocessed
   timesheets, and 20.3% portfolio cost capture. The ignored bills cluster mid-2025
   to April 2026 and appear to have stopped since, so it is a backlog to clear rather
   than an active leak
3. **Estimate-integrity check** — block any quote leaving below 25% gross margin;
   flag scope categories missing against comparable jobs (Pruim went out underscoped
   by ~58%)
4. **Single-scope proposal assembler** — one Sanctum document, one price, one
   contract, replacing the split quotes that produced three separate contracts at
   7 Langura Street
5. **Photo-to-variation capture** — site photo in, drafted variation out
6. **Lead triage** — score the open pipeline against the ≥$300K profile

## Reopening the product question

Not before 2027-08, and only if all three hold: average contract value above $400K,
**verified** gross margin of 25–40% with cost capture above 90%, and the combined
proposal format converting without discounting. If those hold there's a method worth
encoding. If they don't, there was never a product.
