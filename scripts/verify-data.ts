/* Data integrity checks for the Stage 1 seed. Run: npm run verify:data */
import {
  SEEDS, NOTIFICATIONS, CROSS_LINKS, getRecord, computeMetric, computeChart, sectorCapital, groupCapital, groupCounts, allRecordIds, SECTOR_IDS,
} from "../src/data";
import { attr } from "../src/data/helpers";

let failures = 0;
const ok = (c: boolean, msg: string) => { if (!c) { failures++; console.error("FAIL:", msg); } };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

ok(SEEDS.length === 8, "eight sectors");
const seen = new Set<string>();
for (const s of SEEDS) {
  const id = s.sector.id;
  const all = [...s.entities, ...s.metrics, ...s.signals, ...s.cases, ...s.decisions, ...s.evidence, ...s.activity, ...s.charts];
  for (const r of all) { ok(!seen.has(r.id), `duplicate id ${r.id}`); seen.add(r.id); ok(r.id.includes(s.sector.code), `${r.id} has sector code ${s.sector.code}`); }
  ok(s.metrics.length === 4, `${id}: 4 metrics`);
  ok(s.charts.length === 2, `${id}: 2 charts`);
  ok(s.signals.length >= 3, `${id}: >=3 signals`);
  ok(s.cases.length >= 2, `${id}: >=2 cases`);
  ok(s.decisions.length >= 2, `${id}: >=2 decisions`);
  ok(s.activity.length >= 3, `${id}: activity`);
  for (const m of s.metrics) { ok(!!m.unit && !!m.period && !!m.formula, `${m.id} unit/period/formula`); const r = computeMetric(m); ok(Number.isFinite(r.value), `${m.id} finite`); r.sources.forEach((x) => ok(!!getRecord(x), `${m.id} source ${x}`)); }
  for (const c of s.charts) {
    const d = computeChart(c); ok(!!c.xLabel && !!c.yLabel, `${c.id} axis labels`);
    for (const se of d.series) { ok(se.values.length === d.categories.length, `${c.id} series ${se.name} length`); se.values.forEach((v) => ok(Number.isFinite(v), `${c.id} finite`)); }
    d.sources.forEach((x) => ok(!!getRecord(x), `${c.id} source ${x}`));
  }
  for (const e of s.entities) {
    e.dependsOn?.forEach((x) => ok(!!getRecord(x), `${e.id} dependsOn ${x}`));
    for (const [k, arr] of Object.entries(e.series ?? {})) { ok(arr.length === s.sector.periods.length, `${e.id} series ${k} length`); if (e.attrs[k] !== undefined) ok(near(arr[arr.length - 1], e.attrs[k]), `${e.id} series ${k} last == snapshot`); }
    for (const k of Object.keys(e.attrs)) ok(!!s.sector.attrs[k], `${e.id} attr ${k} defined in sector.attrs`);
  }
  for (const sg of s.signals) {
    if (sg.caseId) { const c = s.cases.find((x) => x.id === sg.caseId); ok(!!c, `${sg.id} case exists`); ok(!!c?.signalIds.includes(sg.id), `${sg.id} listed in ${sg.caseId}`); }
    else ok(!s.cases.some((x) => x.signalIds.includes(sg.id)), `${sg.id} (no primary case) is not listed in any seeded case`);
    [...sg.entityIds, ...sg.evidenceIds, ...(sg.metricId ? [sg.metricId] : [])].forEach((x) => ok(!!getRecord(x), `${sg.id} ref ${x}`));
  }
  for (const c of s.cases) {
    c.signalIds.forEach((x) => ok(s.signals.find((y) => y.id === x)?.caseId === c.id, `${c.id} signal ${x} back-link`));
    c.decisionIds.forEach((x) => ok(s.decisions.find((y) => y.id === x)?.caseId === c.id, `${c.id} decision ${x} back-link`));
    [...c.entityIds, ...c.evidenceIds].forEach((x) => ok(!!getRecord(x), `${c.id} ref ${x}`));
  }
  for (const d of s.decisions) {
    ok(!!s.cases.find((c) => c.id === d.caseId)?.decisionIds.includes(d.id), `${d.id} listed in ${d.caseId}`);
    d.signalIds.forEach((x) => ok(!!getRecord(x), `${d.id} signal ${x}`)); [...d.entityIds, ...d.evidenceIds].forEach((x) => ok(!!getRecord(x), `${d.id} ref ${x}`));
    ok((d.amountKind === "none") === (d.amountSARm === null), `${d.id} amountKind/amount consistent`);
  }
  s.activity.forEach((a) => a.recordId && ok(!!getRecord(a.recordId), `${a.id} record`));
}
NOTIFICATIONS.forEach((n) => n.recordId && ok(!!getRecord(n.recordId), `${n.id} record ${n.recordId}`));
CROSS_LINKS.forEach((l) => { ok(!!getRecord(l.fromEntityId), `${l.id} from`); ok(!!getRecord(l.toEntityId), `${l.id} to`); });

