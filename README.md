# TIGERIS AI OS — Stage 2 investor demonstration

An AI-native Sovereign Capital Intelligence Operating System, shown as a **functional prototype on clearly labelled fictional data**.
*Intelligence into Capability. Capital into Sovereign Advantage.*

> Stage 2 (intelligence cases, evidence and expert collaboration) runs entirely in the browser from seeded records. It has **no live feeds, no integrations, no AI execution, and no real authentication**. Sign-in fields and roles are simulated. It makes no production-readiness, sovereign-hosting or compliance claims.

## Run locally
Requires Node 20+.
```bash
npm install
npm run dev          # http://localhost:3000
# production build
npm run build && npm start
```
No environment variables or credentials are needed.

## What to review
1. `/` — institutional demonstration entry → **Enter demonstration** (pick a simulated role).
2. `/entry/energy` and `/entry/banking` — sector entry variants (also linked from `/workspaces` and the main entry). They converge on the same app.
3. `/workspaces` — all eight sectors. `/overview` — cross-sector overview with additive vs non-additive totals.
4. `/sector/<id>` for `energy banking insurance manufacturing logistics realestate infrastructure sovereign` — command centres.
5. Click any metric, signal, case, decision, evidence or entity for a detail drawer. Follow **signal → case → decision**.
6. Search (top bar), notifications (bell; read state persists), role selector, About (ⓘ), **Reset demonstration**.
7. `/methodology` for formulas and `/roadmap` for stage boundaries.
8. **Stage 2** — `/cases` (case list, filters, create from signal or standalone, duplicate prevention), `/cases/<CAS-ID>` (investigation workspace: overview, hypotheses & evidence, tasks, expert review, decision brief, activity), `/evidence` and `/evidence/<EVD-ID>` (readable illustrative evidence with citation anchors and versions), `/reviews` (expert queue).
9. Logistics walkthrough: switch role to **Analyst**, open `/sector/logistics`, follow **SIG-LOG-01 → CAS-LOG-01 → DEC-LOG-01**. See `REVIEW.md` Stage 2 section for the exact steps.

Roles are demonstration behaviour only: Analyst edits, Expert reviews, Approver is read-only (approvals arrive in Stage 5). There is no AI, no integration, and no message goes to any real person. History shown is local demonstration activity, not an audit log.

## Verification scripts
```bash
npm run verify          # typecheck + lint + data integrity
npm run verify:store    # Stage 2 store, state machine, brief staleness, persistence/migration checks
npm run build && npm start -- -p 3100 &
npm run e2e:stage2 -- http://localhost:3100   # Stage 2 browser workflows (Chromium)
npm run e2e -- http://localhost:3100 ./e2e-shots        # browser checks (Playwright + Chromium); BROWSER=firefox|webkit if installed
node scripts/a11y.mjs http://localhost:3100 ./review    # axe-core WCAG 2.x A/AA scan; writes findings (incl. unresolved items) + annotated screenshots
node scripts/review-shots.mjs http://localhost:3100 ./review/screenshots
```
Actual results of the last run, screenshots and the client walkthrough are in `REVIEW.md` and `review/`.

## Documents
`REVIEW.md` (review package) · `PRODUCT_SPEC.md` · `DESIGN_SYSTEM.md` · `DATA_MODEL.md` · `IMPLEMENTATION_PLAN.md` · `CLAUDE.md`

## Reference images
Three sign-in design references were supplied (images 1–3). They were used only to derive layout and design tokens; no screenshot is shown as a page. Mapping: image 1 (Al Noor Energy Authority) → `/entry/energy`; image 2 (Al Noor Financial Authority, Banking & Fintech) → `/entry/banking`; image 3 (generic TIGERIS institutional sign-in) → `/`. Imagery is original stylised SVG, not the reference photography.
