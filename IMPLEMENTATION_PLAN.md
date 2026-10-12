# Implementation plan and stage boundaries

## Stage 1 — delivered (this build)
Shared foundation, entries, eight command centres, drawers, search, notifications, roles (simulated), reset, documentation, verification scripts.

## Stage 1 review and polish pass — delivered
Hydration-flash fix, chart palette ≥ 4.5:1, visual review fixes, drawer/dialog focus management, axe-core scan, expanded browser checks, review package (`REVIEW.md`, `review/`). Firefox/WebKit checks were not run (browsers not installed in the environment).

## Stage 1 modal-drawer accessibility fix — delivered
Drawer, About and Reset moved to the native `<dialog>` primitive (`ModalDialog`): inert background, named dialogs, contained focus, Escape/backdrop close, focus restoration, correct behaviour across linked-record navigation and Back. Sticky top bar regression fixed. 130 browser checks pass in Chromium; 1,315 axe colour-contrast nodes remain unresolved and are listed in `REVIEW.md` §8 for manual verification. Still not run: Firefox, WebKit, screen readers.

## Future stages (not started; described so boundaries are explicit)
| Stage | Capabilities | Notes |
|---|---|---|
| 2 | Intelligence case management; evidence inspection | Editable cases (notes, tasks, status); open and annotate evidence documents. Needs a persistence layer beyond localStorage. |
| 3 | AI assistance grounded in evidence | Retrieval over evidence records, citations, refusal when ungrounded. Needs model credentials and an evaluation plan. Not in Stage 1. |
| 4 | Expert collaboration | Requests to experts on flagged cases (`expertInputRequested`), comments, attachments. |
| 5 | Scenario calculations | Parameterised what-ifs (hub outage, liquidity stress, reserve shock) with explicit assumptions. |
| 6 | Delegated authority; approval workflows | Authority matrix, recorded approvals and audit trail for decisions currently read-only. |
| 7 | Simulated execution | Execute approved decisions against a simulation. |
| 8 | Outcome tracking; institutional memory | Compare outcomes with expectations; retain lessons. |
| 9 | Data integration; system assurance | Real sources, integration health, security and assurance work. Required before any live-data, hosting or compliance claim. |

## Stage 1 → 2 hand-over
Keep record IDs and the `?r=` drawer contract; replace the `StageBoundary` notices in `RecordDrawer` and `CommandCentre` with real controls; introduce a store for mutable cases while leaving the seed immutable for Reset.

## Known limitations
See `PRODUCT_SPEC.md` (prototype limitations) and the README.
