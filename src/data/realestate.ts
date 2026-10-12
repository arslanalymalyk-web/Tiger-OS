import type { SectorSeed } from "@/lib/types";
import { attr, byCat, fmt, ids, makeEntity, r1, sumAttr } from "./helpers";

const C = "REA";
const S = "realestate" as const;
const A = "Income asset";
const D = "Development";
const ent = [
  makeEntity(C, S, 1, "Olaya Tower Offices", A, "Grade-A office tower, Riyadh.", { leasable: 82, occupied: 74, expiring: 18, capital: 3600 }, { series: { occupied: [79, 78, 77, 76, 75, 74] } }),
  makeEntity(C, S, 2, "Al Noor Retail Galleria", A, "Regional retail centre.", { leasable: 64, occupied: 61, expiring: 9, capital: 2900 }, { series: { occupied: [60, 60, 61, 61, 61, 61] } }),
  makeEntity(C, S, 3, "Diriyah Heights Residential", A, "Residential rental complex.", { leasable: 48, occupied: 44, expiring: 6, capital: 2400 }, { series: { occupied: [42, 43, 43, 44, 44, 44] } }),
  makeEntity(C, S, 4, "Logistics Park North", A, "Warehousing park.", { leasable: 120, occupied: 117, expiring: 28, capital: 1800 }, { series: { occupied: [112, 113, 115, 116, 117, 117] } }),
  makeEntity(C, S, 5, "Eastern Corniche Hotel & Serviced", A, "Hotel and serviced apartments.", { leasable: 36, occupied: 29, expiring: 4, capital: 2100 }, { series: { occupied: [31, 30, 30, 29, 29, 29] } }),
  makeEntity(C, S, 6, "Al Noor Waterfront Phase 1", D, "Mixed-use waterfront development.", { budget: 4800, capital: 2650, complete: 55, planned: 62 }),
  makeEntity(C, S, 7, "Noor Business Park", D, "Business park development.", { budget: 1900, capital: 1420, complete: 78, planned: 76 }),
  makeEntity(C, S, 8, "Marina Residences", D, "Residential development.", { budget: 2600, capital: 880, complete: 31, planned: 40 }),
];
const assets = byCat(ent, A);
const devs = byCat(ent, D);
const occ = (sumAttr(assets, "occupied") / sumAttr(assets, "leasable")) * 100;
const exp = (sumAttr(assets, "expiring") / sumAttr(assets, "occupied")) * 100;
const gap = devs.reduce((a, d) => a + attr(d, "budget") * (attr(d, "planned") - attr(d, "complete")), 0) / sumAttr(devs, "budget");
const all = [...assets, ...devs];
const top2 = [...all].sort((a, b) => attr(b, "capital") - attr(a, "capital")).slice(0, 2);
const conc = (sumAttr(top2, "capital") / sumAttr(all, "capital")) * 100;
const o = (e: (typeof ent)[number], i: number) => (e.series!.occupied[i] / attr(e, "leasable")) * 100;
const olaya = ent[0];
const hotel = ent[4];
const log = ent[3];
const wf = ent[5];
const mar = ent[7];
const sn = (e: (typeof ent)[number]) => e.name.replace(" Offices", "").replace(" Residential", "").replace("Al Noor ", "").replace(" Hotel & Serviced", " Hotel");

