import type { SectorSeed } from "@/lib/types";
import { attr, byCat, fmt, ids, makeEntity, r1, sumAttr } from "./helpers";

const C = "ENR";
const S = "energy" as const;

const ent = [
  makeEntity(C, S, 1, "Rimal Gas Field", "Upstream", "Onshore non-associated gas field feeding the Wadi Processing Hub.",
    { production: 312, capacity: 360, capital: 9400, altRoute: 0 },
    { series: { production: [334, 331, 327, 320, 314, 312] }, dependsOn: ["ENT-ENR-04"] }),
  makeEntity(C, S, 2, "Najd Crude Cluster", "Upstream", "Onshore crude cluster exporting via the Noor Pipeline Trunk; has an alternate rail-and-truck route.",
    { production: 428, capacity: 470, capital: 12800, altRoute: 1 },
    { series: { production: [421, 424, 430, 427, 431, 428] }, dependsOn: ["ENT-ENR-07"] }),
  makeEntity(C, S, 3, "Sahil Offshore Platform", "Upstream", "Offshore platform with subsea tie-back to the Wadi Processing Hub.",
    { production: 196, capacity: 240, capital: 7100, altRoute: 0 },
    { series: { production: [214, 210, 207, 203, 199, 196] }, dependsOn: ["ENT-ENR-04"] }),
  makeEntity(C, S, 4, "Wadi Processing Hub", "Midstream", "Central gas and condensate processing hub.",
    { capital: 6300 }),
  makeEntity(C, S, 5, "Qamar Export Terminal", "Midstream", "Primary export terminal and storage.",
    { capital: 5200 }),
  makeEntity(C, S, 6, "Harat Refinery", "Downstream", "Domestic refining and petrochemical feedstock.",
    { capital: 8600 }),
  makeEntity(C, S, 7, "Noor Pipeline Trunk", "Midstream", "Trunk pipeline linking crude clusters to the export terminal.",
    { capital: 4100 }, { dependsOn: ["ENT-ENR-05"] }),
  makeEntity(C, S, 8, "Dhahab Condensate Field", "Upstream", "Condensate field with alternate truck-to-rail export route.",
    { production: 144, capacity: 160, capital: 3900, altRoute: 1 },
    { series: { production: [138, 139, 141, 142, 143, 144] }, dependsOn: ["ENT-ENR-04"] }),
];

const HUB = "ENT-ENR-04";
const upstream = ent.filter((e) => e.category === "Upstream");
const totalProd = sumAttr(upstream, "production");
const hubShare = (sumAttr(upstream.filter((e) => e.dependsOn?.includes(HUB)), "production") / totalProd) * 100;
const altShare = (sumAttr(upstream.filter((e) => attr(e, "altRoute") === 1), "production") / totalProd) * 100;
const singleRouteCap = sumAttr(upstream.filter((e) => attr(e, "altRoute") === 0), "capital");
const sahil = ent[2];
const sahilDecline = r1(((attr(sahil, "production") - sahil.series!.production[0]) / sahil.series!.production[0]) * 100);
const rimal = ent[0];
const rimalUtil = r1((attr(rimal, "production") / attr(rimal, "capacity")) * 100);
const rimalDecline = r1(((attr(rimal, "production") - rimal.series!.production[0]) / rimal.series!.production[0]) * 100);