// Group totals: additive, no double counting
const sumSectors = SECTOR_IDS.reduce((a, id) => a + sectorCapital(id), 0);
ok(near(sumSectors, groupCapital()), "group capital = Σ sector capital");
const sov = SEEDS.find((s) => s.sector.id === "sovereign")!;
const memo = sov.entities.find((e) => e.excludeFromGroupTotal)!;
const others = SEEDS.filter((s) => s.sector.id !== "sovereign").reduce((a, s) => a + s.entities.reduce((b, e) => b + attr(e, "capital"), 0), 0);
ok(near(attr(memo, "capital"), others), "memo stake value equals Σ other sectors' capital");
ok(near(sectorCapital("sovereign"), sov.entities.filter((e) => !e.excludeFromGroupTotal).reduce((a, e) => a + attr(e, "capital"), 0)), "sovereign excludes memo");
ok(near(sectorCapital("sovereign") + others, groupCapital()), "group capital excludes memo");
// Chart ↔ metric agreement spot checks
const cm = (id: string) => computeMetric(getRecord(id)!.data as never).value;
const enr = computeChart(SEEDS[0].charts[0]);
ok(near(enr.series[0].values.reduce((a, b) => a + b, 0), cm("MET-ENR-01")), "ENR chart production total = metric");
const lcrChart = computeChart(SEEDS[1].charts[1]);
ok(near(lcrChart.series[0].values[5], cm("MET-BNK-02")), "BNK LCR chart last point = metric");
const mfg = computeChart(SEEDS[3].charts[0]);
ok(near(mfg.series[0].values.reduce((a, b) => a + b, 0), (SEEDS[3].entities.filter((e) => e.category === "Plant").reduce((a, e) => a + attr(e, "output"), 0))), "MFG chart output = Σ plant output");
const sovW = computeChart(SEEDS[7].charts[0]);
ok(near(sovW.series[0].values.reduce((a, b) => a + b, 0), 100), "SOV actual weights sum to 100");
const sovT = computeChart(SEEDS[7].charts[1]);
ok(near(sovT.series.reduce((a, s) => a + s.values[5], 0), 100), "SOV trend weights sum to 100 at Q3 26");
ok(near(sovT.series[0].values[5], sovW.series[0].values[0]), "SOV trend last point = bar chart actual (equities)");
const reaMetricOcc = cm("MET-REA-01"); const reaOcc = computeChart(SEEDS[5].charts[0]);
const rea = SEEDS[5].entities.filter((e) => e.category === "Income asset");
ok(near(reaMetricOcc, (rea.reduce((a, e) => a + attr(e, "occupied"), 0) / rea.reduce((a, e) => a + attr(e, "leasable"), 0)) * 100), "REA occupancy metric");
ok(reaOcc.series.length === 5, "REA 5 asset series");

console.log(`records: ${allRecordIds().length}, signals: ${groupCounts().signals}, group capital: SAR ${groupCapital().toLocaleString()} m, commitments: SAR ${groupCounts().commitments} m`);
if (failures) { console.error(`${failures} integrity failure(s)`); process.exit(1); }
console.log("Data integrity: all checks passed");
