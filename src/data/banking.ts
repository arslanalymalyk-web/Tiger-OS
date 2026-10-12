import type { Entity, SectorSeed } from "@/lib/types";
import { attr, byCat, fmt, ids, makeEntity, r1, sum, sumAttr } from "./helpers";

const C = "BNK";
const S = "banking" as const;
const Q = ["Q2 25", "Q3 25", "Q4 25", "Q1 26", "Q2 26", "Q3 26"];

const ent = [
  makeEntity(C, S, 1, "Corporate Lending – Energy & Utilities", "Credit portfolio", "Term and project loans to energy and utility borrowers.", { exposure: 18400, rwa: 16800, capital: 2350, npl: 310 }),
  makeEntity(C, S, 2, "Corporate Lending – Real Estate & Construction", "Credit portfolio", "Development and investment property lending.", { exposure: 14200, rwa: 14900, capital: 2050, npl: 590 }),
  makeEntity(C, S, 3, "SME Lending", "Credit portfolio", "Small and medium enterprise credit.", { exposure: 6800, rwa: 6100, capital: 880, npl: 340 }),
  makeEntity(C, S, 4, "Retail Mortgages", "Credit portfolio", "Residential mortgage book.", { exposure: 21500, rwa: 7900, capital: 1130, npl: 215 }),
  makeEntity(C, S, 5, "Trade Finance", "Credit portfolio", "Letters of credit and trade loans.", { exposure: 9100, rwa: 6400, capital: 840, npl: 120 }),
  makeEntity(C, S, 6, "Treasury Liquidity Portfolio", "Liquidity", "High-quality liquid assets (HQLA) held for liquidity coverage.", { hqla: 27500, rwa: 1800, capital: 600 },
    { series: { hqla: [25100, 25800, 26300, 26900, 27200, 27500] } }),
  makeEntity(C, S, 7, "Retail Deposit Base", "Funding", "Retail deposits; value is stressed 30-day outflow.", { outflow30: 6100 }, { series: { outflow30: [5600, 5700, 5800, 5900, 6000, 6100] } }),
  makeEntity(C, S, 8, "Corporate Deposit Base", "Funding", "Corporate deposits; value is stressed 30-day outflow.", { outflow30: 11800 }, { series: { outflow30: [10600, 10900, 11200, 11400, 11600, 11800] } }),
  makeEntity(C, S, 9, "Wholesale Funding", "Funding", "Interbank and wholesale funding; value is stressed 30-day outflow.", { outflow30: 5300 }, { series: { outflow30: [4500, 4700, 4900, 5000, 5200, 5300] } }),
  makeEntity(C, S, 10, "Al Noor Pay Platform", "Payments", "Domestic instant payments switch.", { rwa: 700, capital: 150, minutes: 43200, downtimeMin: 38 }),
  makeEntity(C, S, 11, "Regulatory Capital Stack", "Capital", "Eligible regulatory capital (illustrative composition).", { eligibleCapital: 9400 }),
];
const credit = byCat(ent, "Credit portfolio");
const liq = ent[5];
const funding = byCat(ent, "Funding");
const totalRwa = sumAttr(ent, "rwa");
const car = (attr(ent[10], "eligibleCapital") / totalRwa) * 100;
const lcr = (sumAttr([liq], "hqla") / sumAttr(funding, "outflow30")) * 100;
const lcrAt = (i: number) => (liq.series!.hqla[i] / sum(funding.map((f) => f.series!.outflow30[i]))) * 100;
const top2 = [...credit].sort((a, b) => attr(b, "exposure") - attr(a, "exposure")).slice(0, 2);
const conc = (sumAttr(credit, "exposure") > 0 ? sumAttr(top2, "exposure") / sumAttr(credit, "exposure") : 0) * 100;
const pay = ent[9];
const avail = (1 - attr(pay, "downtimeMin") / attr(pay, "minutes")) * 100;
const re = ent[1];
const reNpl = (attr(re, "npl") / attr(re, "exposure")) * 100;
const bookNpl = (sumAttr(credit, "npl") / sumAttr(credit, "exposure")) * 100;
const whs = ent[8];
const whsGrowth = ((attr(whs, "outflow30") - whs.series!.outflow30[0]) / whs.series!.outflow30[0]) * 100;

