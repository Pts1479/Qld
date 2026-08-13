# What Paul needs to do — ordered

Everything on this list needs Paul. Anything Claude can do alone is already done or is
tracked in `reports/bill-backlog-progress.md`.

Ordered so that each section unblocks the next. **Section A is the blocker — nothing
else works until it's done.**

Last updated: 2026-08-13

---

## A. Unblock the agent — today, about 10 minutes

- [ ] **Approve the pending Wunderbuild tool call** in this session. There is one
  waiting. Until it clears, no timesheets can be processed and no sweep can run.

- [ ] **Pre-approve the Wunderbuild tools for scheduled sessions.** Every Wunderbuild
  call so far has raised an approval prompt. **A 6am agent cannot answer a prompt** — it
  will stall silently and you will think it ran. This is the single most likely reason
  the automation quietly does nothing.

- [ ] **Attach the Wunderbuild connector to the Routine** at claude.ai → Routines →
  `QLD Group — daily Wunderbuild reconcile` (`trig_01BnAeaqFoawSHdRnE5TMhLN`). The
  routine was created from a session that could not pass connectors through, so without
  this the fired session has no Wunderbuild access at all.

- [ ] **Confirm two readings of your instructions.** I assumed *"check coatings"* means
  **costings**, and *"upload and import jobs daily"* means the **daily Xero bill sync**.
  Both are built on that basis — correct me if either is wrong.

---

## B. Make the timesheet automation safe — before the first 6am run

- [ ] **Check pay rates are configured** in Wunderbuild for **Willie Hughes, Leo Le,
  Nic Crowe and Craig Borg**. The agent resolves rates from your rate cards and will
  **skip and flag any worker resolving to $0** rather than booking a zero. If rates are
  missing, 46 timesheets get flagged instead of processed and cost capture stays stuck.

- [ ] **Decide the timesheet-to-costing question.** Right now no timesheet is linked to
  a costing item — labour lands in a generic "Timesheet" bucket on every job. Processing
  gets the cost onto the job; linking it to the right cost line is a second step. Tell me
  whether you want that done per job, or left generic for now.

---

## C. Unblock the historical data — this week

- [ ] **Unarchive Kersey (job 1006) and Hallet (job 1024)** in the Wunderbuild UI. MCP
  `unarchive` fails after the first call in a session — reopening from the UI works.
  These two hold **$154,850** of the bill backlog across 68 bills. Tell me when they're
  open and I'll work straight through both.

- [ ] **Do not re-archive Ison & Wright (job 1005)** until its four held bills are
  decided. Reopening has proven unreliable, so closing it early could lock it.

- [ ] **Reconcile the 14 completed jobs against Xero** — $940,293 of contract value with
  zero progress-claim records in Wunderbuild. Most likely they were invoiced directly in
  Xero; the alternative is serious. **One hour settles it**, and until it is settled you
  have no reliable margin history on any completed job.

- [ ] **Get your accountant's nod** on allocating 2025 bills to completed jobs. My read
  is that it only changes Wunderbuild job costing and not Xero's P&L, since the expense
  is already booked there — but confirm before we do the remaining 25 jobs, not after.

---

## D. Decisions only you can make

- [ ] **All Custom Solutions `234` vs `Q234`** — both $1,161.60, same date, on job 1005.
  Almost certainly one job held in Xero as quote *and* invoice. **Which one is real?**
  Allocating both overstates the job by $1,162.

- [ ] **Max Fire Pits `INV-0552`, $740.32** — line reads *"Client gifts — Poulsen &
  Ison"*. It is a shared cost. **What split between the two jobs?**

- [ ] **Chilli Bins `742797`, $0.00** — nothing to allocate. Mark ignored permanently, or
  delete?

- [ ] **The four jobs with no markup recorded** — Kersey, David Poulsen, Ison & Wright,
  Geall. Contract equals estimated cost exactly on each, i.e. sold at cost on paper.
  **Is that a data-entry problem or were they genuinely quoted at cost?** The answer
  changes whether the −68.7% on Ison & Wright is a pricing failure or a recording one.

---

## E. Money on the table — not agent work, but the reason for all of it

- [ ] **Chase $279,902 of overdue invoices.** Start with **Linton inv 1042, $135,789, 81
  days** — one call covers 49% of the overdue book. Drafts are in
  `reports/recovery-ledger-2026-08-13.html`.

- [ ] **Raise the Pruim variation claim, $100,225.** Five variations, all approved by
  builder, work complete, never invoiced. Fastest money in the business.

---

## What "running correctly" looks like

The agent is not finished until all of these are true. Each run re-checks and reports
movement:

| Marker | Now | Target |
|---|---|---|
| Cost capture across active jobs | **26%** | **90%+** |
| Ignored bills outstanding | **$323,949** across 25 locked jobs | **$0** |
| Unprocessed timesheets | **46** | **0** |
| Jobs with no markup recorded | **4** | **0** |
| Overdue receivables | **$279,902** | chased or written off by decision |

**Until cost capture clears 90%, no margin figure on any job is quotable** — and the
agent will keep saying so rather than reporting a number it can't stand behind.

Once those markers are green, the agent's job changes from rebuilding the data to
holding the line, and the estimate-integrity check becomes worth building — because
there will finally be a real margin to check a quote against.
