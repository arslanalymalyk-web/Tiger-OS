import type { SectorSeed } from "@/lib/types";
import { attr, byCat, fmt, ids, makeEntity, r1, sumAttr } from "./helpers";

const C = "INF";
const S = "infrastructure" as const;
const P = "Capital project";
const A = "Service asset";
const ent = [
  makeEntity(C, S, 1, "Northern Water Transmission Line", P, "Bulk water transmission.", { budget: 3200, committed: 2900, capital: 1780, complete: 58, planned: 60 }),
  makeEntity(C, S, 2, "Capital Metro Extension – Package C", P, "Metro extension civil and systems package.", { budget: 5400, committed: 4600, capital: 2300, complete: 41, planned: 52 }),
  makeEntity(C, S, 3, "Coastal Desalination Expansion", P, "Desalination capacity expansion.", { budget: 2800, committed: 2500, capital: 2150, complete: 79, planned: 80 }),
  makeEntity(C, S, 4, "Smart Grid Modernisation Phase 2", P, "Grid automation programme.", { budget: 1600, committed: 1100, capital: 520, complete: 33, planned: 35 }),
  makeEntity(C, S, 5, "Municipal Water Network", A, "Urban water distribution.", { availability: 99.4, backlog: 640, capital: 6800 }, { series: { availability: [99.5, 99.5, 99.3, 99.4, 99.4, 99.4] } }),
  makeEntity(C, S, 6, "Highway Corridor Network", A, "National highway corridors.", { availability: 99.8, backlog: 1150, capital: 9200 }, { series: { availability: [99.8, 99.7, 99.8, 99.8, 99.8, 99.8] } }),
  makeEntity(C, S, 7, "Power Distribution Grid", A, "Regional distribution grid.", { availability: 99.1, backlog: 880, capital: 7400 }, { series: { availability: [99.4, 99.3, 99.2, 99.2, 99.1, 99.1] } }),
  makeEntity(C, S, 8, "Metro Line 1 Operations", A, "Operating metro line.", { availability: 97.9, backlog: 310, capital: 4100 }, { series: { availability: [98.6, 98.4, 98.2, 98.0, 97.9, 97.9] } }),
];
const projects = byCat(ent, P);
const assets = byCat(ent, A);
const gap = projects.reduce((a, p) => a + attr(p, "budget") * (attr(p, "planned") - attr(p, "complete")), 0) / sumAttr(projects, "budget");
const avail = assets.reduce((a, s) => a + attr(s, "availability") * attr(s, "capital"), 0) / sumAttr(assets, "capital");
const backlog = sumAttr(assets, "backlog");
const undrawn = sumAttr(projects, "committed") - sumAttr(projects, "capital");
const metroC = ent[1];
const metro1 = ent[7];
const hw = ent[5];
const sn = (e: (typeof ent)[number]) => e.name.replace(" Transmission Line", "").replace("Capital Metro Extension – ", "Metro Ext. ").replace(" Expansion", "").replace(" Modernisation Phase 2", "").replace(" Operations", "").replace(" Network", "").replace(" Distribution Grid", " Grid").replace("Municipal ", "");

