import type { SectorSeed } from "@/lib/types";
import { attr, byCat, fmt, ids, makeEntity, r1, sumAttr } from "./helpers";

const C = "MFG";
const S = "manufacturing" as const;
const P = "Plant";
const SU = "Supplier";
const ent = [
  makeEntity(C, S, 1, "Sahm Polymers Plant", P, "Polymer production.", { capacity: 95, output: 82, plan: 88, capital: 6200 }, { series: { output: [86, 85, 83, 84, 80, 82], plan: [88, 88, 88, 88, 88, 88] }, dependsOn: ["ENT-MFG-06", "ENT-MFG-07"] }),
  makeEntity(C, S, 2, "Fajr Steel Works", P, "Flat steel production.", { capacity: 140, output: 121, plan: 125, capital: 5400 }, { series: { output: [118, 122, 124, 123, 119, 121], plan: [125, 125, 125, 125, 125, 125] }, dependsOn: ["ENT-MFG-06", "ENT-MFG-08", "ENT-MFG-09"] }),
  makeEntity(C, S, 3, "Riyam Aluminium Smelter", P, "Primary aluminium.", { capacity: 60, output: 57, plan: 56, capital: 7800 }, { series: { output: [55, 56, 57, 57, 58, 57], plan: [56, 56, 56, 56, 56, 56] }, dependsOn: ["ENT-MFG-08"] }),
  makeEntity(C, S, 4, "Dunes Cement Works", P, "Cement and clinker.", { capacity: 210, output: 168, plan: 190, capital: 3100 }, { series: { output: [182, 178, 176, 172, 170, 168], plan: [190, 190, 190, 190, 190, 190] }, dependsOn: ["ENT-MFG-09"] }),
  makeEntity(C, S, 5, "Noor Packaging Complex", P, "Industrial packaging.", { capacity: 40, output: 31, plan: 34, capital: 1500 }, { series: { output: [30, 32, 33, 32, 31, 31], plan: [34, 34, 34, 34, 34, 34] }, dependsOn: ["ENT-MFG-10", "ENT-MFG-07"] }),
  makeEntity(C, S, 6, "Hadid Raw Materials", SU, "Sole-source iron ore and feedstock supplier.", { spend: 920, soleSource: 1 }),
  makeEntity(C, S, 7, "Najd Chemicals", SU, "Chemical inputs; alternatives qualified.", { spend: 640, soleSource: 0 }),
  makeEntity(C, S, 8, "Gulf Alloy Trading", SU, "Sole-source alloying agents.", { spend: 510, soleSource: 1 }),
  makeEntity(C, S, 9, "Eastern Coke Supply", SU, "Coke and fuel; alternatives qualified.", { spend: 380, soleSource: 0 }),
  makeEntity(C, S, 10, "Packaging Films Co", SU, "Film and resin inputs.", { spend: 210, soleSource: 0 }),
];
const plants = byCat(ent, P);
const sup = byCat(ent, SU);
const util = (sumAttr(plants, "output") / sumAttr(plants, "capacity")) * 100;
const variance = (sumAttr(plants, "output") / sumAttr(plants, "plan") - 1) * 100;
const soleShare = (sumAttr(sup.filter((s) => attr(s, "soleSource") === 1), "spend") / sumAttr(sup, "spend")) * 100;
const low = plants.filter((p) => (attr(p, "output") / attr(p, "capacity")) * 100 < 85);
const lowCap = sumAttr(low, "capital");
const dunes = ent[3];
const pk = ent[4];
const hadid = ent[5];
const hadidPlants = plants.filter((p) => p.dependsOn?.includes(hadid.id));
const hadidShare = (sumAttr(hadidPlants, "output") / sumAttr(plants, "output")) * 100;
const u = (p: (typeof ent)[number]) => (attr(p, "output") / attr(p, "capacity")) * 100;
const nm = (p: (typeof ent)[number]) => p.name.replace(" Plant", "").replace(" Works", "").replace(" Smelter", "").replace(" Complex", "");

