import type { SectorSeed } from "@/lib/types";
import { attr, byCat, fmt, ids, makeEntity, r1, sumAttr } from "./helpers";

const C = "INS";
const S = "insurance" as const;
const LB = "Line of business";
const ent = [
  makeEntity(C, S, 1, "Property & Energy", LB, "Commercial property and energy risks.", { gwp: 1450, earned: 1380, claims: 940, capital: 1150, reserve: 1320, reserveBest: 1410 }),
  makeEntity(C, S, 2, "Motor", LB, "Personal and fleet motor.", { gwp: 1820, earned: 1760, claims: 1310, capital: 520, reserve: 980, reserveBest: 960 }),
  makeEntity(C, S, 3, "Medical", LB, "Group and individual medical.", { gwp: 2240, earned: 2190, claims: 1780, capital: 410, reserve: 760, reserveBest: 770 }),
  makeEntity(C, S, 4, "Marine & Cargo", LB, "Marine hull and cargo.", { gwp: 690, earned: 660, claims: 330, capital: 280, reserve: 410, reserveBest: 400 }),
  makeEntity(C, S, 5, "Engineering & Construction", LB, "Contractors' all risks and engineering.", { gwp: 880, earned: 790, claims: 520, capital: 640, reserve: 1030, reserveBest: 1150 }),
  makeEntity(C, S, 6, "Family Takaful", LB, "Family takaful contributions and benefits.", { gwp: 560, earned: 540, claims: 330, capital: 300, reserve: 620, reserveBest: 610 }),
  makeEntity(C, S, 7, "Meridian Re", "Reinsurer", "Lead reinsurer on property and engineering treaties.", { recoverable: 2100 }),
  makeEntity(C, S, 8, "Atlas Re", "Reinsurer", "Reinsurer on casualty and marine treaties.", { recoverable: 1150 }),
  makeEntity(C, S, 9, "Najm Re", "Reinsurer", "Regional reinsurer, medical and takaful.", { recoverable: 780 }),
];
const lines = byCat(ent, LB);
const re = byCat(ent, "Reinsurer");
const lr = (e: (typeof ent)[number]) => (attr(e, "claims") / attr(e, "earned")) * 100;
const portLr = (sumAttr(lines, "claims") / sumAttr(lines, "earned")) * 100;
const adequacy = (sumAttr(lines, "reserve") / sumAttr(lines, "reserveBest")) * 100;
const shortfall = sumAttr(lines, "reserveBest") - sumAttr(lines, "reserve");
const top = [...re].sort((a, b) => attr(b, "recoverable") - attr(a, "recoverable"))[0];
const topShare = (attr(top, "recoverable") / sumAttr(re, "recoverable")) * 100;
const eng = ent[4];
const med = ent[2];
const short = (e: (typeof ent)[number]) => e.name.replace(" & Construction", "").replace("Family ", "");