export const realestate: SectorSeed = {
  sector: {
    id: S, code: C, name: "Real Estate", short: "Real Estate", entityName: "Al Noor Real Estate Holdings", descriptor: "Real Estate & Development",
    mandate: "Sustain occupancy and rental income, manage lease expiry risk, deliver development milestones, and avoid over-concentration in single assets.",
    analyticalFocus: ["Occupancy", "Lease expiries", "Development milestones", "Asset concentration"],
    periods: ["Q2 25", "Q3 25", "Q4 25", "Q1 26", "Q2 26", "Q3 26"], periodsLabel: "Quarter", reportingPeriod: "Q3 2026", asOf: "2026-10-12T08:00",
    attrs: {
      leasable: { label: "Leasable area", unit: "k sqm" }, occupied: { label: "Occupied area", unit: "k sqm" }, expiring: { label: "Area expiring within 12 months", unit: "k sqm" },
      capital: { label: "Carrying value / spend to date", unit: "SAR m" }, budget: { label: "Approved budget", unit: "SAR m" }, complete: { label: "Completion", unit: "%" }, planned: { label: "Planned completion", unit: "%" },
    },
    capitalDefinition: "Carrying value of income assets plus spend to date on developments (SAR m).", icon: "building",
  },
  entities: ent,
  metrics: [
    { id: "MET-REA-01", sectorId: S, name: "Portfolio occupancy", theme: "Occupancy", unit: "% of leasable area", period: "Q3 2026", decimals: 1, formula: "Σ occupied area ÷ Σ leasable area of income assets × 100.",
      compute: () => ({ value: occ, sources: ids(assets) }), status: (v) => (v < 88 ? "alert" : v < 93 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≥ 93% ok, < 88% alert.", assumptions: ["Area-weighted across asset types."], additive: false },
    { id: "MET-REA-02", sectorId: S, name: "Lease expiries within 12 months", theme: "Lease expiries", unit: "% of occupied area", period: "Next 12 months from 30 Sep 2026", decimals: 1, formula: "Σ area expiring ÷ Σ occupied area × 100.",
      compute: () => ({ value: exp, sources: ids(assets) }), status: (v) => (v > 25 ? "alert" : v > 18 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≤ 18% ok, > 25% alert.", assumptions: ["Break options treated as expiries."], additive: false },
    { id: "MET-REA-03", sectorId: S, name: "Development milestone gap", theme: "Development milestones", unit: "pts behind plan", period: "Q3 2026", decimals: 1, formula: "Σ budget × (planned − actual completion) ÷ Σ budget.",
      compute: () => ({ value: gap, sources: ids(devs) }), status: (v) => (v > 8 ? "alert" : v > 3 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≤ 3 pts ok, > 8 alert.", assumptions: ["Budget-weighted."], additive: false },
    { id: "MET-REA-04", sectorId: S, name: "Top-two asset concentration", theme: "Asset concentration", unit: "% of carrying value", period: "As at 30 Sep 2026", decimals: 1, formula: "Σ capital of two largest assets ÷ Σ capital of all assets and developments × 100.",
      compute: () => ({ value: conc, sources: ids(all) }), status: (v) => (v > 45 ? "alert" : v > 35 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≤ 35% ok, > 45% alert.", assumptions: ["Developments at spend to date."], additive: false },
  ],
  charts: [
    { id: "CHT-REA-01", sectorId: S, title: "Occupancy trend by income asset", subtitle: "Q2 2025 – Q3 2026", kind: "line", xLabel: "Quarter", yLabel: "Occupancy (%)", unit: "%", decimals: 1, yMin: 75, formula: "series.occupied ÷ leasable × 100.",
      build: (es, p) => { const a = byCat(es, A); return { categories: p, series: a.map((e) => ({ name: sn(e), values: p.map((_, i) => o(e, i)) })), sources: ids(a) }; } },
    { id: "CHT-REA-02", sectorId: S, title: "Occupied area and expiries within 12 months", subtitle: "As at 30 Sep 2026", kind: "bars", xLabel: "Income asset", yLabel: "k sqm", unit: "k sqm", decimals: 0, formula: "occupied and expiring per asset.",
      build: (es) => { const a = byCat(es, A); return { categories: a.map(sn), series: [{ name: "Occupied area", values: a.map((e) => attr(e, "occupied")) }, { name: "Expiring ≤ 12 months", values: a.map((e) => attr(e, "expiring")) }], sources: ids(a) }; } },
  ],
  signals: [
    { id: "SIG-REA-01", sectorId: S, title: `Olaya Tower occupancy down ${r1(o(olaya, 0) - o(olaya, 5))} pts to ${r1(o(olaya, 5))}%`, severity: "high",
      summary: "Five consecutive quarters of decline.", detectedAt: "2026-10-09T09:20", entityIds: [olaya.id], evidenceIds: ["EVD-REA-01"], caseId: "CAS-REA-01", assumptions: ["No tenant data on reasons for exit."] },
    { id: "SIG-REA-02", sectorId: S, title: `Logistics Park North: ${r1((attr(log, "expiring") / attr(log, "occupied")) * 100)}% of occupied area expires within 12 months`, severity: "moderate",
      summary: `${attr(log, "expiring")} k sqm expiring of ${attr(log, "occupied")} k sqm occupied; portfolio average ${r1(exp)}%.`, detectedAt: "2026-10-10T10:30", metricId: "MET-REA-02", entityIds: [log.id], evidenceIds: ["EVD-REA-02"], caseId: "CAS-REA-01", assumptions: ["Renewal probability not modelled."] },
    { id: "SIG-REA-03", sectorId: S, title: `Marina Residences ${attr(mar, "planned") - attr(mar, "complete")} pts behind plan`, severity: "high",
      summary: `Completion ${attr(mar, "complete")}% vs planned ${attr(mar, "planned")}%. Portfolio milestone gap ${r1(gap)} pts.`, detectedAt: "2026-10-09T14:00", metricId: "MET-REA-03", entityIds: [mar.id], evidenceIds: ["EVD-REA-03"], caseId: "CAS-REA-02", assumptions: ["Contractor schedule as reported."] },
    { id: "SIG-REA-04", sectorId: S, title: `Waterfront Phase 1 ${attr(wf, "planned") - attr(wf, "complete")} pts behind plan`, severity: "moderate",
      summary: `Completion ${attr(wf, "complete")}% vs planned ${attr(wf, "planned")}%; spend SAR ${fmt(attr(wf, "capital"))} m of SAR ${fmt(attr(wf, "budget"))} m.`, detectedAt: "2026-10-10T16:00", entityIds: [wf.id], evidenceIds: ["EVD-REA-03"], caseId: "CAS-REA-02", assumptions: ["Progress certified by project manager."] },
  ],
  cases: [
    { id: "CAS-REA-01", sectorId: S, title: "Olaya Tower leasing recovery", status: "Awaiting decision", owner: "Abdulaziz Al-Rashid (Analyst)", openedAt: "2026-10-09T09:45", summary: "Restore occupancy and manage renewal risk across income assets.", nextStep: "Approver decision on refurbishment and incentives.",
      signalIds: ["SIG-REA-01", "SIG-REA-02"], decisionIds: ["DEC-REA-01"], entityIds: [olaya.id, log.id, hotel.id], evidenceIds: ["EVD-REA-01", "EVD-REA-02"], assumptions: ["Market rents flat."], expertInputRequested: true },
    { id: "CAS-REA-02", sectorId: S, title: "Development delivery recovery", status: "In analysis", owner: "Dalal Al-Shehri (Analyst)", openedAt: "2026-10-09T14:30", summary: "Recover schedule on Marina Residences and Waterfront Phase 1.", nextStep: "Approver decision on acceleration.",
      signalIds: ["SIG-REA-03", "SIG-REA-04"], decisionIds: ["DEC-REA-02"], entityIds: [mar.id, wf.id], evidenceIds: ["EVD-REA-03"], assumptions: ["Contractor capacity available."], expertInputRequested: false },
  ],
  decisions: [
    { id: "DEC-REA-01", sectorId: S, title: "Approve Olaya Tower refurbishment and tenant incentive package", decisionType: "Capital project", amountSARm: 180, amountKind: "commitment", amountNote: "Illustrative budget.", summary: "Refurbish common areas and fund incentives.",
      proposedBy: "Abdulaziz Al-Rashid", dueBy: "2026-11-08", caseId: "CAS-REA-01", signalIds: ["SIG-REA-01"], entityIds: [olaya.id], evidenceIds: ["EVD-REA-01"],
      options: [{ label: "Approve package", effect: "Targets return to 90%+ occupancy." }, { label: "Incentives only", effect: "Lower cost, less differentiation." }], recommendation: "Approve package.", assumptions: ["Eight-month programme."] },
    { id: "DEC-REA-02", sectorId: S, title: "Approve contractor acceleration for Marina Residences", decisionType: "Capital programme", amountSARm: 95, amountKind: "commitment", amountNote: "Illustrative acceleration cost.", summary: "Add shifts and materials to recover schedule.",
      proposedBy: "Dalal Al-Shehri", dueBy: "2026-11-14", caseId: "CAS-REA-02", signalIds: ["SIG-REA-03"], entityIds: [mar.id], evidenceIds: ["EVD-REA-03"],
      options: [{ label: "Accelerate", effect: "Recovers most of the gap." }, { label: "Re-baseline schedule", effect: "No cost; later handover." }], recommendation: "Accelerate.", assumptions: ["No supply constraints."] },
  ],
  evidence: [
    { id: "EVD-REA-01", sectorId: S, title: "Occupancy ledger (illustrative)", kind: "Dataset extract", source: "Demonstration property system", asOf: "2026-09-30", summary: "Leasable and occupied area by quarter." },
    { id: "EVD-REA-02", sectorId: S, title: "Lease expiry schedule (illustrative)", kind: "Schedule", source: "Demonstration lease register", asOf: "2026-09-30", summary: "Area expiring in next 12 months." },
    { id: "EVD-REA-03", sectorId: S, title: "Development progress report (illustrative)", kind: "Report extract", source: "Demonstration project controls", asOf: "2026-09-30", summary: "Planned vs actual completion and spend." },
  ],
  activity: [
    { id: "ACT-REA-01", sectorId: S, at: "2026-10-11T11:00", actor: "Abdulaziz Al-Rashid", text: "Submitted refurbishment proposal.", recordId: "DEC-REA-01" },
    { id: "ACT-REA-02", sectorId: S, at: "2026-10-10T16:00", actor: "System (seeded)", text: "Raised Waterfront delay signal.", recordId: "SIG-REA-04" },
    { id: "ACT-REA-03", sectorId: S, at: "2026-10-09T14:30", actor: "Dalal Al-Shehri", text: "Opened development delivery case.", recordId: "CAS-REA-02" },
    { id: "ACT-REA-04", sectorId: S, at: "2026-10-09T09:45", actor: "Abdulaziz Al-Rashid", text: "Opened Olaya leasing case.", recordId: "CAS-REA-01" },
  ],
};
