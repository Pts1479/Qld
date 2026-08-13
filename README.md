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
| `.claude/skills/receivables-sweep/` | Skill that runs the claims-and-receivables sweep and produces a ranked chase-and-claim list |
| `scripts/receivables-sweep.js` | Read-only query, pasted into the Wunderbuild MCP `run_query` tool |
| `reports/` | Dated output. Each report is a snapshot, not a living document |

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
2. **Cost-capture agent** — chase unbooked POs, unprocessed timesheets and
   unallocated bills until actuals reach 90% of estimate
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
