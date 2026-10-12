# Data model

Source: `src/data/*` (typed in `src/lib/types.ts`). All records are fictional.

## Records and IDs
| Type | ID | Notes |
|---|---|---|
| Entity | `ENT-<SEC>-nn` | Underlying record (asset, portfolio, plant…); `attrs` snapshot, optional `series` aligned to sector periods, `dependsOn`, optional `excludeFromGroupTotal` |
| Metric | `MET-<SEC>-nn` | `compute(entities)` returns value + source entity IDs; unit, period, formula, tolerance, assumptions, additive flag |
| Chart | `CHT-<SEC>-nn` | `build(entities, periods)` → categories/series; axis labels, unit, formula |
| Signal | `SIG-<SEC>-nn` | severity, metric?, entities, evidence, `caseId`, assumptions, timestamp |
| Case | `CAS-<SEC>-nn` | signals, decisions, entities, evidence, owner, status, expert-input flag |
| Decision | `DEC-<SEC>-nn` | `caseId`, signals, options, recommendation, amount + `amountKind` (`commitment` / `reallocation` / `none`) |
| Evidence | `EVD-<SEC>-nn` | Illustrative description only |
| Activity | `ACT-<SEC>-nn` | optional `recordId` |
| Notification | `NTF-nn` | optional `recordId`; read state persisted |
| Cross link | `XLK-nn` | descriptive relationship between entities of different sectors |
Sector codes: ENR BNK INS MFG LOG REA INF SOV. Timestamps are `YYYY-MM-DDTHH:mm` in AST.

## Relationships
Signal → Case (`caseId`) → Decision(s) (`decisionIds`); each link has a back-reference checked by `npm run verify:data`. Entities link to signals/cases/decisions/metrics through reverse lookup (`referencedBy`).

## Formulas (details per sector at `/methodology`)
Headline results from the seed (computed, not typed):
| Sector | Capital employed (SAR m) | Metrics (1–4) |
|---|---|---|
| Energy | 57,400 | 1,080 kboe/d · 60.4% hub dependency · 53.0% route redundancy · SAR 16,500 m single-route capital |
| Banking | 8,000 | CAR 17.2% · LCR 118.5% · top-two credit concentration 57.0% · payment availability 99.912% |
| Insurance | 3,300 | loss ratio 71.2% · GWP SAR 7,640 m · reserve adequacy 96.6% · largest reinsurer 52.1% |
| Manufacturing | 24,000 | utilisation 84.2% · variance −6.9% · sole-source spend 53.8% · SAR 4,600 m at plants <85% |
| Logistics | 16,630 | delayed 10.0% · gateway dependency 54.2% · cover 11.5 days · top-two suppliers 51.7% |
| Real Estate | 17,750 | occupancy 92.9% · expiries 20.0% · milestone gap 5.7 pts · top-two concentration 36.6% |
| Infrastructure | 34,250 | delivery gap 5.5 pts · availability 99.23% · backlog SAR 2,980 m · undrawn commitments SAR 4,350 m |
| Sovereign Capital | 101,000 | portfolio SAR 101,000 m · alignment 62.4% · largest class 37.6% · liquid cover 8.5× |

## Aggregation rules (avoid double counting)
- **Additive:** capital employed per sector (definition per sector in `Sector.capitalDefinition`) and decision amounts of kind `commitment`. **Group capital employed = SAR 262,330 m = Σ eight sector totals.**
- **Non-additive:** every ratio, %, days, availability, concentration and cover metric — never summed or averaged across sectors.
- **Sovereign Capital memo:** `ENT-SOV-06` carries the Office's stakes in the seven Group entities (= Σ their capital, SAR 161,330 m). It is shown but flagged `excludeFromGroupTotal`, so it is not added to the group total.
- **Decision amounts:** `commitment` (new outlay) summed → SAR 2,327 m requested; `reallocation` amounts are shown separately and never added.
- **Cross-sector links** are descriptive; their exposures are already inside the sector figures.

## Reporting periods and assumptions
Snapshot attributes are at 30 Sep 2026 (or Sep 2026 monthly average, T12M where labelled). Series cover Apr–Sep 2026 (monthly) or Q2 2025–Q3 2026 (quarterly). Tolerances are illustrative demonstration thresholds. Decision amounts and uplift ranges are illustrative planning assumptions, not forecasts.

