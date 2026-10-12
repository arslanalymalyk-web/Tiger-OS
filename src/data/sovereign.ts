import type { SectorSeed } from "@/lib/types";
import { attr, byCat, fmt, ids, makeEntity, r1, sum, sumAttr } from "./helpers";

const C = "SOV";
const S = "sovereign" as const;
const K = "Portfolio class";
const ent = [
  makeEntity(C, S, 1, "Global Public Equities", K, "Diversified listed equities.", { capital: 38000, target: 30, min: 25, max: 35, liquid: 1, unfunded: 0 }, { series: { capital: [31500, 33200, 34900, 35800, 37100, 38000] } }),
  makeEntity(C, S, 2, "Sukuk & Fixed Income", K, "Sovereign and corporate sukuk.", { capital: 24500, target: 22, min: 18, max: 26, liquid: 1, unfunded: 0 }, { series: { capital: [23900, 24100, 24200, 24300, 24400, 24500] } }),
  makeEntity(C, S, 3, "Private Markets Funds", K, "Private equity, credit and infrastructure funds.", { capital: 17200, target: 15, min: 12, max: 18, liquid: 0, unfunded: 6400 }, { series: { capital: [15100, 15600, 16000, 16500, 16900, 17200] } }),
  makeEntity(C, S, 4, "Strategic Direct Investments", K, "Direct stakes outside the Group's sector entities.", { capital: 11800, target: 9, min: 6, max: 12, liquid: 0, unfunded: 2100 }, { series: { capital: [11200, 11300, 11500, 11600, 11700, 11800] } }),
  makeEntity(C, S, 5, "Treasury & Cash Reserves", K, "Cash and short-term instruments.", { capital: 9500, target: 8, min: 5, max: 11, liquid: 1, unfunded: 0 }, { series: { capital: [14300, 12800, 11200, 10400, 9900, 9500] } }),
];
const cls = ent;
const total = sumAttr(cls, "capital");
const w = (e: (typeof ent)[number]) => (attr(e, "capital") / total) * 100;
const inBand = cls.filter((e) => w(e) >= attr(e, "min") && w(e) <= attr(e, "max"));
const aligned = (sumAttr(inBand, "capital") / total) * 100;
const largest = [...cls].sort((a, b) => attr(b, "capital") - attr(a, "capital"))[0];
const liquidVal = sumAttr(cls.filter((e) => attr(e, "liquid") === 1), "capital");
const unf = sumAttr(cls, "unfunded");
const liqCover = liquidVal / unf;
const eq = ent[0];
const cash = ent[4];
const wAt = (e: (typeof ent)[number], i: number) => (e.series!.capital[i] / sum(cls.map((c) => c.series!.capital[i]))) * 100;
const trim = attr(eq, "capital") - (attr(eq, "max") / 100) * total;
const sn = (e: (typeof ent)[number]) => e.name.replace("Global Public ", "").replace(" & Fixed Income", "").replace("Private Markets Funds", "Private Markets").replace("Strategic Direct Investments", "Direct Inv.").replace("Treasury & Cash Reserves", "Cash");
const kls = (es: typeof ent) => es.filter((e) => e.category === K);

