# Implementation plan and stage boundaries

## Stage 1 — delivered (this build)
Shared foundation, entries, eight command centres, drawers, search, notifications, roles (simulated), reset, documentation, verification scripts.

## Stage 1 review and polish pass — delivered
Hydration-flash fix, chart palette ≥ 4.5:1, visual review fixes, drawer/dialog focus management, axe-core scan, expanded browser checks, review package (`REVIEW.md`, `review/`). Firefox/WebKit checks were not run (browsers not installed in the environment).

## Stage 1 modal-drawer accessibility fix — delivered
Drawer, About and Reset moved to the native `<dialog>` primitive (`ModalDialog`): inert background, named dialogs, contained focus, Escape/backdrop close, focus restoration, correct behaviour across linked-record navigation and Back. Sticky top bar regression fixed. 130 browser checks pass in Chromium; 1,315 axe colour-contrast nodes remain unresolved and are listed in `REVIEW.md` §8 for manual verification. Still not run: Firefox, WebKit, screen readers.

## Stage 2 — delivered: intelligence cases, evidence and expert collaboration
Case workspace and list, inspectable evidence, human tasks, expert queue and findings, deterministic brief compiler with versions and "Needs refresh", versioned persistence with migration and recovery, role restrictions, one seeded investigation per sector (primary: Logistics SIG-LOG-01 → CAS-LOG-01 → DEC-LOG-01). Verified in Chromium: typecheck, lint, build, 462 store checks, data integrity, 130 Stage 1 and 198 Stage 2 browser checks, axe scan (0 violations, unresolved contrast items carried forward). Not run: Firefox, WebKit, screen readers, human testing.

## Stage 3 — delivered: AI command and evidence-grounded assistance
`/ai-command`, an AI assistance tab on every case, a server-side provider adapter (Anthropic Messages API via the official SDK; credentials in server environment variables only), a deterministic demonstration mode, citation/claim validation, Analyst accept/edit/discard of proposals with recorded origin, run management (timeouts, cancellation, duplicate protection), provenance and Needs-refresh, persistence schema 3 with migration. Verified in Chromium with a mocked provider fixture: typecheck, lint, build, data, 462 store checks, 221 Stage 3 logic checks, 130 Stage 1, 198 Stage 2 and 168 Stage 3 browser checks, axe scan (0 violations; unresolved contrast items carried forward). **No real model call was made** (no credentials); Firefox, WebKit, screen readers and human testing were not run.

## Future stages (not started; described so boundaries are explicit)
| Stage | Capabilities | Notes |
|---|---|---|
| 4 | Scenario calculations | Parameterised what-ifs with explicit assumptions; supplies the calculations that briefs and assistants currently refuse to state. |
| 5 | Delegated authority; approval workflows | Authority matrix, recorded approvals and audit trail for decisions currently read-only (Approver is read-only until then). |
| 6 | Simulated execution | Execute approved decisions against a simulation. |
| 7 | Outcome tracking; institutional memory | Compare outcomes with expectations; retain lessons. |
| 8 | Data integration; system assurance | Real sources, shared backend persistence, real authentication, security, evaluation of model quality, and assurance. Required before any live-data, hosting, multi-user or compliance claim. |

## Stage 3 → 4 hand-over
Scenario outputs must enter the same validated-output and review path (no unreviewed numbers in briefs). Replace the “no financial impact” rules only where a calculation record exists. Keep run provenance, citation references and the `Result`-typed mutations.

## Known limitations
See `PRODUCT_SPEC.md` (prototype limitations) and the README.