## Stage 2 records
Seed records are immutable code; user changes live in an overlay (`WorkState`) and are merged by `buildWorld` so counts, search, notifications and drawers share one source.
- IDs: `CAS-<code>-nn` (seeded) and new cases take the next number for the sector; `HYP-<code>-nn-m`, `LNK-<code>-nn-m` (evidence links), `TSK-<code>-nn-m`, `FND-…`, `RRQ-…`/rounds, `BRF-<case>-v<n>`, `EVT-…`, `PER-<code>-nn` (fictional people), `OBJ-<code>-nn` (mandate objectives), `NTF-S2-<code>`. Counters never reuse an ID.
- `Evidence` has versions (`EvidenceVersion` with `EvidenceBlock[]` and stable refs), entity ids, limitations and source date. Freshness is computed from the source date and the data-as-of date.
- `CaseAggregate`: case fields, signal ids, hypotheses, evidence links (stance + history, soft delete), notes, tasks, review requests with rounds and submissions (findings with citations), briefs (versions with a `BriefBasis` fingerprint), events.
- Backlinks: `Signal.caseId` (null until triaged), `Case.decisionIds`, `Decision.caseId` stay consistent; one active case per signal.
- Brief staleness: `basisOf(case)` fingerprints hypotheses, active links (with evidence version), finding ids and task outcomes; a brief is stale when the fingerprint differs from its compiled basis.
- Currency stays SAR; additive vs non-additive rules are unchanged. Brief text never shows a financial figure without a calculation.

## Stage 3 records
- `AiRun` (`RUN-<SEC>-nn`, counter per sector, never reused): `caseId`, `operation` (`summarize|conflicts|tasks|brief|question`), `assistantId`, optional `question` (≤ 500 chars), `mode` (`ai|deterministic|mock-provider`), requesting `role`, `status` (`queued|running|completed|failed|cancelled`), `createdAt/startedAt/finishedAt/durationMs`, `provider/model/promptVersion` (only when a provider answered), `usage` (provider-reported tokens only), `snapshot`, `output`, `error`, `note`.
- `Snapshot`: fingerprint of the inputs (case text, hypotheses, active evidence links with version/stance, tasks, recorded expert findings, notes) plus per-item hashes so “Needs refresh” can name the change, the evidence versions supplied and the character count. Evidence text is not stored; it is re-read from the immutable catalog by ID and version.
- `AssistOutput`: `sourceSupported`, `inferences`, `contradictions` (claims with `citations: {evidenceId, version, ref, quote}` and `records`), `missing`, `nextSteps`, `taskProposals`, optional `briefProposal`, `insufficient`, `rejected` (item, section, reasons) and `warnings`. Only validated output is saved; raw provider text is not.
- Proposals have `status` (`pending|accepted|discarded`), `edited`, decision time and role, and the created task ID / brief version. Created tasks and briefs carry `origin {runId, mode, provider, model, edited, acceptedAt}`; brief versions created this way have `source: "assistant-draft"`.
- Scope limits: 60,000 input characters, 40 evidence links, 12 claims per section, 6 task proposals, 4,000 output tokens (see `LIMITS`).
- Staleness is computed, not stored: a run is stale when the fingerprint of the case's current context differs from its snapshot. Accepting a proposal re-baselines that run so its sibling proposals stay reviewable; other runs become stale.
- Counts, search (kind “Assistant run”) and notifications (run completed/failed) derive from the same records as everything else.

## Persistence
`localStorage` key `tigeris.demo.v3`: `{schemaVersion: 3, savedAt, ui: {sectorId, role, readIds, entered}, work: {cases, notifications, counters, ai: {runs, counters}}}`. Older keys are migrated once and removed: Stage 2 `tigeris.demo.v2` (assistant history starts empty) and Stage 1 `tigeris.demo.v1`, each with a visible notice. Saved data is validated by hand-written validators, including every persisted citation against the catalog. If it cannot be read, a recovery banner explains why, nothing is overwritten, and an explicit two-step **Reset saved state** restores the seed. A run that was in flight when the page closed is shown as failed (“interrupted”). Reset (confirmed) removes every Stage 2 and Stage 3 change. No credential, provider response body or raw model text is persisted. History is local demonstration activity, not an audit log.

## Integrity checks
`npm run verify:ai` runs 221 checks of Stage 3 (mock-provider fixture and pure logic; no real model call). `npm run verify:store` runs 462 checks over seeds, mutations, the state machine, brief staleness and persistence/migration/invalid-state handling. `npm run verify:data` verifies unique IDs and sector codes, minimum content per sector, resolvable references, signal↔case↔decision back-links, series/snapshot agreement, group-total and memo exclusion, and chart↔metric agreement spot checks.
