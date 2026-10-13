# TIGERIS AI OS — Stage 3 investor demonstration

An AI-native Sovereign Capital Intelligence Operating System, shown as a **functional prototype on clearly labelled fictional data**.
*Intelligence into Capability. Capital into Sovereign Advantage.*

> Stage 3 (AI command and evidence-grounded assistance) builds on Stage 2 (intelligence cases, evidence and expert collaboration). The app runs entirely in the browser from seeded records. It has **no live feeds, no integrations, no AI execution, and no real authentication**. Sign-in fields and roles are simulated. It makes no production-readiness, sovereign-hosting or compliance claims.

> **ServiceTrace** — a real multi-tenant maintenance operations platform (database, auth, workflow, EN/AR) is being built beside this demo under `/app`. See `docs/PLATFORM.md`.

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

10. **Stage 3** — `/ai-command` (assistants, approved capabilities, run history) and the **AI assistance** tab on every case (`/cases/<CAS-ID>?tab=ai`): exact evidence scope shown before a run, five operations (summarize, conflicts and missing information, suggest tasks, draft a brief, answer a question), cited output separated into source-supported findings / inferences / contradictions / missing information / next steps, and Analyst accept/edit/discard of proposed tasks and briefs.

**No provider is configured by default.** The app then says “AI provider not configured”, keeps the Stage 2 deterministic *Compile brief*, and offers a clearly labelled **deterministic demonstration** (rule-based, *not AI*). Nothing is silently switched to demonstration mode after an AI failure.

Roles are demonstration behaviour only: Analyst edits, Expert reviews, Approver is read-only (approvals arrive in Stage 5). There is no AI, no integration, and no message goes to any real person. History shown is local demonstration activity, not an audit log.

## AI provider setup (optional, server-side only)
Stage 3 uses one provider: the **Anthropic Messages API**, through the official `@anthropic-ai/sdk` package, called only from the Next.js server (`/api/ai/run`). See Anthropic's official API documentation (platform.claude.com/docs) for keys, models and billing.
1. Create an API key in your Anthropic console. Usage may be billed by Anthropic; this repository provisions nothing and needs no credentials to build or test.
2. Copy `.env.example` to `.env.local` (git-ignored) and set **both**: `ANTHROPIC_API_KEY` and `TIGERIS_AI_MODEL` (an explicit model ID from Anthropic's current model list, for example `claude-opus-5-5`; there is deliberately no default). Optional: `TIGERIS_AI_TIMEOUT_MS` (default 45000).
3. Restart the server (`npm run build && npm start`, or `npm run dev`). `/ai-command` then shows the provider and model name. The key is never sent to the browser, logged or stored in local state.
4. Optional smoke test of the real path (one small request, fictional data): `ANTHROPIC_API_KEY=… TIGERIS_AI_MODEL=… npm run smoke:provider`. Without credentials it prints “NOT PERFORMED”.
Automated browser tests use a **mock-provider fixture** (`TIGERIS_AI_TEST_MOCK=1`, labelled “Mocked provider, not AI”); never set it for a demonstration.

## Verification scripts
```bash
npm run verify          # typecheck + lint + data integrity
npm run verify:store    # Stage 2 store, state machine, brief staleness, persistence/migration checks
npm run verify:ai       # Stage 3: scope, citation/claim validation, runs, accept/discard, roles, persistence (mock provider fixture; no real model call)
npm run build && npm start -- -p 3100 &
npm run e2e:stage2 -- http://localhost:3100   # Stage 2 browser workflows (Chromium)
# Stage 3: needs a plain server on :3100 and a mock-fixture server on :3101
TIGERIS_AI_TEST_MOCK=1 TIGERIS_AI_TIMEOUT_MS=3000 npm start -- -p 3101 &
npm run e2e:stage3 -- http://localhost:3100 http://localhost:3101
npm run e2e -- http://localhost:3100 ./e2e-shots        # browser checks (Playwright + Chromium); BROWSER=firefox|webkit if installed
node scripts/a11y.mjs http://localhost:3100 ./review    # axe-core WCAG 2.x A/AA scan; writes findings (incl. unresolved items) + annotated screenshots
node scripts/review-shots.mjs http://localhost:3100 ./review/screenshots
```
Actual results of the last run, screenshots and the client walkthrough are in `REVIEW.md` and `review/`.

## Documents
`REVIEW.md` (review package) · `PRODUCT_SPEC.md` · `DESIGN_SYSTEM.md` · `DATA_MODEL.md` · `IMPLEMENTATION_PLAN.md` · `CLAUDE.md`

## Reference images
Three sign-in design references were supplied (images 1–3). They were used only to derive layout and design tokens; no screenshot is shown as a page. Mapping: image 1 (Al Noor Energy Authority) → `/entry/energy`; image 2 (Al Noor Financial Authority, Banking & Fintech) → `/entry/banking`; image 3 (generic TIGERIS institutional sign-in) → `/`. Imagery is original stylised SVG, not the reference photography.