export const energy: SectorSeed = {
  sector: {
    id: S, code: C, name: "Energy & Oil and Gas", short: "Energy", entityName: "Al Noor Energy Authority",
    descriptor: "Energy & Oil",
    mandate: "Secure resilient hydrocarbon production and export capacity, protect critical processing and export dependencies, and deploy capital where it strengthens long-term supply.",
    analyticalFocus: ["Production", "Asset dependencies", "Supply resilience", "Capital exposure"],
    periods: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"], periodsLabel: "Month (2026)",
    reportingPeriod: "Sep 2026", asOf: "2026-10-12T08:00",
    attrs: {
      production: { label: "Net production", unit: "kboe/d" }, capacity: { label: "Production capacity", unit: "kboe/d" },
      capital: { label: "Capital employed", unit: "SAR m" }, altRoute: { label: "Has alternate export route", unit: "flag (1=yes)" },
    },
    capitalDefinition: "Carrying value of operating assets (SAR m, 30 Sep 2026).",
    icon: "flame",
  },
  entities: ent,
  metrics: [
    {
      id: "MET-ENR-01", sectorId: S, name: "Net hydrocarbon production", theme: "Production", unit: "kboe/d", period: "Sep 2026 monthly average", decimals: 0,
      formula: "Σ production of upstream assets (Rimal, Najd, Sahil, Dhahab) for Sep 2026.",
      compute: (es) => { const u = byCat(es, "Upstream"); return { value: sumAttr(u, "production"), sources: ids(u) }; },
      status: () => "info", thresholdNote: "No threshold; trend shown in CHT-ENR-02.",
      assumptions: ["Volumes are monthly averages of metered output; boe conversion uses a single illustrative factor."], additive: true,
    },
    {
      id: "MET-ENR-02", sectorId: S, name: "Processing-hub dependency", theme: "Asset dependencies", unit: "% of production", period: "Sep 2026", decimals: 1,
      formula: "Σ production of upstream assets whose dependsOn includes the Wadi Processing Hub ÷ Σ upstream production × 100.",
      compute: (es) => { const u = byCat(es, "Upstream").filter((e) => e.dependsOn?.includes(HUB)); return { value: hubShare, sources: [HUB, ...ids(u)] }; },
      status: (v) => (v > 55 ? "alert" : v > 45 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≤ 45% watch, > 55% alert.",
      assumptions: ["Dependency means the asset has no processing path that bypasses the hub today."], additive: false,
    },
    {
      id: "MET-ENR-03", sectorId: S, name: "Export-route redundancy", theme: "Supply resilience", unit: "% of production", period: "Sep 2026", decimals: 1,
      formula: "Σ production of upstream assets with altRoute = 1 ÷ Σ upstream production × 100.",
      compute: (es) => { const u = byCat(es, "Upstream"); return { value: altShare, sources: ids(u) }; },
      status: (v) => (v < 50 ? "alert" : v < 60 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≥ 60% ok, < 50% alert.",
      assumptions: ["An alternate route is counted only if it can carry the asset's full current output."], additive: false,
    },
    {
      id: "MET-ENR-04", sectorId: S, name: "Capital at single-route assets", theme: "Capital exposure", unit: "SAR m", period: "As at 30 Sep 2026", decimals: 0,
      formula: "Σ capital employed of upstream assets with altRoute = 0.",
      compute: (es) => { const u = byCat(es, "Upstream").filter((e) => attr(e, "altRoute") === 0); return { value: singleRouteCap, sources: ids(u) }; },
      status: () => "info", thresholdNote: "Informational; reviewed with CAS-ENR-01.",
      assumptions: ["Capital employed is carrying value, not replacement cost."], additive: true,
    },
  ],
  charts: [
    {
      id: "CHT-ENR-01", sectorId: S, title: "Production vs capacity by upstream asset", subtitle: "Sep 2026 monthly average", kind: "bars",
      xLabel: "Upstream asset", yLabel: "kboe/d", unit: "kboe/d", decimals: 0,
      formula: "production and capacity attributes of each upstream asset.",
      build: (es) => { const u = byCat(es, "Upstream"); return { categories: u.map((e) => e.name.replace(" Field", "").replace(" Platform", "").replace(" Cluster", "")), series: [{ name: "Production", values: u.map((e) => attr(e, "production")) }, { name: "Capacity", values: u.map((e) => attr(e, "capacity")) }], sources: ids(u) }; },
    },
    {
      id: "CHT-ENR-02", sectorId: S, title: "Monthly production by asset", subtitle: "Apr–Sep 2026", kind: "line",
      xLabel: "Month (2026)", yLabel: "kboe/d", unit: "kboe/d", decimals: 0, yMin: 100,
      formula: "series.production of each upstream asset; the Sep value equals the snapshot.",
      build: (es, p) => { const u = byCat(es, "Upstream"); return { categories: p, series: u.map((e) => ({ name: e.name.replace(" Field", "").replace(" Platform", "").replace(" Cluster", ""), values: e.series!.production })), sources: ids(u) }; },
    },
  ],
  signals: [
    { id: "SIG-ENR-01", sectorId: S, title: `Wadi Processing Hub carries ${r1(hubShare)}% of production`, severity: "high",
      summary: `Rimal, Sahil and Dhahab (${fmt(sumAttr(upstream.filter((e) => e.dependsOn?.includes(HUB)), "production"))} of ${fmt(totalProd)} kboe/d) have no processing path that bypasses the hub. An outage would interrupt most output.`,
      detectedAt: "2026-10-09T09:15", metricId: "MET-ENR-02", entityIds: [HUB, "ENT-ENR-01", "ENT-ENR-03", "ENT-ENR-08"], evidenceIds: ["EVD-ENR-01"], caseId: "CAS-ENR-01",
      assumptions: ["Hub outage scenarios are not yet modelled (scenario calculations are Stage 4)."] },
    { id: "SIG-ENR-02", sectorId: S, title: `Sahil Offshore output down ${Math.abs(sahilDecline)}% since April`, severity: "moderate",
      summary: `Production fell from ${sahil.series!.production[0]} to ${attr(sahil, "production")} kboe/d over six months, now ${r1((attr(sahil, "production") / attr(sahil, "capacity")) * 100)}% of capacity.`,
      detectedAt: "2026-10-08T14:40", entityIds: ["ENT-ENR-03"], evidenceIds: ["EVD-ENR-03", "EVD-ENR-04"], caseId: "CAS-ENR-02",
      assumptions: ["Decline is treated as reservoir-driven pending the engineering review."] },
    { id: "SIG-ENR-03", sectorId: S, title: `SAR ${fmt(singleRouteCap)} m employed at single-route assets`, severity: "high",
      summary: "Rimal and Sahil depend on one export path each. Route redundancy covers only " + r1(altShare) + "% of production.",
      detectedAt: "2026-10-09T10:05", metricId: "MET-ENR-04", entityIds: ["ENT-ENR-01", "ENT-ENR-03"], evidenceIds: ["EVD-ENR-02"], caseId: "CAS-ENR-01",
      assumptions: ["Capital employed is carrying value."] },
    { id: "SIG-ENR-04", sectorId: S, title: `Rimal Gas Field at ${rimalUtil}% utilisation and falling`, severity: "moderate",
      summary: `Output down ${Math.abs(rimalDecline)}% since April while capacity is unchanged; spare capacity is growing.`,
      detectedAt: "2026-10-10T11:20", entityIds: ["ENT-ENR-01"], evidenceIds: ["EVD-ENR-03"], caseId: "CAS-ENR-02",
      assumptions: ["No planned maintenance is assumed in the period."] },
  ],
  cases: [
    { id: "CAS-ENR-01", sectorId: S, title: "Wadi hub concentration and export redundancy", status: "In analysis", owner: "Layla Haddad (Analyst)", openedAt: "2026-10-09T11:00",
      summary: "Assess whether to fund a hub bypass or alternate export capacity for single-route assets.",
      nextStep: "Scenario modelling of a 14-day hub outage (a Stage 4 capability).",
      signalIds: ["SIG-ENR-01", "SIG-ENR-03"], decisionIds: ["DEC-ENR-01"], entityIds: [HUB, "ENT-ENR-01", "ENT-ENR-03", "ENT-ENR-07"], evidenceIds: ["EVD-ENR-01", "EVD-ENR-02"],
      assumptions: ["Bypass study cost is an indicative estimate."], expertInputRequested: true },
    { id: "CAS-ENR-02", sectorId: S, title: "Upstream decline recovery plan", status: "Awaiting decision", owner: "Omar Siddiq (Analyst)", openedAt: "2026-10-08T15:30",
      summary: "Determine whether infill drilling at Sahil can arrest decline and restore utilisation.",
      nextStep: "Approver review of the drilling programme proposal.",
      signalIds: ["SIG-ENR-02", "SIG-ENR-04"], decisionIds: ["DEC-ENR-02"], entityIds: ["ENT-ENR-03", "ENT-ENR-01"], evidenceIds: ["EVD-ENR-03", "EVD-ENR-04"],
      assumptions: ["Infill uplift of 18–22 kboe/d is an illustrative planning range."], expertInputRequested: false },
  ],
  decisions: [
    { id: "DEC-ENR-01", sectorId: S, title: "Approve feasibility study for a Wadi hub bypass link", decisionType: "Capital study", amountSARm: 85, amountKind: "commitment",
      amountNote: "Illustrative study and pre-FEED cost.", summary: "Fund an engineering feasibility study for a bypass linking Rimal and Sahil export flows to the Noor Pipeline Trunk.",
      proposedBy: "Layla Haddad", dueBy: "2026-10-30", caseId: "CAS-ENR-01", signalIds: ["SIG-ENR-01", "SIG-ENR-03"], entityIds: [HUB, "ENT-ENR-07"], evidenceIds: ["EVD-ENR-01", "EVD-ENR-02"],
      options: [{ label: "Approve study", effect: "Funds study; no construction commitment." }, { label: "Defer to next quarter", effect: "Exposure unchanged for at least one more quarter." }],
      recommendation: "Approve study; revisit with scenario results.", assumptions: ["Study duration of 6 months is assumed."] },
    { id: "DEC-ENR-02", sectorId: S, title: "Approve infill drilling programme at Sahil Offshore", decisionType: "Capital programme", amountSARm: 640, amountKind: "commitment",
      amountNote: "Illustrative programme budget (4 wells).", summary: "Authorise a four-well infill programme to arrest decline and lift utilisation.",
      proposedBy: "Omar Siddiq", dueBy: "2026-11-06", caseId: "CAS-ENR-02", signalIds: ["SIG-ENR-02", "SIG-ENR-04"], entityIds: ["ENT-ENR-03"], evidenceIds: ["EVD-ENR-03", "EVD-ENR-04"],
      options: [{ label: "Approve four wells", effect: "Indicative +18–22 kboe/d from 2027." }, { label: "Approve two wells", effect: "Half the uplift at half the budget." }],
      recommendation: "Approve two wells first, then reassess.", assumptions: ["Uplift range is an illustrative planning assumption, not a forecast."] },
  ],
  evidence: [
    { id: "EVD-ENR-01", sectorId: S, title: "Midstream dependency map (illustrative)", kind: "Network extract", source: "Demonstration asset register", asOf: "2026-09-30", summary: "Maps upstream assets to processing and export nodes; shows hub dependency of three assets." },
    { id: "EVD-ENR-02", sectorId: S, title: "Export route redundancy review (illustrative)", kind: "Memo", source: "Demonstration supply planning memo", asOf: "2026-09-28", summary: "Lists alternate routes and whether each can carry full asset output." },
    { id: "EVD-ENR-03", sectorId: S, title: "Production ledger Apr–Sep 2026 (illustrative)", kind: "Dataset extract", source: "Demonstration production ledger", asOf: "2026-10-05", summary: "Monthly average production by asset; basis for metrics and CHT-ENR-02." },
    { id: "EVD-ENR-04", sectorId: S, title: "Sahil reservoir performance note (illustrative)", kind: "Engineering note", source: "Demonstration reservoir team", asOf: "2026-10-02", summary: "Describes pressure decline and candidate infill locations." },
  ],
  activity: [
    { id: "ACT-ENR-01", sectorId: S, at: "2026-10-11T16:20", actor: "Omar Siddiq", text: "Submitted drilling programme proposal for approval.", recordId: "DEC-ENR-02" },
    { id: "ACT-ENR-02", sectorId: S, at: "2026-10-10T11:25", actor: "System (seeded)", text: "Raised signal on Rimal utilisation.", recordId: "SIG-ENR-04" },
    { id: "ACT-ENR-03", sectorId: S, at: "2026-10-09T11:00", actor: "Layla Haddad", text: "Opened case on hub concentration.", recordId: "CAS-ENR-01" },
    { id: "ACT-ENR-04", sectorId: S, at: "2026-10-08T14:45", actor: "System (seeded)", text: "Raised signal on Sahil production decline.", recordId: "SIG-ENR-02" },
  ],
};
