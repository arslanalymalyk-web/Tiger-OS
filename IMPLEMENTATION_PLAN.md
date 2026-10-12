# Implementation plan and stage boundaries

## Stage 1 — delivered (this build)
Shared foundation, entries, eight command centres, drawers, search, notifications, roles (simulated), reset, documentation, verification scripts.

## Stage 1 review and polish pass — delivered
Hydration-flash fix, chart palette ≥ 4.5:1, visual review fixes, drawer/dialog focus management, axe-core scan, expanded browser checks, review package (`REVIEW.md`, `review/`). Firefox/WebKit checks were not run (browsers not installed in the environment).

## Stage 1 modal-drawer accessibility fix — delivered
Drawer, About and Reset moved to the native `<dialog>` primitive (`ModalDialog`): inert background, named dialogs, contained focus, Escape/backdrop close, focus restoration, correct behaviour across linked-record navigation and Back. Sticky top bar regression fixed. 130 browser checks pass in Chromium; 1,315 axe colour-contrast nodes remain unresolved and are listed in `REVIEW.md` §8 for manual verification. Still not run: Firefox, WebKit, screen readers.

## Stage 2 — delivered: intelligence cases, evidence and expert collaboration
Case workspace and list, inspectable evidence, human tasks, expert queue and findings, deterministic brief compiler with versions and "Needs refresh", versioned persistence with migration and recovery, role restrictions, one seeded investigation per sector (primary: Logistics SIG-LOG-01 → CAS-LOG-01 → DEC-LOG-01). Verified in Chromium: typecheck, lint, build, 462 store checks, data integrity, 130 Stage 1 and 198 Stage 2 browser checks, axe scan (0 violations, unresolved contrast items carried forward). Not run: Firefox, WebKit, screen readers, human testing.

## Future stages (not started; described so boundaries are explicit)
| Stage | Capabilities | Notes |
|---|---|---|
| 3 | AI assistance grounded in evidence | Retrieval over evidence records, citations, refusal when ungrounded. Needs model credentials and an evaluation plan. |
| 4 | Scenario calculations | Parameterised what-ifs with explicit assumptions; supplies the calculations the brief currently lacks. |
| 5 | Delegated authority; approval workflows | Authority matrix, recorded approvals and audit trail for decisions currently read-only (the Approver role is read-only until then). |
| 6 | Simulated execution | Execute approved decisions against a simulation. |
| 7 | Outcome tracking; institutional memory | Compare outcomes with expectations; retain lessons. |
| 8 | Data integration; system assurance | Real sources, shared backend persistence, real authentication, security and assurance. Required before any live-data, hosting, multi-user or compliance claim. |

## Stage 2 → 3 hand-over
Keep IDs, the `?r=` drawer contract and `Result`-typed mutations. A backend can replace `WorkState` persistence behind `persist.ts`. AI assistance must read the same evidence blocks and refs so citations stay checkable.

## Known limitations
See `PRODUCT_SPEC.md` (prototype limitations) and the README.