export const infrastructure: SectorSeed = {
  sector: {
    id: S, code: C, name: "Infrastructure", short: "Infrastructure", entityName: "Al Noor Infrastructure Authority", descriptor: "Infrastructure & Utilities",
    mandate: "Deliver the capital programme to plan, keep national services available, and prioritise maintenance spending against commitments.",
    analyticalFocus: ["Project delivery", "Service availability", "Maintenance backlog", "Capital commitments"],
    periods: ["Q2 25", "Q3 25", "Q4 25", "Q1 26", "Q2 26", "Q3 26"], periodsLabel: "Quarter", reportingPeriod: "Q3 2026", asOf: "2026-10-12T08:00",
    attrs: {
      budget: { label: "Approved budget", unit: "SAR m" }, committed: { label: "Contractually committed", unit: "SAR m" }, capital: { label: "Spend to date / carrying value", unit: "SAR m" },
      complete: { label: "Completion", unit: "%" }, planned: { label: "Planned completion", unit: "%" }, availability: { label: "Service availability", unit: "%" }, backlog: { label: "Maintenance backlog", unit: "SAR m" },
    },
    capitalDefinition: "Spend to date on capital projects plus carrying value of service assets (SAR m).", icon: "route",
  },
  entities: ent,
  metrics: [
    { id: "MET-INF-01", sectorId: S, name: "Programme delivery gap", theme: "Project delivery", unit: "pts behind plan", period: "Q3 2026", decimals: 1, formula: "Σ budget × (planned − actual completion) ÷ Σ budget.",
      compute: () => ({ value: gap, sources: ids(projects) }), status: (v) => (v > 8 ? "alert" : v > 3 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≤ 3 pts ok, > 8 alert.", assumptions: ["Budget-weighted."], additive: false },
    { id: "MET-INF-02", sectorId: S, name: "Service availability", theme: "Service availability", unit: "% uptime (capital-weighted)", period: "Q3 2026", decimals: 2, formula: "Σ availability × carrying value ÷ Σ carrying value across service assets.",
      compute: () => ({ value: avail, sources: ids(assets) }), status: (v) => (v < 98.5 ? "alert" : v < 99.5 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≥ 99.5% ok, < 98.5% alert.", assumptions: ["Weights are carrying values, not users served."], additive: false },
    { id: "MET-INF-03", sectorId: S, name: "Maintenance backlog", theme: "Maintenance backlog", unit: "SAR m", period: "As at 30 Sep 2026", decimals: 0, formula: "Σ unfunded maintenance backlog across service assets.",
      compute: () => ({ value: backlog, sources: ids(assets) }), status: () => "info", thresholdNote: "Informational.", assumptions: ["Backlog at current-year prices."], additive: true },
    { id: "MET-INF-04", sectorId: S, name: "Undrawn capital commitments", theme: "Capital commitments", unit: "SAR m", period: "As at 30 Sep 2026", decimals: 0, formula: "Σ contractually committed − Σ spend to date across capital projects.",
      compute: () => ({ value: undrawn, sources: ids(projects) }), status: () => "info", thresholdNote: "Informational.", assumptions: ["Commitments exclude contingencies."], additive: true },
  ],
  charts: [
    { id: "CHT-INF-01", sectorId: S, title: "Actual vs planned completion by project", subtitle: "Q3 2026", kind: "bars", xLabel: "Capital project", yLabel: "Completion (%)", unit: "%", decimals: 0, formula: "complete and planned per project.",
      build: (es) => { const p = byCat(es, P); return { categories: p.map(sn), series: [{ name: "Actual", values: p.map((e) => attr(e, "complete")) }, { name: "Planned", values: p.map((e) => attr(e, "planned")) }], sources: ids(p) }; } },
    { id: "CHT-INF-02", sectorId: S, title: "Service availability trend", subtitle: "Q2 2025 – Q3 2026", kind: "line", xLabel: "Quarter", yLabel: "Availability (%)", unit: "%", decimals: 1, yMin: 97, formula: "series.availability per service asset.",
      build: (es, p) => { const a = byCat(es, A); return { categories: p, series: a.map((e) => ({ name: sn(e), values: e.series!.availability })), sources: ids(a) }; } },
  ],
  signals: [
    { id: "SIG-INF-01", sectorId: S, title: `Metro Extension C ${attr(metroC, "planned") - attr(metroC, "complete")} pts behind plan`, severity: "critical",
      summary: `Completion ${attr(metroC, "complete")}% vs ${attr(metroC, "planned")}% planned; SAR ${fmt(attr(metroC, "committed"))} m committed.`, detectedAt: "2026-10-09T08:50", metricId: "MET-INF-01", entityIds: [metroC.id], evidenceIds: ["EVD-INF-01"], caseId: "CAS-INF-01", assumptions: ["Progress as certified."] },
    { id: "SIG-INF-02", sectorId: S, title: `Metro Line 1 availability ${attr(metro1, "availability")}% and declining`, severity: "high",
      summary: `Down from ${metro1.series!.availability[0]}% six quarters ago.`, detectedAt: "2026-10-10T09:10", metricId: "MET-INF-02", entityIds: [metro1.id], evidenceIds: ["EVD-INF-02"], caseId: "CAS-INF-02", assumptions: ["Includes planned closures."] },
    { id: "SIG-INF-03", sectorId: S, title: `Highway backlog SAR ${fmt(attr(hw, "backlog"))} m is ${r1((attr(hw, "backlog") / backlog) * 100)}% of total`, severity: "moderate",
      summary: `Total backlog SAR ${fmt(backlog)} m.`, detectedAt: "2026-10-10T11:30", metricId: "MET-INF-03", entityIds: [hw.id], evidenceIds: ["EVD-INF-02"], caseId: "CAS-INF-02", assumptions: ["Backlog at current-year prices."] },
    { id: "SIG-INF-04", sectorId: S, title: `SAR ${fmt(undrawn)} m undrawn commitments across delayed projects`, severity: "moderate",
      summary: `Programme gap ${r1(gap)} pts while commitments remain undrawn.`, detectedAt: "2026-10-11T09:00", metricId: "MET-INF-04", entityIds: ids(projects), evidenceIds: ["EVD-INF-01"], caseId: "CAS-INF-01", assumptions: ["Commitments exclude contingencies."] },
  ],
  cases: [
    { id: "CAS-INF-01", sectorId: S, title: "Metro Extension C schedule recovery", status: "Awaiting decision", owner: "Yousef Al-Amri (Analyst)", openedAt: "2026-10-09T09:15", summary: "Recover schedule and manage undrawn commitments.", nextStep: "Approver decision on recovery package.",
      signalIds: ["SIG-INF-01", "SIG-INF-04"], decisionIds: ["DEC-INF-01"], entityIds: [metroC.id], evidenceIds: ["EVD-INF-01"], assumptions: ["Contractor claims excluded."], expertInputRequested: true },
    { id: "CAS-INF-02", sectorId: S, title: "Service reliability and maintenance backlog", status: "In analysis", owner: "Hessa Al-Mazrouei (Analyst)", openedAt: "2026-10-10T09:45", summary: "Prioritise maintenance release.", nextStep: "Approver decision on prioritised release.",
      signalIds: ["SIG-INF-02", "SIG-INF-03"], decisionIds: ["DEC-INF-02"], entityIds: [metro1.id, hw.id], evidenceIds: ["EVD-INF-02"], assumptions: ["Release funded from operating budget."], expertInputRequested: false },
  ],
  decisions: [
    { id: "DEC-INF-01", sectorId: S, title: "Approve schedule recovery package for Metro Extension C", decisionType: "Capital programme", amountSARm: 420, amountKind: "commitment", amountNote: "Illustrative recovery budget.", summary: "Fund acceleration measures and additional resources.",
      proposedBy: "Yousef Al-Amri", dueBy: "2026-11-04", caseId: "CAS-INF-01", signalIds: ["SIG-INF-01"], entityIds: [metroC.id], evidenceIds: ["EVD-INF-01"],
      options: [{ label: "Full package", effect: "Targets plan within four quarters." }, { label: "Partial package", effect: "Smaller recovery." }], recommendation: "Full package.", assumptions: ["Resources available."] },
    { id: "DEC-INF-02", sectorId: S, title: "Approve prioritised maintenance release for Metro Line 1 and Highway", decisionType: "Maintenance", amountSARm: 310, amountKind: "commitment", amountNote: "Illustrative release.", summary: "Release backlog funding for highest-risk items.",
      proposedBy: "Hessa Al-Mazrouei", dueBy: "2026-11-12", caseId: "CAS-INF-02", signalIds: ["SIG-INF-02", "SIG-INF-03"], entityIds: [metro1.id, hw.id], evidenceIds: ["EVD-INF-02"],
      options: [{ label: "Approve release", effect: "Reduces backlog and availability risk." }, { label: "Defer", effect: "Risk accumulates." }], recommendation: "Approve.", assumptions: ["Work can be scheduled in FY."] },
  ],
  evidence: [
    { id: "EVD-INF-01", sectorId: S, title: "Capital programme report (illustrative)", kind: "Report extract", source: "Demonstration programme office", asOf: "2026-09-30", summary: "Budget, commitments, spend and completion." },
    { id: "EVD-INF-02", sectorId: S, title: "Asset availability and backlog register (illustrative)", kind: "Register extract", source: "Demonstration asset management", asOf: "2026-09-30", summary: "Availability by quarter and backlog by asset." },
  ],
  activity: [
    { id: "ACT-INF-01", sectorId: S, at: "2026-10-11T09:00", actor: "System (seeded)", text: "Raised commitments signal.", recordId: "SIG-INF-04" },
    { id: "ACT-INF-02", sectorId: S, at: "2026-10-10T09:45", actor: "Hessa Al-Mazrouei", text: "Opened reliability case.", recordId: "CAS-INF-02" },
    { id: "ACT-INF-03", sectorId: S, at: "2026-10-09T09:15", actor: "Yousef Al-Amri", text: "Opened Metro C recovery case.", recordId: "CAS-INF-01" },
    { id: "ACT-INF-04", sectorId: S, at: "2026-10-09T08:50", actor: "System (seeded)", text: "Raised Metro C delay signal.", recordId: "SIG-INF-01" },
  ],
};
