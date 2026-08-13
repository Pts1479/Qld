---
name: receivables-sweep
description: >
  Run the QLD Group / Sanctum claims-and-receivables sweep against live Wunderbuild
  data and produce a prioritised chase-and-claim action list. Use whenever Paul asks
  what money is owed, what's overdue, what can be claimed or invoiced, "where's our
  cash", "what have we not billed", "run the sweep", or asks for a debtors / aged
  receivables / WIP position. Also use before any cashflow, margin, or pricing
  discussion for QLD Group so the conversation starts from banked-vs-earned reality.
  Do not use for unrelated businesses or for creating/sending invoices without the
  explicit approval step described inside.
---

# Claims & Receivables Sweep

Turns the Wunderbuild book into a ranked list of *money already earned but not yet
banked*, and the specific action that converts each line into cash.

Built 2026-08-13 after a board review found QLD Group carrying ~$280K overdue and
~$100K of approved-but-unclaimed variations while contracts were being priced at
3.2% gross margin. This sweep exists so that position can never go unnoticed again.

## How to run it

1. Read `scripts/receivables-sweep.js` from this repo.
2. Pass its body to the Wunderbuild MCP `run_query` tool. It is read-only — it
   cannot create, modify, or send anything.
3. Report the results using the output contract below.

The script returns five sections: **A** outstanding invoices (aged, with client
contact details), **B** approved variations with a claimable balance, **C/D** jobs
where delivery is ahead of claiming and where cost capture is short, **E** completed
jobs carrying zero claim records.

## GST — do not mix the two

Progress-claim totals from Wunderbuild are **inc-GST**. Everything else — contract
totals, costings, variation subtotals — is **ex-GST**. Section A is inc-GST; sections
B–D are ex-GST. Never add a section A figure to a section B figure without
converting. Always label which you are quoting.

## Output contract

Report in this order, because it is descending order of how fast each converts to cash:

1. **Headline** — outstanding inc-GST, overdue inc-GST, claimable variations ex-GST,
   and the single largest recoverable line.
2. **Overdue invoices**, aged into 0–30 / 31–90 / 91–180 / 180+ buckets. Name the
   client, the invoice number, the amount and the days overdue. Lead with the largest.
3. **Claimable variations** — only `APPROVED_BY_BUILDER` lines are billable now.
   `AWAITING_CLIENT_APPROVAL` lines are a *chase-the-approval* action, not a claim.
4. **Delivery ahead of claiming** — any job where `claimedPct` materially trails site
   progress is unbilled work.
5. **Cost-capture gaps** — flag every job under 90%. Below that threshold the job's
   margin figure is not a margin, it is an artefact of missing data. Say so plainly
   rather than quoting the margin.
6. **Data-integrity** — section E. Present as an open question to reconcile against
   Xero, never as "you were never paid". Both readings are live until reconciled.

Finish with the three highest-value actions and nothing else. The point of the sweep
is a short list someone can work through, not a report.

## Thresholds

| Signal | Threshold | Action |
|---|---|---|
| Invoice overdue | > 7 days past due | Chase |
| Invoice overdue | > 90 days | Escalate — formal letter, decide on recovery |
| Invoice overdue | > 365 days | Decide: recover, formally demand, or write off. Carrying it distorts the debtors ledger |
| Approved variation unclaimed | any amount | Raise the claim |
| Variation awaiting client approval | > 14 days | Chase the approval |
| Cost capture on an active job | < 90% of estimated | Chase unbooked POs, timesheets, bills |
| Planned gross margin on a new quote | < 25% | Flag before it goes out |

## Claiming variations — the mechanics

All QLD Group jobs are `type: "CONTRACT"` (fixed price). Approved variations are
therefore claimed through `run_job_finances` → `create_progress_claim` using
`variationItems[]`, where each entry is `{ name, variationId, amount }` and the
top-level `amount` is the **full ex-GST claim total including those variation lines**.
GST is calculated server-side pro-rata — never send a GST value. The server caps the
cumulative claim at each variation's subtotal, so a partial claim is safe.

Cost-plus claiming (`items[]`) does not apply here and will be rejected.

## Safety — this is the part that matters

- The sweep itself is read-only. Creating a progress claim is not.
- **Never send a claim, invoice, or variation to a client without Paul explicitly
  approving that specific document, to that specific client, for that specific
  amount.** `send_progress_claim` emails a real invoice and cannot be unsent.
- Always run `preview_progress_claim` and show it before asking for approval.
- Draft chase emails for Paul to review and send himself. Do not send client
  correspondence directly from a sweep.
- A claim that is wrong is worse than a claim that is late — it costs trust with a
  client mid-project.

## Cadence

Weekly is right for a book this size. Monday morning, before the week is committed.
If it is run on a schedule, the only thing that should reach Paul unprompted is a
change: a new overdue line, a newly approved variation, or a job crossing the
cost-capture floor. A sweep that reports "no change" should stay silent.
