# Stage 1 review package

Build under review: branch `claude/gifted-pasteur-r27uuo`. Fictional data only; no Stage 2 work, no deployment.

## 1. Run it locally
Requires Node 20+ (verified on Node 22).
```bash
git checkout claude/gifted-pasteur-r27uuo
npm install
npm run dev                      # http://localhost:3000
# or a production build
npm run build && npm start -- -p 3100   # http://localhost:3100
```
No environment variables, credentials or network services are needed.

## 2. Client walkthrough (about 3 minutes)
1. **Entry** — open `/`. Note the "Simulated access" labels. Pick **Approver**, click **Enter demonstration**. (Branded variants: `/entry/energy`, `/entry/banking`, or the "Branded sector entry" links on the workspaces page.)
2. **Workspaces → Overview** — all eight sectors are listed. Open **Institutional overview**: group capital employed SAR 262.3 bn is additive; headline indicators are shown per sector and never summed; the Sovereign memo stake is excluded; reallocations are kept apart from new commitments.
3. **Sector** — click **Supply Chain & Logistics**. Read the mandate, four metrics, two charts (use **Table** for exact values) and the Approver focus panel.
4. **Signal** — open the critical signal **SIG-LOG-01 "Western trucking delay rate up to 14.4% from 9.4%"**. The drawer shows severity, evidence (illustrative), assumptions and the *Signal → Case → Decision* path.
5. **Case** — click **CAS-LOG-01 "Gateway corridor delay recovery"** (owner, next step, linked signals).
6. **Decision** — click **DEC-LOG-01 "Reroute 15% of Western trucking via Eastern Gulf Terminal"** (SAR 38 m new commitment, options, recommendation). The Stage 6 note explains approvals are outside Stage 1.
7. Try **search** ("Sahil"), the **bell** (opens records, read state persists across reload), the **role** selector, **About** (ⓘ) and **Reset demonstration**.

## 3. Screenshots (`review/screenshots/`)
JPEGs captured from the production build at 1440×900 (desktop, full page) and 390×844 (mobile, full page).
- Entry pages: `desktop-entry-main`, `desktop-entry-energy`, `desktop-entry-banking` (+ `mobile-…`)
- `desktop-workspaces`, `desktop-overview` (+ `mobile-…`)
- All eight command centres: `desktop-sector-{energy,banking,insurance,manufacturing,logistics,realestate,infrastructure,sovereign}` (+ `mobile-sector-…`)
- Overlays: `…-search-open`, `…-notifications-open`, `…-drawer-signal`, `…-drawer-case`, `…-drawer-metric`, `…-about`, `…-reset-confirm`
Regenerate with `node scripts/review-shots.mjs http://localhost:3100 ./review/screenshots`.

## 4. Fixes made in this review pass
**Reported issues**
- **Role hydration flash** — fixed. Persisted state is read after mount; every role-dependent surface (role selector, focus panel, sidebar role, notification badge, last-selected tag, role wording in drawers) now shows a neutral "Loading…" state until hydration finishes. The server HTML contains no role-specific content. Verified by an in-browser observer that records every rendered value from first paint: with *Expert* persisted, *Analyst* is never rendered.
- **Chart colour contrast** — palette changed to `#0e7c5f #a56a00 #2f6db5 #b8446f #6f56c0`. Every slot is ≥ 4.5:1 against the white chart surface (≥ 3:1 required); the dataviz validator passes lightness, chroma, CVD (ΔE 8.1 protan floor on the closest pair, which is legal with the markers, legend and table view that remain) and normal-vision (ΔE ≥ 17.7) checks. Legends, distinct marker shapes, direct labels and Table views are retained.
- **Related bug found and fixed** — a race could overwrite the sector chosen on a sector page with the stored sector during hydration; the selected sector now persists correctly (covered by a new test).

**Found in the visual review**
- Workspace cards: mandate text was clipped mid-sentence and cards were misaligned → cards now show the sector's four analytical focus themes, aligned metric panels, and the branded-entry link in the card header.
- Charts: rotated category labels collided with the axis title; y-axis title overlapped tick labels; end labels were cut off; reference-line labels collided with data labels; Logistics y-axis started at 2.5 → margins are computed from label widths, rotation only when needed, direct labels only when they fit, reference lines are in the legend, shorter sector chart names, Logistics axis starts at 0.
- Overview: unequal card heights from long subtitle/KPI label → shortened.
- Metric cards: status pills wrapped and misaligned → pinned to card bottom, no wrapping.
- Top bar: wrapped awkwardly on mobile and at 1280 px, search shrank to a few characters → compact mobile layout, icon-only Reset below 1536 px, minimum search width; the institution selector moved to the sidebar (visible on desktop and in the mobile menu).
- Underlying-records table: scrollable region is now keyboard-focusable and labelled.