export const manufacturing: SectorSeed = {
  sector: {
    id: S, code: C, name: "Manufacturing", short: "Manufacturing", entityName: "Al Noor Industrial Holdings", descriptor: "Industrial Manufacturing",
    mandate: "Run plants at planned utilisation, control production variance, and reduce dependence on sole-source suppliers while protecting returns on capital employed.",
    analyticalFocus: ["Plant capacity", "Production variance", "Supplier dependencies", "Capital exposure"],
    periods: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"], periodsLabel: "Month (2026)", reportingPeriod: "Sep 2026", asOf: "2026-10-12T08:00",
    attrs: {
      capacity: { label: "Capacity", unit: "kt/month" }, output: { label: "Output", unit: "kt/month" }, plan: { label: "Planned output", unit: "kt/month" },
      capital: { label: "Capital employed", unit: "SAR m" }, spend: { label: "Supplier spend (T12M)", unit: "SAR m" }, soleSource: { label: "Sole-source supplier", unit: "flag (1=yes)" },
    },
    capitalDefinition: "Carrying value of plants (SAR m, 30 Sep 2026).", icon: "factory",
  },
  entities: ent,
  metrics: [
    { id: "MET-MFG-01", sectorId: S, name: "Plant utilisation", theme: "Plant capacity", unit: "% of capacity", period: "Sep 2026", decimals: 1, formula: "Σ plant output ÷ Σ plant capacity × 100.",
      compute: () => ({ value: util, sources: ids(plants) }), status: (v) => (v < 80 ? "alert" : v < 88 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≥ 88% ok, < 80% alert.", assumptions: ["Mixed products summed in tonnes."], additive: false },
    { id: "MET-MFG-02", sectorId: S, name: "Production variance vs plan", theme: "Production variance", unit: "% vs plan", period: "Sep 2026", decimals: 1, formula: "(Σ output ÷ Σ planned output − 1) × 100.",
      compute: () => ({ value: variance, sources: ids(plants) }), status: (v) => (v < -8 ? "alert" : v < -3 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≥ −3% ok, < −8% alert.", assumptions: ["Plan is the approved annual operating plan."], additive: false },
    { id: "MET-MFG-03", sectorId: S, name: "Sole-source supplier spend", theme: "Supplier dependencies", unit: "% of spend", period: "T12M to 30 Sep 2026", decimals: 1, formula: "Σ spend with sole-source suppliers ÷ Σ supplier spend × 100.",
      compute: () => ({ value: soleShare, sources: ids(sup) }), status: (v) => (v > 60 ? "alert" : v > 50 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≤ 50% ok, > 60% alert.", assumptions: ["Sole-source means no qualified alternative today."], additive: false },
    { id: "MET-MFG-04", sectorId: S, name: "Capital at plants below 85% utilisation", theme: "Capital exposure", unit: "SAR m", period: "As at 30 Sep 2026", decimals: 0, formula: "Σ capital employed of plants whose output ÷ capacity < 85%.",
      compute: () => ({ value: lowCap, sources: ids(low) }), status: () => "info", thresholdNote: "Informational.", assumptions: ["Threshold is illustrative."], additive: true },
  ],
  charts: [
    { id: "CHT-MFG-01", sectorId: S, title: "Output vs plan by plant", subtitle: "Sep 2026", kind: "bars", xLabel: "Plant", yLabel: "kt/month", unit: "kt", decimals: 0, formula: "output and plan per plant.",
      build: (es) => { const p = byCat(es, P); return { categories: p.map(nm), series: [{ name: "Output", values: p.map((e) => attr(e, "output")) }, { name: "Plan", values: p.map((e) => attr(e, "plan")) }], sources: ids(p) }; } },
    { id: "CHT-MFG-02", sectorId: S, title: "Utilisation trend by plant", subtitle: "Apr–Sep 2026", kind: "line", xLabel: "Month (2026)", yLabel: "Utilisation (%)", unit: "%", decimals: 1, yMin: 70, formula: "series.output ÷ capacity × 100.",
      build: (es, per) => { const p = byCat(es, P); return { categories: per, series: p.map((e) => ({ name: nm(e), values: e.series!.output.map((o) => (o / attr(e, "capacity")) * 100) })), sources: ids(p) }; } },
  ],
  signals: [
    { id: "SIG-MFG-01", sectorId: S, title: `Dunes Cement output down ${r1(((dunes.series!.output[0] - attr(dunes, "output")) / dunes.series!.output[0]) * 100)}% since April`, severity: "high",
      summary: `Output ${attr(dunes, "output")} kt vs plan ${attr(dunes, "plan")} kt; utilisation ${r1(u(dunes))}%.`, detectedAt: "2026-10-09T09:00", entityIds: [dunes.id], evidenceIds: ["EVD-MFG-01"], caseId: "CAS-MFG-01", assumptions: ["Kiln wear is the working hypothesis."] },
    { id: "SIG-MFG-02", sectorId: S, title: `Sole-source spend at ${r1(soleShare)}% of supplier spend`, severity: "moderate",
      summary: "Above the 50% demonstration tolerance.", detectedAt: "2026-10-08T11:00", metricId: "MET-MFG-03", entityIds: ids(sup), evidenceIds: ["EVD-MFG-02"], caseId: "CAS-MFG-02", assumptions: ["Spend is T12M."] },
    { id: "SIG-MFG-03", sectorId: S, title: `Hadid Raw Materials feeds plants making ${r1(hadidShare)}% of output`, severity: "high",
      summary: `Sole-source supplier with SAR ${fmt(attr(hadid, "spend"))} m T12M spend.`, detectedAt: "2026-10-09T12:15", entityIds: [hadid.id, ...ids(hadidPlants)], evidenceIds: ["EVD-MFG-02"], caseId: "CAS-MFG-02", assumptions: ["Output share by tonnes."] },
    { id: "SIG-MFG-04", sectorId: S, title: `Noor Packaging at ${r1(u(pk))}% utilisation`, severity: "moderate",
      summary: `Capital employed SAR ${fmt(attr(pk, "capital"))} m; output ${attr(pk, "output")} kt vs plan ${attr(pk, "plan")} kt.`, detectedAt: "2026-10-10T13:40", entityIds: [pk.id], evidenceIds: ["EVD-MFG-01"], caseId: "CAS-MFG-01", assumptions: ["Demand softness not yet confirmed."] },
  ],
  cases: [
    { id: "CAS-MFG-01", sectorId: S, title: "Under-utilised plants: Dunes and Packaging", status: "Awaiting decision", owner: "Majed Al-Harbi (Analyst)", openedAt: "2026-10-09T09:30", summary: "Determine remediation for plants below 85% utilisation.", nextStep: "Approver decision on Dunes kiln refurbishment.",
      signalIds: ["SIG-MFG-01", "SIG-MFG-04"], decisionIds: ["DEC-MFG-01"], entityIds: [dunes.id, pk.id], evidenceIds: ["EVD-MFG-01"], assumptions: ["Plan targets unchanged."], expertInputRequested: true },
    { id: "CAS-MFG-02", sectorId: S, title: "Sole-source supplier resilience", status: "In analysis", owner: "Reem Al-Mutairi (Analyst)", openedAt: "2026-10-08T11:30", summary: "Qualify second sources for sole-source inputs.", nextStep: "Approver decision on second-source qualification.",
      signalIds: ["SIG-MFG-02", "SIG-MFG-03"], decisionIds: ["DEC-MFG-02"], entityIds: [hadid.id, ent[7].id], evidenceIds: ["EVD-MFG-02"], assumptions: ["Qualification takes 9 months."], expertInputRequested: false },
  ],
  decisions: [
    { id: "DEC-MFG-01", sectorId: S, title: "Approve kiln refurbishment at Dunes Cement", decisionType: "Capital project", amountSARm: 210, amountKind: "commitment", amountNote: "Illustrative project budget.", summary: "Refurbish kiln to restore output toward plan.",
      proposedBy: "Majed Al-Harbi", dueBy: "2026-11-05", caseId: "CAS-MFG-01", signalIds: ["SIG-MFG-01"], entityIds: [dunes.id], evidenceIds: ["EVD-MFG-01"],
      options: [{ label: "Full refurbishment", effect: "Targets plan output." }, { label: "Phased repair", effect: "Lower cost, partial recovery." }], recommendation: "Full refurbishment.", assumptions: ["Eight-week outage."] },
    { id: "DEC-MFG-02", sectorId: S, title: "Approve second-source qualification for Hadid inputs", decisionType: "Supply resilience", amountSARm: 45, amountKind: "commitment", amountNote: "Illustrative qualification cost.", summary: "Qualify an alternate supplier.",
      proposedBy: "Reem Al-Mutairi", dueBy: "2026-11-12", caseId: "CAS-MFG-02", signalIds: ["SIG-MFG-03"], entityIds: [hadid.id], evidenceIds: ["EVD-MFG-02"],
      options: [{ label: "Qualify one source", effect: "Reduces dependency." }, { label: "Hold stock buffer only", effect: "Short-term cover." }], recommendation: "Qualify one source.", assumptions: ["Quality parity achievable."] },
  ],
  evidence: [
    { id: "EVD-MFG-01", sectorId: S, title: "Plant output ledger Apr–Sep 2026 (illustrative)", kind: "Dataset extract", source: "Demonstration plant MES", asOf: "2026-10-05", summary: "Monthly output and plan by plant." },
    { id: "EVD-MFG-02", sectorId: S, title: "Supplier dependency register (illustrative)", kind: "Register extract", source: "Demonstration procurement", asOf: "2026-09-30", summary: "Spend, sole-source flag and plant links." },
  ],
  activity: [
    { id: "ACT-MFG-01", sectorId: S, at: "2026-10-11T10:00", actor: "Majed Al-Harbi", text: "Submitted refurbishment proposal.", recordId: "DEC-MFG-01" },
    { id: "ACT-MFG-02", sectorId: S, at: "2026-10-10T13:40", actor: "System (seeded)", text: "Raised packaging utilisation signal.", recordId: "SIG-MFG-04" },
    { id: "ACT-MFG-03", sectorId: S, at: "2026-10-09T12:15", actor: "System (seeded)", text: "Raised Hadid dependency signal.", recordId: "SIG-MFG-03" },
    { id: "ACT-MFG-04", sectorId: S, at: "2026-10-08T11:30", actor: "Reem Al-Mutairi", text: "Opened supplier resilience case.", recordId: "CAS-MFG-02" },
  ],
};