export const insurance: SectorSeed = {
  sector: {
    id: S, code: C, name: "Insurance", short: "Insurance", entityName: "Al Noor Assurance Company", descriptor: "Insurance & Takaful",
    mandate: "Price and reserve risk adequately, keep claims experience within tolerance, and avoid concentration in the reinsurance panel.",
    analyticalFocus: ["Claims", "Underwriting exposure", "Reserving assumptions", "Reinsurance concentration"],
    periods: ["Q2 25", "Q3 25", "Q4 25", "Q1 26", "Q2 26", "Q3 26"], periodsLabel: "Quarter", reportingPeriod: "T12M to 30 Sep 2026", asOf: "2026-10-12T08:00",
    attrs: {
      gwp: { label: "Gross written premium (T12M)", unit: "SAR m" }, earned: { label: "Earned premium (T12M)", unit: "SAR m" }, claims: { label: "Claims incurred (T12M)", unit: "SAR m" },
      capital: { label: "Allocated capital", unit: "SAR m" }, reserve: { label: "Booked reserve", unit: "SAR m" }, reserveBest: { label: "Best-estimate reserve", unit: "SAR m" }, recoverable: { label: "Reinsurance recoverable", unit: "SAR m" },
    },
    capitalDefinition: "Capital allocated to lines of business (SAR m).", icon: "shield",
  },
  entities: ent,
  metrics: [
    { id: "MET-INS-01", sectorId: S, name: "Loss ratio", theme: "Claims", unit: "% of earned premium", period: "T12M to 30 Sep 2026", decimals: 1, formula: "Σ claims incurred ÷ Σ earned premium × 100.",
      compute: () => ({ value: portLr, sources: ids(lines) }), status: (v) => (v > 75 ? "alert" : v > 70 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≤ 70% ok, > 75% alert.", assumptions: ["Gross of reinsurance."], additive: false },
    { id: "MET-INS-02", sectorId: S, name: "Gross written premium", theme: "Underwriting exposure", unit: "SAR m", period: "T12M to 30 Sep 2026", decimals: 0, formula: "Σ gross written premium across lines of business.",
      compute: () => ({ value: sumAttr(lines, "gwp"), sources: ids(lines) }), status: () => "info", thresholdNote: "Volume indicator.", assumptions: ["Takaful contributions reported on a premium-equivalent basis."], additive: true },
    { id: "MET-INS-03", sectorId: S, name: "Reserve adequacy", theme: "Reserving assumptions", unit: "% of best estimate", period: "As at 30 Sep 2026", decimals: 1, formula: "Σ booked reserves ÷ Σ best-estimate reserves × 100.",
      compute: () => ({ value: adequacy, sources: ids(lines) }), status: (v) => (v < 98 ? "alert" : v < 100 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≥ 100% ok, < 98% alert.", assumptions: ["Best estimate is from an illustrative actuarial run."], additive: false },
    { id: "MET-INS-04", sectorId: S, name: "Largest reinsurer share", theme: "Reinsurance concentration", unit: "% of recoverables", period: "As at 30 Sep 2026", decimals: 1, formula: "Largest single-reinsurer recoverable ÷ Σ recoverables × 100.",
      compute: () => ({ value: topShare, sources: ids(re) }), status: (v) => (v > 50 ? "alert" : v > 40 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≤ 40% ok, > 50% alert.", assumptions: ["Credit ratings not modelled."], additive: false },
  ],
  charts: [
    { id: "CHT-INS-01", sectorId: S, title: "Loss ratio by line of business", subtitle: "T12M to 30 Sep 2026", kind: "bars", xLabel: "Line of business", yLabel: "Loss ratio (%)", unit: "%", decimals: 1, refLine: { value: 75, label: "Alert tolerance 75%" },
      formula: "claims ÷ earned premium per line.", build: (es) => { const l = byCat(es, LB); return { categories: l.map(short), series: [{ name: "Loss ratio", values: l.map(lr) }], sources: ids(l) }; } },
    { id: "CHT-INS-02", sectorId: S, title: "Booked vs best-estimate reserves", subtitle: "As at 30 Sep 2026", kind: "bars", xLabel: "Line of business", yLabel: "SAR m", unit: "SAR m", decimals: 0,
      formula: "reserve and reserveBest per line.", build: (es) => { const l = byCat(es, LB); return { categories: l.map(short), series: [{ name: "Booked reserve", values: l.map((e) => attr(e, "reserve")) }, { name: "Best estimate", values: l.map((e) => attr(e, "reserveBest")) }], sources: ids(l) }; } },
  ],
  signals: [
    { id: "SIG-INS-01", sectorId: S, title: `Engineering reserves SAR ${fmt(attr(eng, "reserveBest") - attr(eng, "reserve"))} m below best estimate`, severity: "high",
      summary: `Booked SAR ${fmt(attr(eng, "reserve"))} m vs best estimate SAR ${fmt(attr(eng, "reserveBest"))} m.`, detectedAt: "2026-10-09T10:00", entityIds: [eng.id], evidenceIds: ["EVD-INS-01"], caseId: "CAS-INS-01", assumptions: ["Large-loss development assumed per illustrative run."] },
    { id: "SIG-INS-02", sectorId: S, title: `Portfolio reserve adequacy ${r1(adequacy)}% (shortfall SAR ${fmt(shortfall)} m)`, severity: "high",
      summary: "Aggregate booked reserves are below the best estimate; shortfall is concentrated in Property & Energy and Engineering.", detectedAt: "2026-10-09T10:20", metricId: "MET-INS-03", entityIds: ids(lines), evidenceIds: ["EVD-INS-01"], caseId: "CAS-INS-01", assumptions: ["Shortfall is net of other lines' surplus."] },
    { id: "SIG-INS-03", sectorId: S, title: `${top.name} holds ${r1(topShare)}% of recoverables`, severity: "high",
      summary: `SAR ${fmt(attr(top, "recoverable"))} m of SAR ${fmt(sumAttr(re, "recoverable"))} m recoverables sit with one reinsurer.`, detectedAt: "2026-10-08T12:00", metricId: "MET-INS-04", entityIds: [top.id], evidenceIds: ["EVD-INS-02"], caseId: "CAS-INS-02", assumptions: ["Recoverables are undisputed."] },
    { id: "SIG-INS-04", sectorId: S, title: `Medical loss ratio ${r1(lr(med))}% above 75% tolerance`, severity: "moderate",
      summary: "Medical claims inflation is outpacing tariff.", detectedAt: "2026-10-10T15:10", entityIds: [med.id], evidenceIds: ["EVD-INS-03"], caseId: "CAS-INS-03", assumptions: ["Tariff unchanged since last renewal."] },
  ],
  cases: [
    { id: "CAS-INS-01", sectorId: S, title: "Reserving review: Engineering and Property", status: "Awaiting decision", owner: "Huda Al-Zahrani (Analyst)", openedAt: "2026-10-09T10:30", summary: "Test reserving assumptions and decide on strengthening.", nextStep: "Approver decision on reserve strengthening.",
      signalIds: ["SIG-INS-01", "SIG-INS-02"], decisionIds: ["DEC-INS-01"], entityIds: [eng.id, ent[0].id], evidenceIds: ["EVD-INS-01"], assumptions: ["Illustrative actuarial run."], expertInputRequested: true },
    { id: "CAS-INS-02", sectorId: S, title: "Reinsurance panel concentration", status: "In analysis", owner: "Faisal Nasser (Analyst)", openedAt: "2026-10-08T12:30", summary: "Assess diversification options for the treaty panel.", nextStep: "Approver view on quota-share placement.",
      signalIds: ["SIG-INS-03"], decisionIds: ["DEC-INS-02"], entityIds: [top.id], evidenceIds: ["EVD-INS-02"], assumptions: ["Panel capacity available."], expertInputRequested: false },
    { id: "CAS-INS-03", sectorId: S, title: "Medical claims and tariff adequacy", status: "Open", owner: "Huda Al-Zahrani (Analyst)", openedAt: "2026-10-10T15:30", summary: "Review medical pricing against claims trend.", nextStep: "Approver view on repricing.",
      signalIds: ["SIG-INS-04"], decisionIds: ["DEC-INS-03"], entityIds: [med.id], evidenceIds: ["EVD-INS-03"], assumptions: ["No regulatory tariff cap."], expertInputRequested: true },
  ],
  decisions: [
    { id: "DEC-INS-01", sectorId: S, title: `Approve reserve strengthening of SAR ${fmt(attr(eng, "reserveBest") - attr(eng, "reserve"))} m on Engineering`, decisionType: "Reserving", amountSARm: attr(eng, "reserveBest") - attr(eng, "reserve"), amountKind: "commitment",
      amountNote: "Capital charge equal to the shortfall to best estimate.", summary: "Raise booked Engineering reserves to best estimate.", proposedBy: "Huda Al-Zahrani", dueBy: "2026-10-31", caseId: "CAS-INS-01", signalIds: ["SIG-INS-01", "SIG-INS-02"], entityIds: [eng.id], evidenceIds: ["EVD-INS-01"],
      options: [{ label: "Strengthen to best estimate", effect: "Closes Engineering gap." }, { label: "Phase over two quarters", effect: "Smooths P&L; gap persists." }], recommendation: "Strengthen fully.", assumptions: ["Best estimate unchanged."] },
    { id: "DEC-INS-02", sectorId: S, title: "Approve 15% quota-share placement with Atlas Re and Najm Re", decisionType: "Reinsurance", amountSARm: null, amountKind: "none", amountNote: "Ceded-premium cost is a Stage 4 scenario output.",
      summary: "Rebalance treaty panel away from the largest reinsurer.", proposedBy: "Faisal Nasser", dueBy: "2026-11-10", caseId: "CAS-INS-02", signalIds: ["SIG-INS-03"], entityIds: [top.id, ent[7].id, ent[8].id], evidenceIds: ["EVD-INS-02"],
      options: [{ label: "Place 15%", effect: "Reduces top share." }, { label: "Retain panel", effect: "Concentration persists." }], recommendation: "Place 15%.", assumptions: ["Capacity at current terms."] },
    { id: "DEC-INS-03", sectorId: S, title: "Approve medical tariff repricing of +6%", decisionType: "Pricing", amountSARm: null, amountKind: "none", amountNote: `Indicative premium effect ≈ SAR ${fmt(attr(med, "gwp") * 0.06)} m (6% × GWP); not a forecast.`,
      summary: "Reprice medical at next renewal cycle.", proposedBy: "Huda Al-Zahrani", dueBy: "2026-11-20", caseId: "CAS-INS-03", signalIds: ["SIG-INS-04"], entityIds: [med.id], evidenceIds: ["EVD-INS-03"],
      options: [{ label: "+6%", effect: "Moves loss ratio toward tolerance." }, { label: "+3%", effect: "Partial correction." }], recommendation: "+6%.", assumptions: ["No lapse response modelled."] },
  ],
  evidence: [
    { id: "EVD-INS-01", sectorId: S, title: "Actuarial reserving run (illustrative)", kind: "Model output", source: "Demonstration actuarial team", asOf: "2026-09-30", summary: "Best-estimate reserves by line." },
    { id: "EVD-INS-02", sectorId: S, title: "Reinsurance recoverables schedule (illustrative)", kind: "Dataset extract", source: "Demonstration reinsurance ledger", asOf: "2026-09-30", summary: "Recoverables by counterparty." },
    { id: "EVD-INS-03", sectorId: S, title: "Medical claims trend report (illustrative)", kind: "Report extract", source: "Demonstration claims analytics", asOf: "2026-09-30", summary: "Frequency and severity trend." },
  ],
  activity: [
    { id: "ACT-INS-01", sectorId: S, at: "2026-10-11T12:00", actor: "Huda Al-Zahrani", text: "Submitted reserve strengthening proposal.", recordId: "DEC-INS-01" },
    { id: "ACT-INS-02", sectorId: S, at: "2026-10-10T15:10", actor: "System (seeded)", text: "Raised medical loss ratio signal.", recordId: "SIG-INS-04" },
    { id: "ACT-INS-03", sectorId: S, at: "2026-10-09T10:30", actor: "Huda Al-Zahrani", text: "Opened reserving review.", recordId: "CAS-INS-01" },
    { id: "ACT-INS-04", sectorId: S, at: "2026-10-08T12:30", actor: "Faisal Nasser", text: "Opened reinsurance concentration case.", recordId: "CAS-INS-02" },
  ],
};