**Accessibility**
- Drawer: focus moves into the panel on open, Tab/Shift+Tab are trapped, Escape closes, and focus returns to the exact opener (even after navigating signal → case → decision inside the drawer). Search, notification and menu openers also get focus back (search box, bell, menu button).
- About and Reset dialogs: focus in, Tab trapped, Escape closes, focus returns to the opener.
- Skip link, visible focus rings (light rings on emerald surfaces), labelled form controls, combobox ARIA for search.
- Contrast: gold text darkened (`gd-700` `#86672b → #7a5c22`, 6.2:1 on white, ≥ 5:1 on gold tint) and sidebar sub-labels raised; scrollable tables are keyboard-focusable.

## 5. Verification — actual results (final build, Chromium)
| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | pass |
| Lint | `npm run lint` | pass (0 errors, 0 warnings) |
| Production build | `npm run build` | pass (17 static pages) |
| Data integrity | `npm run verify:data` | pass — 196 records, 32 signals, group capital SAR 262,330 m |
| Browser checks | `npm run e2e` | **99/99 pass**, no console/page errors (`review/e2e-results.txt`) |
| Automated accessibility | `node scripts/a11y.mjs` | **42 scans, 0 violations** (`review/a11y-results.txt`) |
| Firefox | `BROWSER=firefox npm run e2e` | **not run — browser not installed** (`/opt/pw-browsers` contains Chromium only; I did not install browsers) |
| WebKit | `BROWSER=webkit npm run e2e` | **not run — browser not installed** |

The browser checks cover: all three entries; workspaces (8 sectors); each of the eight command centres (4 metrics, 2 charts with axis labels, ≥3 signals, ≥2 cases, ≥2 decisions, activity, demo indicator); sector switching; signal → case → decision; search (name, ID, empty state, keyboard); notifications (open record, read state, persistence); role/sector/notification persistence across reload; the no-flash hydration check; reset (UI state restored and the `localStorage` key removed); About and Reset including cancel; keyboard and focus tests listed above; overview total (262,330); and no horizontal overflow on 15 pages at 390 px.

**Accessibility scan scope:** axe-core with the WCAG 2.0/2.1 A and AA rule sets on all pages and open-overlay states (table view, drawer, notifications, search results, About, Reset) at desktop and mobile widths. 37 of the 42 scans report "incomplete" items — checks axe could not decide automatically (typically contrast over translucent/gradient backgrounds and SVG text). Those are not violations but have **not been verified manually**. No screen-reader (NVDA/VoiceOver/JAWS) testing, no real-device testing, and no formal WCAG conformance audit was performed.

**Manual browser exercise:** About and Reset were also driven by hand-written Playwright sessions with screenshots (role Approver + all notifications read + sector Sovereign persisted across a reload; Reset then returned to `/workspaces` with Analyst, 11 unread, Energy last-selected, and no stored key). This is scripted browser automation, not a person using a desktop browser.

## 6. Remaining limitations
- Firefox and WebKit/Safari are untested; only Chromium (headless) was exercised. No physical mobile devices.
- No screen-reader testing; axe "incomplete" items need human review; focus trapping is implemented in script (background is not `inert`).
- Briefly shows "Loading…" in role-dependent areas on first paint (by design, to avoid showing a wrong role).
- Cases, decisions and notifications are read-only; no approvals; evidence has no documents.
- English only (no Arabic/RTL); one fictional institution; state is per browser.
- Tolerances, decision amounts and uplift ranges are illustrative.
- Imagery is original stylised SVG, not photographic; sign-in references were adapted, not reproduced.
- No claims of production readiness, sovereign hosting or compliance certification are made.

## 7. Client-review checklist
- [ ] Entries read as intended and make the simulated-access status obvious.
- [ ] Each command centre feels distinct and credible for its sector.
- [ ] Charts are readable (try the Table view) and the additive / non-additive treatment is acceptable.
- [ ] Stage-boundary notices are clear.
- [ ] Which browsers/devices must be signed off before Stage 2 (Firefox and Safari have not been run)?
