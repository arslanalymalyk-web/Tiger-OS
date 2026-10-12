# CLAUDE.md — TIGERIS project instructions

TIGERIS is an **AI-native Sovereign Capital Intelligence Operating System** shown as an **investor-demonstration prototype**.
Tagline: *Intelligence into Capability. Capital into Sovereign Advantage.*

## Hard rules
- **All data is fictional demonstration data.** One fictional institution ("Al Noor Sovereign Group") with eight fictional sector entities. Currency is **SAR**. Label evidence as illustrative.
- **Never claim**: live feeds, AI execution, integration health, production authentication, production readiness, sovereign hosting, or compliance certification. Sign-in fields and the Analyst/Expert/Approver selector are **simulated access**, not security controls.
- The primary entry action is labelled exactly **"Enter demonstration"**.
- All **eight sectors** must stay selectable with a working, distinct command centre. No "coming soon" sectors.
- Later-stage capabilities are shown as explicit **stage boundaries** (`StageBoundary` component), never as unexplained inactive buttons.
- Do not begin Stage 2 or deploy publicly unless asked.

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 (tokens in `src/app/globals.css`) · lucide-react icons. Charts are hand-written SVG (`src/components/Charts.tsx`). No backend, no env vars.
`AGENTS.md` notes this Next.js version differs from older ones: read `node_modules/next/dist/docs/` before using framework APIs.

## Layout
- `src/data/` — central typed data layer (one file per sector, `index.ts` assembles records, search, totals). `helpers.ts`, `roadmap.ts`.
- `src/lib/types.ts` — all record types. `src/state/DemoProvider.tsx` — persisted state (sector, role, notification read state).
- `src/components/` — shell, top bar, record drawer, charts, command centre, views, entry pages.
- `src/app/` — `/` (generic entry), `/entry/energy`, `/entry/banking`, and `(shell)` group: `/workspaces`, `/overview`, `/sector/[sectorId]`, `/methodology`, `/roadmap`.
- `scripts/verify-data.ts` (integrity checks), `scripts/e2e.mjs` (Playwright browser checks).

## Conventions
- Records have stable IDs: `ENT|MET|SIG|CAS|DEC|EVD|ACT|CHT-<SECTORCODE>-nn` (codes ENR BNK INS MFG LOG REA INF SOV), `NTF-nn`, `XLK-nn`.
- Metrics and charts are **computed from entity records** via functions; never hard-code a displayed number. Signal text that quotes numbers must interpolate computed values.
- Distinguish **additive** amounts (capital employed, commitments) from **non-additive** indicators (ratios, days, %). Never sum non-additive values. Memo entities use `excludeFromGroupTotal`.
- Records open in the drawer through `?r=<ID>` (`useRecordNav`). Use it for every link to a record.
- Series arrays align to `Sector.periods`; the last value must equal the snapshot attribute.

## UI rules learned in review
- Anything that depends on persisted state (role, sector, read state) must render a neutral state until `useDemo().hydrated` is true — never show defaults that then change.
- Dialogs/drawers: focus in on open, trap Tab (`src/lib/focus.ts`), Escape closes, return focus to the opener. Link to records only through `useRecordNav().openRecord`.
- Chart colours come from `SERIES_COLORS` (≥ 4.5:1 on white); keep legend + markers + Table view. Re-run `scripts/a11y.mjs` after UI changes; scrollable regions need `tabIndex={0}` + `role="region"` + a label.
- Gold text uses `gd-700` (#7a5c22) only.

## Commands
`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` · `npm run verify:data` · `npm run verify` (typecheck+lint+data) · `npm run e2e` (needs `npm start -- -p 3100` and Chromium; `BROWSER=firefox|webkit` if installed) · `node scripts/a11y.mjs` (axe-core) · `node scripts/review-shots.mjs`.
Run `verify:data` after editing any seed file.
