# Product specification — Stage 1

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

## Out of scope in Stage 1
Case editing, evidence document viewing, AI assistance, expert comments, scenario calculations, approvals/delegation, simulated execution, outcome tracking, data integration, Arabic/RTL, real authentication. See `IMPLEMENTATION_PLAN.md`.

## Capability claims
Nothing in Stage 1 implies live data, AI execution, integration health, production authentication, production readiness, sovereign hosting or certification.

## Prototype limitations
Single institution; static seed data; thresholds ("tolerances") are illustrative; approvals cannot be recorded; evidence has no documents; state is per-browser; English only; verified in headless Chromium only (Firefox/WebKit not run), no screen-reader testing. See `REVIEW.md`.
