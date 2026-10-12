# Design system

## Reference mapping
| Supplied image | Content | Used for |
|---|---|---|
| 3 (`3.webp`) | Generic TIGERIS "Institutional sign-in", gold T mark, serif headlines, workspace chips | `/` (`GenericEntry`) |
| 2 (`2.webp`) | Al Noor Financial Authority, Banking & Fintech: full-bleed skyline, centred card | `/entry/banking` (`BankingEntry`) |
| 1 (`1.webp`) | Al Noor Energy Authority: split layout, three pillars, SSO card | `/entry/energy` (`EnergyEntry`) |

Images are sign-in designs only; dashboards are derived from requirements. Reference elements that would imply capabilities that do not exist (SSO, MFA, sovereign hosting/jurisdiction, password) were replaced with simulated-access notices. Language toggle was omitted (Arabic is out of scope).

## Tokens (`src/app/globals.css`)
| Role | Token | Value |
|---|---|---|
| Background | `ivory` / `ivory-2` / `paper` | #faf7f0 / #f3eee2 / #ffffff |
| Ink | `ink` / `ink-2` / `muted` | #0e2a23 / #34453f / #5a6761 |
| Borders | `line` / `line-2` | #e3dccb / #eee8d9 |
| Emerald (nav, primary) | `em-950…600` | #0a2a22, #0f3d32, #165040, #1f6150, #2b7a66 |
| Sage (ok/status) | `sg-50…700` | #eef4ef, #e1ede5, #b4cdbc, #6e9a83, #3b6650 |
| Gold (restrained accent) | `gd-100/300/500/700` | #f4ecd6, #d9c18c, #b08d4a, #7a5c22 (use 700 for text; 6.2:1 on white) |
| Amber (watch/high) | `am-100/600/800` | #fbefd2, #b26f0a, #7a4b04 |
| Red (alert/critical) | `rd-100/600/800` | #f8e3df, #b3402f, #8a2d20 |
Typography: serif display (Iowan/Palatino/Georgia stack) for headlines and key numbers; system sans for UI. No external fonts are loaded. Radius 12px cards; hairline borders; soft card shadow.

## Components
`Mark/Wordmark/Skyline` (brand, original SVG art) · `SeverityBadge`, `StatusPill` (icon + text, never colour alone) · `DemoTag` (visible on every shell page and drawer) · `StageBoundary` (dashed gold note naming the stage) · `ChartCard` · `RecordDrawer` · `Shell` (sidebar + top bar).

## Charts
Hand-written SVG. One y-axis per chart, labelled axes with units (margins computed from label widths), legend whenever there are ≥2 series or a reference line, distinct marker shapes, 2px lines, hover tooltip, direct end-labels only when every name fits, and a **Table** view for exact values.
Categorical palette (fixed order): `#0e7c5f #a56a00 #2f6db5 #b8446f #6f56c0`. Every slot has ≥ 4.5:1 contrast on the white chart surface (graphics need ≥ 3:1: 5.16, 4.51, 5.28, 5.13, 5.57). Validator: lightness band, chroma floor and normal-vision ΔE ≥ 17.7 pass; closest colour-blind pair ΔE 8.1 (protan), which is legal with the secondary encodings (markers, legend, table view). Status colours (amber/red) are reserved for status and are not chart series.

## Accessibility and responsiveness
Skip link; visible focus rings (white on emerald surfaces); labelled controls; combobox semantics on search; dialogs (record drawer, About, Reset) move focus in, trap Tab, close on Escape and return focus to the opener; scrollable tables are focusable regions; role-dependent UI shows a neutral loading state until persisted state is read, so a persisted role is never replaced visually by the default; reduced-motion respected. Layouts verified at 1440, 1280 and 390 px with no horizontal overflow. axe-core (WCAG 2.0/2.1 A+AA) reports 0 violations across 42 scans; items axe marks "incomplete" and screen-reader behaviour have not been manually verified. No formal WCAG audit has been performed.
