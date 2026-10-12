# Product specification — Stage 2

## Purpose
Demonstrate to investors how TIGERIS turns institutional data into signals, intelligence cases and decisions across sovereign sectors. Stage 1 is the shared foundation plus eight working command centres on fictional data.

## Fictional institution
**Al Noor Sovereign Group** with eight entities. Data seed `stage1-seed-1`, as of 2026-10-12 08:00 AST, reporting period Q3 2026 (monthly series Apr–Sep 2026 where noted).

| # | Sector | Entity | Analytical focus |
|---|---|---|---|
| 1 | Energy & Oil and Gas | Al Noor Energy Authority | Production, asset dependencies, supply resilience, capital exposure |
| 2 | Banking & Fintech | Al Noor Financial Authority | Capital, liquidity, credit exposure, payment resilience |
| 3 | Insurance | Al Noor Assurance Company | Claims, underwriting exposure, reserving assumptions, reinsurance concentration |
| 4 | Manufacturing | Al Noor Industrial Holdings | Plant capacity, production variance, supplier dependencies, capital exposure |
| 5 | Supply Chain & Logistics | Al Noor Logistics & Trade | Shipment delays, route dependencies, inventory buffers, supplier concentration |
| 6 | Real Estate | Al Noor Real Estate Holdings | Occupancy, lease expiries, development milestones, asset concentration |
| 7 | Infrastructure | Al Noor Infrastructure Authority | Project delivery, service availability, maintenance backlog, capital commitments |
| 8 | Sovereign Capital | Al Noor Sovereign Capital Office | Portfolio allocation, mandate alignment, concentration, liquidity and commitments |

## Stage 1 scope (delivered)
- Entries: generic (`/`), Energy (`/entry/energy`), Banking (`/entry/banking`); all use **Enter demonstration** and label fields as simulated; all converge on the shared app.
- Workspace/sector selection (8 sectors), cross-sector overview, persistent sidebar, institution + sector selectors, search, notifications (read/unread), simulated role selector (Analyst / Expert / Approver), "Demonstration data" indicator, About panel, Reset with confirmation.
- Eight command centres, each with: mandate summary; 4 metrics (unit, reporting period, formula); 2 charts with labelled axes and legends (table view available); ≥3 priority signals; ≥2 cases; ≥2 pending decisions; recent activity; underlying records.
- Detail drawers for metrics, signals, cases, decisions, entities and evidence, with stable IDs, related entities, evidence references (illustrative), timestamps and assumptions. Navigation signal → case → decision. Search and notifications open records.
- Role behaviour (demonstration only): the focus panel shows signals to triage (Analyst), cases requesting expert input (Expert), or decisions awaiting approval (Approver).
- Persistence in `localStorage`: selected sector, role, notification read state, entered flag.

## Stage 2 scope (delivered): cases, evidence and expert collaboration
Journey in every sector: **Signal → investigation → evidence → expert review → decision brief**.
- **Cases** (`/cases`): list with filters and search, empty states, create from a signal or standalone, duplicate prevention (one active case per signal; the existing case is offered). 18 cases: 8 fully investigated (`CAS-<code>-01`), others carry context links.
- **Case workspace** (`/cases/<id>`): question, summary, owner, priority, due date, linked signals/entities/mandate objectives; hypotheses with alternatives; supporting/contradictory/context evidence with stance history; assumptions, missing information, open questions; human investigation tasks; expert review; versioned decision brief; local demonstration activity.
- **Statuses**: Draft → Investigating → Expert review → Brief ready → Closed. A central state machine validates every move and lists the reasons for a blocked transition. Closed means the investigation ended (with a reason); it does not mean a decision was approved or executed.
- **Evidence**: at least three fictional items per sector, readable with stable paragraph/table refs (`P#`, `T#R#`), source, date, version history, limitations, freshness and an "Illustrative evidence" label. Links carry a stance; duplicates are prevented; unlinking keeps history.
- **Expert review**: the Expert records findings (type, text, valid citations), caveats and disagreements and returns *Reviewed* or *Revision requested*. Earlier rounds are retained. Experts can progress only expert/specialist tasks.
- **Decision brief**: "Compile brief" is deterministic (no AI). It assembles structured sections from case records, never invents financial figures, and states when no impact is calculated. Analysts can edit; every save is a new version with timestamp and evidence/finding refs. A brief shows **Needs refresh** when linked hypotheses, evidence versions, findings or task outcomes change after it was compiled; prior versions stay available.
- **Roles (demonstration behaviour, not security)**: Analyst edits; Expert reviews; Approver reads only.
- **Cross-surface consistency**: sector counts, search, notifications, drawers and the overview derive from the same case/evidence records.
- Persistence: versioned local store (`tigeris.demo.v2`) with Stage 1 migration, validation and a visible recovery message with an explicit reset.

## Out of scope in Stage 2
AI assistance (Stage 3), scenarios (4), delegated authority and approvals (5), simulated execution (6), outcome tracking (7), data integration and assurance (8). Shown as stage boundaries. No messages are sent to real experts.

## Out of scope in Stage 1
Case editing, evidence document viewing, AI assistance, expert comments, scenario calculations, approvals/delegation, simulated execution, outcome tracking, data integration, Arabic/RTL, real authentication. See `IMPLEMENTATION_PLAN.md`.

## Capability claims
Nothing in Stage 1 implies live data, AI execution, integration health, production authentication, production readiness, sovereign hosting or certification.

## Prototype limitations
Single institution; static seed data; thresholds ("tolerances") are illustrative; approvals cannot be recorded; evidence has no documents; state is per-browser; English only; verified in headless Chromium only (Firefox/WebKit not run), no screen-reader testing. See `REVIEW.md`.