export const sovereign: SectorSeed = {
  sector: {
    id: S, code: C, name: "Sovereign Capital", short: "Sovereign Capital", entityName: "Al Noor Sovereign Capital Office", descriptor: "Sovereign Capital Intelligence",
    mandate: "Allocate the external portfolio within mandate bands, limit concentration, and keep liquidity sufficient for unfunded commitments. Holdings in Group sector entities are shown as a memo and excluded from totals.",
    analyticalFocus: ["Portfolio allocation", "Mandate alignment", "Concentration", "Liquidity and commitments"],
    periods: ["Q2 25", "Q3 25", "Q4 25", "Q1 26", "Q2 26", "Q3 26"], periodsLabel: "Quarter", reportingPeriod: "Q3 2026", asOf: "2026-10-12T08:00",
    attrs: {
      capital: { label: "Market value", unit: "SAR m" }, target: { label: "Mandate target weight", unit: "%" }, min: { label: "Band minimum", unit: "%" }, max: { label: "Band maximum", unit: "%" },
      liquid: { label: "Liquid within 30 days", unit: "flag (1=yes)" }, unfunded: { label: "Unfunded commitments", unit: "SAR m" },
    },
    capitalDefinition: "Market value of the external portfolio (SAR m). Stakes in Group sector entities are excluded to avoid double counting.", icon: "globe",
  },
  entities: ent,
  metrics: [
    { id: "MET-SOV-01", sectorId: S, name: "External portfolio value", theme: "Portfolio allocation", unit: "SAR m", period: "As at 30 Sep 2026", decimals: 0, formula: "Σ market value of the five external portfolio classes (memo stakes excluded).",
      compute: (es) => { const k = kls(es); return { value: sumAttr(k, "capital"), sources: ids(k) }; }, status: () => "info", thresholdNote: "Volume indicator.", assumptions: ["Market values at quarter-end marks."], additive: true },
    { id: "MET-SOV-02", sectorId: S, name: "Mandate alignment", theme: "Mandate alignment", unit: "% of portfolio within band", period: "Q3 2026", decimals: 1, formula: "Σ value of classes whose weight lies within [min, max] ÷ Σ value × 100.",
      compute: (es) => { const k = kls(es); return { value: aligned, sources: ids(k) }; }, status: (v) => (v < 70 ? "alert" : v < 90 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≥ 90% ok, < 70% alert.", assumptions: ["Bands per illustrative mandate."], additive: false },
    { id: "MET-SOV-03", sectorId: S, name: "Largest class concentration", theme: "Concentration", unit: "% of portfolio", period: "Q3 2026", decimals: 1, formula: "Market value of the largest class ÷ Σ value × 100.",
      compute: (es) => { const k = kls(es); return { value: w(largest), sources: ids(k) }; }, status: (v) => (v > 40 ? "alert" : v > 33 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≤ 33% ok, > 40% alert.", assumptions: ["Classes are mutually exclusive."], additive: false },
    { id: "MET-SOV-04", sectorId: S, name: "Liquid cover of unfunded commitments", theme: "Liquidity and commitments", unit: "× cover", period: "As at 30 Sep 2026", decimals: 1, formula: "Σ value of classes liquid within 30 days ÷ Σ unfunded commitments.",
      compute: (es) => { const k = kls(es); return { value: liqCover, sources: ids(k) }; }, status: (v) => (v < 4 ? "alert" : v < 6 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≥ 6× ok, < 4× alert.", assumptions: ["Calls assumed within 24 months."], additive: false },
  ],
  charts: [
    { id: "CHT-SOV-01", sectorId: S, title: "Actual vs target weight by portfolio class", subtitle: "Q3 2026", kind: "bars", xLabel: "Portfolio class", yLabel: "Weight (% of portfolio)", unit: "%", decimals: 1, formula: "value ÷ Σ value × 100 vs mandate target.",
      build: (es) => { const k = kls(es); const t = sumAttr(k, "capital"); return { categories: k.map(sn), series: [{ name: "Actual", values: k.map((e) => (attr(e, "capital") / t) * 100) }, { name: "Mandate target", values: k.map((e) => attr(e, "target")) }], sources: ids(k) }; } },
    { id: "CHT-SOV-02", sectorId: S, title: "Portfolio weight trend", subtitle: "Q2 2025 – Q3 2026", kind: "line", xLabel: "Quarter", yLabel: "Weight (% of portfolio)", unit: "%", decimals: 1, yMin: 0, formula: "series.capital ÷ Σ series.capital per quarter × 100.",
      build: (es, p) => { const k = kls(es); return { categories: p, series: k.map((e) => ({ name: sn(e), values: p.map((_, i) => (e.series!.capital[i] / sum(k.map((c) => c.series!.capital[i]))) * 100) })), sources: ids(k) }; } },
  ],
  signals: [
    { id: "SIG-SOV-01", sectorId: S, title: `Global equities at ${r1(w(eq))}%, above ${attr(eq, "max")}% band maximum`, severity: "high",
      summary: `Drift of ${r1(w(eq) - attr(eq, "max"))} pts above band; mandate alignment ${r1(aligned)}%.`, detectedAt: "2026-10-10T08:00", metricId: "MET-SOV-02", entityIds: [eq.id], evidenceIds: ["EVD-SOV-01"], caseId: "CAS-SOV-01", assumptions: ["Quarter-end marks."] },
    { id: "SIG-SOV-02", sectorId: S, title: `Equity weight up ${r1(wAt(eq, 5) - wAt(eq, 0))} pts in six quarters`, severity: "moderate",
      summary: `From ${r1(wAt(eq, 0))}% to ${r1(wAt(eq, 5))}%, driven by market gains and cash drawdown.`, detectedAt: "2026-10-10T08:20", metricId: "MET-SOV-03", entityIds: [eq.id], evidenceIds: ["EVD-SOV-01"], caseId: "CAS-SOV-01", assumptions: ["No rebalancing in period."] },
    { id: "SIG-SOV-03", sectorId: S, title: `Unfunded commitments SAR ${fmt(unf)} m equal ${r1((unf / attr(cash, "capital")) * 100)}% of cash reserves`, severity: "high",
      summary: `Liquid assets cover commitments ${r1(liqCover)}×; cash alone covers ${r1(attr(cash, "capital") / unf)}×.`, detectedAt: "2026-10-09T10:00", metricId: "MET-SOV-04", entityIds: [ent[2].id, ent[3].id, cash.id], evidenceIds: ["EVD-SOV-02"], caseId: "CAS-SOV-02", assumptions: ["Calls assumed within 24 months."] },
    { id: "SIG-SOV-04", sectorId: S, title: `Cash reserves down ${r1(((cash.series!.capital[0] - attr(cash, "capital")) / cash.series!.capital[0]) * 100)}% since Q2 2025`, severity: "moderate",
      summary: "Cash funded private-market calls and direct investments.", detectedAt: "2026-10-09T10:30", entityIds: [cash.id], evidenceIds: ["EVD-SOV-02"], caseId: "CAS-SOV-02", assumptions: ["Drawdown trend continues."] },
  ],
  cases: [
    { id: "CAS-SOV-01", sectorId: S, title: "Equity overweight and rebalancing", status: "Awaiting decision", owner: "Reema Al-Salem (Analyst)", openedAt: "2026-10-10T08:45", summary: "Return equities toward band ceiling.", nextStep: "Approver decision on rebalance.",
      signalIds: ["SIG-SOV-01", "SIG-SOV-02"], decisionIds: ["DEC-SOV-01"], entityIds: [eq.id], evidenceIds: ["EVD-SOV-01"], assumptions: ["Transaction costs excluded."], expertInputRequested: true },
    { id: "CAS-SOV-02", sectorId: S, title: "Liquidity versus unfunded commitments", status: "In analysis", owner: "Nasser Al-Kuwari (Analyst)", openedAt: "2026-10-09T11:00", summary: "Ensure liquidity sleeve covers expected calls.", nextStep: "Approver decision on liquidity reallocation.",
      signalIds: ["SIG-SOV-03", "SIG-SOV-04"], decisionIds: ["DEC-SOV-02"], entityIds: [cash.id, ent[2].id], evidenceIds: ["EVD-SOV-02"], assumptions: ["Call schedule indicative."], expertInputRequested: false },
  ],
  decisions: [
    { id: "DEC-SOV-01", sectorId: S, title: `Approve rebalance: trim global equities by SAR ${fmt(Math.round(trim))} m`, decisionType: "Allocation", amountSARm: Math.round(trim), amountKind: "reallocation",
      amountNote: "Value above the 35% ceiling; reallocation within the portfolio, not new capital.", summary: "Sell equities to the band ceiling and move proceeds to cash and sukuk.", proposedBy: "Reema Al-Salem", dueBy: "2026-10-29", caseId: "CAS-SOV-01", signalIds: ["SIG-SOV-01", "SIG-SOV-02"], entityIds: [eq.id],
      evidenceIds: ["EVD-SOV-01"], options: [{ label: "Trim to ceiling", effect: "Restores equity to 35%." }, { label: "Trim to target", effect: "Larger sale, higher cost." }], recommendation: "Trim to ceiling.", assumptions: ["Prices at 30 Sep 2026."] },
    { id: "DEC-SOV-02", sectorId: S, title: "Approve SAR 3,000 m reallocation from sukuk to cash", decisionType: "Liquidity", amountSARm: 3000, amountKind: "reallocation", amountNote: "Reallocation within liquid assets; not new capital.", summary: "Rebuild cash against calls.",
      proposedBy: "Nasser Al-Kuwari", dueBy: "2026-11-05", caseId: "CAS-SOV-02", signalIds: ["SIG-SOV-03"], entityIds: [cash.id, ent[1].id], evidenceIds: ["EVD-SOV-02"],
      options: [{ label: "Reallocate", effect: "Cash covers calls more fully." }, { label: "Use credit facility", effect: "Adds leverage." }], recommendation: "Reallocate.", assumptions: ["Sukuk liquidation at par."] },
  ],
  evidence: [
    { id: "EVD-SOV-01", sectorId: S, title: "Portfolio valuation report (illustrative)", kind: "Report extract", source: "Demonstration custody ledger", asOf: "2026-09-30", summary: "Market values by class and quarter." },
    { id: "EVD-SOV-02", sectorId: S, title: "Commitment and liquidity schedule (illustrative)", kind: "Schedule", source: "Demonstration treasury", asOf: "2026-09-30", summary: "Unfunded commitments and liquid assets." },
  ],
  activity: [
    { id: "ACT-SOV-01", sectorId: S, at: "2026-10-11T13:00", actor: "Reema Al-Salem", text: "Submitted rebalance proposal.", recordId: "DEC-SOV-01" },
    { id: "ACT-SOV-02", sectorId: S, at: "2026-10-10T08:45", actor: "Reema Al-Salem", text: "Opened equity rebalancing case.", recordId: "CAS-SOV-01" },
    { id: "ACT-SOV-03", sectorId: S, at: "2026-10-09T11:00", actor: "Nasser Al-Kuwari", text: "Opened liquidity case.", recordId: "CAS-SOV-02" },
    { id: "ACT-SOV-04", sectorId: S, at: "2026-10-09T10:00", actor: "System (seeded)", text: "Raised commitments signal.", recordId: "SIG-SOV-03" },
  ],
};
void byCat;
