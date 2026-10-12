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
| Gold (restrained accent) | `gd-100/300/500/700` | #f4ecd6, #d9c18c, #b08d4a, #86672b (use 700 for text) |
| Amber (watch/high) | `am-100/600/800` | #fbefd2, #b26f0a, #7a4b04 |
| Red (alert/critical) | `rd-100/600/800` | #f8e3df, #b3402f, #8a2d20 |
Typography: serif display (Iowan/Palatino/Georgia stack) for headlines and key numbers; system sans for UI. No external fonts are loaded. Radius 12px cards; hairline borders; soft card shadow.

## Components
`Mark/Wordmark/Skyline` (brand, original SVG art) · `SeverityBadge`, `StatusPill` (icon + text, never colour alone) · `DemoTag` (visible on every shell page and drawer) · `StageBoundary` (dashed gold note naming the stage) · `ChartCard` · `RecordDrawer` · `Shell` (sidebar + top bar).

## Charts
Hand-written SVG. Rules applied from the dataviz guidance: one y-axis per chart, labelled axes with units, legend whenever ≥2 series, distinct marker shapes, 2px lines, dashed reference lines with halo labels, hover tooltip, and a **Table** view for exact values. Categorical palette `#0e7c5f #c48a12 #2f6db5 #c0507e #8a6fd0` validated with the validator (lightness band, chroma, CVD ΔE ≥ 8.8, normal-vision ΔE ≥ 15.5). The gold slot has contrast < 3:1 against white, which is mitigated by legends, markers and the table view. Status colours (amber/red) are reserved for status and are not used as chart series.

## Accessibility and responsiveness
Focus rings; labelled controls; dialog roles with Escape to close; reduced-motion respected; layouts verified at 1440 px and 390 px with no horizontal overflow. A full WCAG audit has not been performed.