export const banking: SectorSeed = {
  sector: {
    id: S, code: C, name: "Banking & Fintech", short: "Banking", entityName: "Al Noor Financial Authority", descriptor: "Banking & Fintech",
    mandate: "Maintain strong capital and liquidity, manage concentration in the credit book, and keep national payment rails resilient.",
    analyticalFocus: ["Capital", "Liquidity", "Credit exposure", "Payment resilience"],
    periods: Q, periodsLabel: "Quarter", reportingPeriod: "Q3 2026", asOf: "2026-10-12T08:00",
    attrs: {
      exposure: { label: "Gross credit exposure", unit: "SAR m" }, rwa: { label: "Risk-weighted assets", unit: "SAR m" }, capital: { label: "Allocated capital", unit: "SAR m" },
      npl: { label: "Non-performing exposure", unit: "SAR m" }, hqla: { label: "HQLA", unit: "SAR m" }, outflow30: { label: "Stressed 30-day outflow", unit: "SAR m" },
      eligibleCapital: { label: "Eligible regulatory capital", unit: "SAR m" }, minutes: { label: "Minutes in window", unit: "min" }, downtimeMin: { label: "Downtime", unit: "min" },
    },
    capitalDefinition: "Capital allocated to portfolios, treasury and payments (SAR m). Excludes unallocated eligible-capital buffer.",
    icon: "landmark",
  },
  entities: ent,
  metrics: [
    { id: "MET-BNK-01", sectorId: S, name: "Capital adequacy ratio", theme: "Capital", unit: "% of RWA", period: "As at 30 Sep 2026", decimals: 1,
      formula: "Eligible regulatory capital ÷ Σ risk-weighted assets × 100.",
      compute: () => ({ value: car, sources: [ent[10].id, ...ent.filter((e) => attr(e, "rwa") > 0).map((e) => e.id)] }),
      status: (v) => (v < 14 ? "alert" : v < 16 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≥ 16% ok, < 14% alert.", assumptions: ["Illustrative capital stack; not a regulatory return."], additive: false },
    { id: "MET-BNK-02", sectorId: S, name: "Liquidity coverage ratio", theme: "Liquidity", unit: "% of 30-day outflow", period: "Q3 2026 (30-day stress)", decimals: 1,
      formula: "HQLA ÷ Σ stressed 30-day outflows (retail, corporate, wholesale) × 100.",
      compute: () => ({ value: lcr, sources: [liq.id, ...ids(funding)] }),
      status: (v) => (v < 105 ? "alert" : v < 120 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≥ 120% ok, < 105% alert.", assumptions: ["Run-off rates are embedded in the stressed outflow values."], additive: false },
    { id: "MET-BNK-03", sectorId: S, name: "Top-two sector credit concentration", theme: "Credit exposure", unit: "% of gross exposure", period: "As at 30 Sep 2026", decimals: 1,
      formula: "Σ gross exposure of the two largest credit portfolios ÷ Σ gross credit exposure × 100.",
      compute: () => ({ value: conc, sources: ids(credit) }),
      status: (v) => (v > 50 ? "alert" : v > 40 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≤ 40% ok, > 50% alert.", assumptions: ["Portfolios are treated as mutually exclusive."], additive: false },
    { id: "MET-BNK-04", sectorId: S, name: "Payment platform availability", theme: "Payment resilience", unit: "% uptime", period: "30 days to 30 Sep 2026", decimals: 3,
      formula: "(1 − downtime minutes ÷ minutes in window) × 100.",
      compute: () => ({ value: avail, sources: [pay.id] }),
      status: (v) => (v < 99.9 ? "alert" : v < 99.95 ? "watch" : "ok"), thresholdNote: "Internal target 99.95%; alert below 99.9%.", assumptions: ["Planned maintenance is excluded from downtime."], additive: false },
  ],
  charts: [
    { id: "CHT-BNK-01", sectorId: S, title: "Gross exposure and RWA by credit portfolio", subtitle: "As at 30 Sep 2026", kind: "bars", xLabel: "Credit portfolio", yLabel: "SAR m", unit: "SAR m", decimals: 0,
      formula: "exposure and rwa attributes for each credit portfolio.",
      build: (es) => { const c = byCat(es, "Credit portfolio"); return { categories: c.map((e) => ({ "ENT-BNK-01": "Corp. Energy", "ENT-BNK-02": "Corp. Real Estate", "ENT-BNK-03": "SME", "ENT-BNK-04": "Mortgages", "ENT-BNK-05": "Trade Finance" }[e.id] ?? e.name)), series: [{ name: "Gross exposure", values: c.map((e) => attr(e, "exposure")) }, { name: "Risk-weighted assets", values: c.map((e) => attr(e, "rwa")) }], sources: ids(c) }; } },
    { id: "CHT-BNK-02", sectorId: S, title: "Liquidity coverage ratio trend", subtitle: "Q2 2025 – Q3 2026", kind: "line", xLabel: "Quarter", yLabel: "LCR (%)", unit: "%", decimals: 1, yMin: 100, refLine: { value: 120, label: "Demonstration tolerance 120%" },
      formula: "HQLA ÷ Σ stressed outflows for each quarter × 100.",
      build: (es, p) => { const l = es.find((e) => e.category === "Liquidity")!; const f = byCat(es, "Funding"); return { categories: p, series: [{ name: "LCR", values: p.map((_, i) => (l.series!.hqla[i] / sum(f.map((x) => x.series!.outflow30[i]))) * 100) }], sources: [l.id, ...ids(f)] }; } },
  ],
  signals: [
    { id: "SIG-BNK-01", sectorId: S, title: `LCR down ${r1(lcrAt(0) - lcrAt(5))} pts over six quarters`, severity: "moderate",
      summary: `Coverage fell from ${r1(lcrAt(0))}% to ${r1(lcrAt(5))}% as stressed outflows grew faster than HQLA.`, detectedAt: "2026-10-10T09:30", metricId: "MET-BNK-02",
      entityIds: [liq.id, ...ids(funding)], evidenceIds: ["EVD-BNK-01"], caseId: "CAS-BNK-01", assumptions: ["Quarter-end values; intra-quarter movements are not shown."] },
    { id: "SIG-BNK-02", sectorId: S, title: `Wholesale funding outflow up ${r1(whsGrowth)}% in five quarters`, severity: "moderate",
      summary: "Growth in wholesale funding raises stressed outflow and refinancing sensitivity.", detectedAt: "2026-10-10T10:10", entityIds: [whs.id], evidenceIds: ["EVD-BNK-01"], caseId: "CAS-BNK-01", assumptions: ["Run-off assumptions unchanged."] },
    { id: "SIG-BNK-03", sectorId: S, title: `Real-estate NPL ratio ${r1(reNpl)}% vs ${r1(bookNpl)}% book average`, severity: "high",
      summary: `Non-performing exposure of SAR ${fmt(attr(re, "npl"))} m on SAR ${fmt(attr(re, "exposure"))} m. Concentration is ${r1(conc)}% across the top two sectors.`, detectedAt: "2026-10-09T13:00", metricId: "MET-BNK-03",
      entityIds: [re.id, ent[0].id], evidenceIds: ["EVD-BNK-02"], caseId: "CAS-BNK-02", assumptions: ["NPL defined at 90 days past due."] },
    { id: "SIG-BNK-04", sectorId: S, title: `Payment availability ${avail.toFixed(3)}% below 99.95% target`, severity: "high",
      summary: `${attr(pay, "downtimeMin")} minutes of downtime in the 30-day window.`, detectedAt: "2026-10-08T08:45", metricId: "MET-BNK-04", entityIds: [pay.id], evidenceIds: ["EVD-BNK-03"], caseId: "CAS-BNK-03", assumptions: ["Single-switch architecture assumed."] },
  ],
  cases: [
    { id: "CAS-BNK-01", sectorId: S, title: "Liquidity buffer outlook", status: "In analysis", owner: "Noura Al-Fahad (Analyst)", openedAt: "2026-10-10T10:30", summary: "Assess whether HQLA growth keeps pace with stressed outflows.",
      nextStep: "Approver review of HQLA top-up proposal.", signalIds: ["SIG-BNK-01", "SIG-BNK-02"], decisionIds: ["DEC-BNK-01"], entityIds: [liq.id, whs.id], evidenceIds: ["EVD-BNK-01"], assumptions: ["Demonstration stress parameters."], expertInputRequested: true },
    { id: "CAS-BNK-02", sectorId: S, title: "Real-estate credit watchlist", status: "Awaiting decision", owner: "Khalid Mansour (Analyst)", openedAt: "2026-10-09T13:30", summary: "Review limits and provisioning for the real-estate book.",
      nextStep: "Approver decision on limit change.", signalIds: ["SIG-BNK-03"], decisionIds: ["DEC-BNK-02"], entityIds: [re.id], evidenceIds: ["EVD-BNK-02"], assumptions: ["No collateral revaluation applied."], expertInputRequested: false },
    { id: "CAS-BNK-03", sectorId: S, title: "Payment platform resilience", status: "Open", owner: "Sara Al-Otaibi (Analyst)", openedAt: "2026-10-08T09:00", summary: "Evaluate redundancy options for the payments switch.",
      nextStep: "Approver decision on redundant switch.", signalIds: ["SIG-BNK-04"], decisionIds: ["DEC-BNK-03"], entityIds: [pay.id], evidenceIds: ["EVD-BNK-03"], assumptions: ["Cost estimate is indicative."], expertInputRequested: true },
  ],
  decisions: [
    { id: "DEC-BNK-01", sectorId: S, title: "Approve HQLA top-up via SAR 2,000 m sukuk purchase", decisionType: "Treasury allocation", amountSARm: 2000, amountKind: "reallocation", amountNote: "Reallocation of surplus liquidity; not new capital.",
      summary: "Increase HQLA to restore coverage toward the 120% tolerance.", proposedBy: "Noura Al-Fahad", dueBy: "2026-10-28", caseId: "CAS-BNK-01", signalIds: ["SIG-BNK-01", "SIG-BNK-02"], entityIds: [liq.id], evidenceIds: ["EVD-BNK-01"],
      options: [{ label: "Purchase SAR 2,000 m", effect: "Restores LCR above tolerance on current outflows." }, { label: "Reduce wholesale funding", effect: "Lowers outflow, higher funding cost." }], recommendation: "Purchase, then review funding mix.", assumptions: ["Outflows held at Q3 2026 level."] },
    { id: "DEC-BNK-02", sectorId: S, title: "Tighten real-estate single-name limits by 15%", decisionType: "Risk limit", amountSARm: null, amountKind: "none", amountNote: "Limit change; no capital amount in Stage 1.",
      summary: "Reduce single-name limits in the real-estate portfolio.", proposedBy: "Khalid Mansour", dueBy: "2026-11-02", caseId: "CAS-BNK-02", signalIds: ["SIG-BNK-03"], entityIds: [re.id], evidenceIds: ["EVD-BNK-02"],
      options: [{ label: "Tighten 15%", effect: "Slows concentration growth." }, { label: "Maintain limits", effect: "Higher concentration persists." }], recommendation: "Tighten 15%.", assumptions: ["No new origination shock assumed."] },
    { id: "DEC-BNK-03", sectorId: S, title: "Approve redundant payment switch", decisionType: "Capital project", amountSARm: 120, amountKind: "commitment", amountNote: "Illustrative project budget.",
      summary: "Add an active-active switch to remove the single point of failure.", proposedBy: "Sara Al-Otaibi", dueBy: "2026-11-15", caseId: "CAS-BNK-03", signalIds: ["SIG-BNK-04"], entityIds: [pay.id], evidenceIds: ["EVD-BNK-03"],
      options: [{ label: "Approve", effect: "Target availability ≥ 99.95%." }, { label: "Defer", effect: "Availability risk persists." }], recommendation: "Approve.", assumptions: ["12-month delivery assumed."] },
  ],
  evidence: [
    { id: "EVD-BNK-01", sectorId: S, title: "Liquidity ladder Q2 25–Q3 26 (illustrative)", kind: "Dataset extract", source: "Demonstration treasury ledger", asOf: "2026-09-30", summary: "HQLA and stressed outflows by quarter." },
    { id: "EVD-BNK-02", sectorId: S, title: "Real-estate portfolio quality report (illustrative)", kind: "Report extract", source: "Demonstration credit risk", asOf: "2026-09-30", summary: "Exposure, NPL and watchlist names." },
    { id: "EVD-BNK-03", sectorId: S, title: "Payments incident log (illustrative)", kind: "Incident log", source: "Demonstration operations", asOf: "2026-09-30", summary: "Downtime events in the 30-day window." },
  ],
  activity: [
    { id: "ACT-BNK-01", sectorId: S, at: "2026-10-11T15:00", actor: "Noura Al-Fahad", text: "Proposed HQLA top-up.", recordId: "DEC-BNK-01" },
    { id: "ACT-BNK-02", sectorId: S, at: "2026-10-10T10:10", actor: "System (seeded)", text: "Raised wholesale funding signal.", recordId: "SIG-BNK-02" },
    { id: "ACT-BNK-03", sectorId: S, at: "2026-10-09T13:30", actor: "Khalid Mansour", text: "Opened real-estate watchlist case.", recordId: "CAS-BNK-02" },
    { id: "ACT-BNK-04", sectorId: S, at: "2026-10-08T09:00", actor: "Sara Al-Otaibi", text: "Opened payment resilience case.", recordId: "CAS-BNK-03" },
  ],
};
void ({} as Entity);
