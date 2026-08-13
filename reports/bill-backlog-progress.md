# Ignored bill backlog — allocation progress

Started 2026-08-13. Tracks the review of 244 supplier bills worth **$395,414 inc-GST**
that were marked IGNORED in Wunderbuild instead of allocated to a job.

Paul approved unarchiving all 26 completed jobs and working the full backlog
(2026-08-13). Bills are pre-coded to jobs by Xero tracking, so each job's set is
retrievable with `manage_bills list` + `jobId` + `importStatus: IGNORED`.

## Scale

Two MCP calls per bill (`get` for line-item ids, then `process`), so the full backlog
is roughly **490 calls** — a multi-session task. Work each job largest-bill-first: value
is steeply distributed and a batch that stops early still captures the margin signal.

## BLOCKER — `unarchive` fails via MCP after the first call

Ison & Wright (1005) unarchived successfully on the first attempt. **Every subsequent
unarchive has failed**, returning only "Something went wrong processing the request":

| Job | Attempts | Board stage | Result |
|---|---|---|---|
| Ison & Wright (1005) | 1 | In Construction | Succeeded |
| Kersey (1006) | 3 | Handover | Failed, no partial state |
| Justin and Lisa Hallet (1024) | 1 | In Construction | Failed, no partial state |

Job state was re-read after every failure: both jobs remain `archived` + `isLocked`,
so nothing is half-applied and there is nothing to clean up. Board stage is not the
differentiator — Hallet shares Ison & Wright's stage and still failed. It is not a
permissions issue; the error originates server-side in Wunderbuild.

**Workaround:** unarchive the jobs from the Wunderbuild UI, then allocation via MCP
works normally — `manage_bills process` has succeeded 8 times without error.

**Do not re-archive job 1005 until its remaining bills are allocated.** If unarchive
stays unreliable, re-archiving now would make it impossible to reopen and finish.

## Status by job

| Job | # | Ignored bills inc-GST | Allocated | Remaining | State |
|---|---|---|---|---|---|
| Ison & Wright | 1005 | $74,528 | **$71,465 (35 bills, 96%)** | $3,063 (4 bills, all held by decision) | **Complete** — unarchived, keep open pending the 4 held |
| Kersey | 1006 | $80,323 | — | $80,323 (26 bills) | **Blocked** — unarchive fails |
| Justin and Lisa Hallet | 1024 | $74,527 | — | $74,527 (42 bills) | **Blocked** — unarchive fails |
| Remaining 23 jobs | — | ~$166,036 | — | ~$166,036 | Not started |

Three jobs alone — 1005, 1006 and 1024 — hold **$229,378 of the $395,414**, i.e. 58%
of the entire backlog across 107 bills.

## Ison & Wright (job 1005, 17 Palm Drive) — COMPLETE

35 of 39 bills allocated ($71,465 inc-GST / $64,968 ex-GST). The 4 remaining are held
by decision, not by oversight — see Open items.

| | ex-GST |
|---|---|
| Contract | $51,317 |
| Cost booked before review | $21,620 |
| Cost added from 35 bills | $64,968 |
| **Actual cost** | **$86,588** |
| **Result** | **−$35,271** |
| **Gross margin** | **−68.7%** |

Cost breakdown after allocation:

| Category | Actual |
|---|---|
| Tiling | $28,320 |
| Timesheet | $14,125 |
| Pool Fence, Deck Screen & Battens | $9,743 |
| Purchase Order 01004 | $7,495 |
| BBQ Area | $5,725 |
| Painting | $5,563 |
| Glass & Balustrade | $4,245 |
| Plumbing | $3,403 |
| Stainless & Splashback | $2,295 |
| Materials — Hardware | $2,001 |
| Waste Removal | $973 |
| Timber | $875 |
| Plants & Garden Supplies | $709 |
| Machinery Hire | $637 |
| Pool & Spa | $250 |
| Landscape Supplies | $170 |
| Materials — Plumbing Fittings | $40 |
| Backlog allocation - materials | $20 |

**Tiling alone was $28,320 — 55% of the entire contract value**, across two CFS
invoices. The job also carries no markup: contract and estimated cost were both
recorded as $51,317, i.e. sold at cost on paper before a single overrun.

Cross-check: $71,465 inc-GST ÷ 1.1 = $64,968 ex-GST, which matches the movement in
`totalActualCost` exactly. Nothing was double-counted or dropped.

## Open items

### The 4 bills held on job 1005 — each needs a decision

| Bill | Supplier | Amount inc-GST | Why held |
|---|---|---|---|
| `742797` | Chilli Bins | $0.00 | Nothing to allocate. Mark ignored permanently or delete |
| `234` | All Custom Solutions | $1,161.60 | Duplicate pair — same amount, same date, references differ only by a `Q` |
| `Q234` | All Custom Solutions | $1,161.60 | Almost certainly one job held in Xero as both quote and invoice |
| `INV-0552` | Max Fire Pits | $740.32 | Line reads **"Client gifts — Poulsen & Ison"** — a shared cost across two jobs, needs a split, not a whole-value allocation |

Allocating both All Custom bills would overstate the job by $1,162; allocating the
full Max Fire Pits bill would overstate it by whatever share belongs to Poulsen.

- **Do not re-archive job 1005** until these four are resolved — reopening has proven
  unreliable via MCP.
- **One category naming inconsistency:** the first test bill ($22 Life Time Timbers)
  landed in "Backlog allocation - materials" before the trade-category convention was
  settled. Cosmetic; left as-is.
- **Four jobs carry no markup at all** — contract equals estimated cost exactly:
  Kersey, David Poulsen, Ison & Wright, Geall.

## Correction to the 2026-08-13 cost-capture report

Two findings in that report were overstated and are corrected here:

1. **The three Boshoff jobs have not started** (start dates 24 Aug and 1 Sep). Their 50%
   claims are deposits on unstarted work, so zero recorded cost is correct. That removes
   $114,981 of the $187,377 "off-book exposure" and three of the six claim-gate breaches.
2. **The ignored bills do not touch the live book.** Boshoff Landscaping and Gabriel
   Miller have no bills of any status. This backlog fixes margin *history*, which is what
   pricing decisions need — it does not recover cash or fix a current job.

The one genuine live cost-capture problem is **Linton**: 51% invoiced with $3,012 of cost
recorded. Miller, Poulsen and Purcell all finished within the last two weeks, so their
supplier invoices need a fortnight to land before their capture rate means anything.
