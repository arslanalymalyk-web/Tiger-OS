import type { SectorSeed } from "@/lib/types";
import { attr, byCat, fmt, ids, makeEntity, r1, sum, sumAttr } from "./helpers";

const C = "LOG";
const S = "logistics" as const;
const R = "Route";
const H = "Hub";
const W = "Distribution centre";
const SU = "Inbound supplier";
const GW = "ENT-LOG-05";
const ent = [
  makeEntity(C, S, 1, "Gateway Port – Riyadh Dry Port Rail", R, "Rail corridor from the Red Sea Gateway Port to Riyadh.", { shipments: 4800, delayed: 410, capital: 2900 }, { series: { shipments: [4600, 4650, 4700, 4750, 4780, 4800], delayed: [300, 310, 340, 360, 390, 410] }, dependsOn: [GW] }),
  makeEntity(C, S, 2, "Gateway Port – Western Region Trucking", R, "Truck lanes from the Gateway Port to western distribution.", { shipments: 3600, delayed: 520, capital: 1100 }, { series: { shipments: [3500, 3520, 3550, 3580, 3590, 3600], delayed: [330, 360, 400, 440, 480, 520] }, dependsOn: [GW] }),
  makeEntity(C, S, 3, "Eastern Province – Riyadh Trunk", R, "Road and rail trunk from the Eastern Gulf Terminal.", { shipments: 5200, delayed: 330, capital: 1800 }, { series: { shipments: [5000, 5050, 5100, 5150, 5180, 5200], delayed: [300, 305, 310, 320, 325, 330] }, dependsOn: ["ENT-LOG-06"] }),
  makeEntity(C, S, 4, "Northern Cross-Border Route", R, "Land route to northern markets.", { shipments: 1900, delayed: 285, capital: 700 }, { series: { shipments: [1800, 1820, 1850, 1870, 1890, 1900], delayed: [190, 210, 230, 250, 270, 285] } }),
  makeEntity(C, S, 5, "Red Sea Gateway Port", H, "Primary western import gateway.", { capital: 4200 }),
  makeEntity(C, S, 6, "Eastern Gulf Terminal", H, "Primary eastern import gateway.", { capital: 3600 }),
  makeEntity(C, S, 7, "Riyadh Dry Port DC", W, "Central distribution centre.", { stock: 1240, demand: 96, capital: 900 }),
  makeEntity(C, S, 8, "Jeddah DC", W, "Western distribution centre.", { stock: 520, demand: 62, capital: 650 }),
  makeEntity(C, S, 9, "Dammam DC", W, "Eastern distribution centre.", { stock: 880, demand: 71, capital: 780 }),
  makeEntity(C, S, 10, "Orient Components Ltd", SU, "Electronic components.", { inboundKt: 520 }),
  makeEntity(C, S, 11, "Delta Packaging Supply", SU, "Packaging materials.", { inboundKt: 410 }),
  makeEntity(C, S, 12, "Najd Consumer Goods Distributors", SU, "Consumer goods.", { inboundKt: 330 }),
  makeEntity(C, S, 13, "Levant Foods Trading", SU, "Packaged foods.", { inboundKt: 290 }),
  makeEntity(C, S, 14, "Atlas Spare Parts", SU, "Spare parts.", { inboundKt: 250 }),
];
const routes = byCat(ent, R);
const dcs = byCat(ent, W);
const sups = byCat(ent, SU);
const delayPct = (sumAttr(routes, "delayed") / sumAttr(routes, "shipments")) * 100;
const gwRoutes = routes.filter((r) => r.dependsOn?.includes(GW));
const gwShare = (sumAttr(gwRoutes, "shipments") / sumAttr(routes, "shipments")) * 100;
const cover = sumAttr(dcs, "stock") / sumAttr(dcs, "demand");
const dcCover = (d: (typeof ent)[number]) => attr(d, "stock") / attr(d, "demand");
const top2 = [...sups].sort((a, b) => attr(b, "inboundKt") - attr(a, "inboundKt")).slice(0, 2);
const supShare = (sumAttr(top2, "inboundKt") / sumAttr(sups, "inboundKt")) * 100;
const west = ent[1];
const westRate = (i: number) => (west.series!.delayed[i] / west.series!.shipments[i]) * 100;
const jed = ent[7];
const shortN = (e: (typeof ent)[number]) => e.name.replace("Gateway Port – ", "GW – ").replace("Eastern Province – ", "East – ").replace("Northern ", "North ");

export const logistics: SectorSeed = {
  sector: {
    id: S, code: C, name: "Supply Chain & Logistics", short: "Logistics", entityName: "Al Noor Logistics & Trade", descriptor: "Supply Chain & Logistics",
    mandate: "Keep goods moving on time, avoid over-reliance on single gateways and suppliers, and hold inventory buffers sized to demand.",
    analyticalFocus: ["Shipment delays", "Route dependencies", "Inventory buffers", "Supplier concentration"],
    periods: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"], periodsLabel: "Month (2026)", reportingPeriod: "Sep 2026", asOf: "2026-10-12T08:00",
    attrs: {
      shipments: { label: "Shipments", unit: "count/month" }, delayed: { label: "Delayed shipments", unit: "count/month" }, capital: { label: "Capital employed", unit: "SAR m" },
      stock: { label: "Inventory on hand", unit: "k units" }, demand: { label: "Daily demand", unit: "k units/day" }, inboundKt: { label: "Inbound volume (Sep)", unit: "kt" },
    },
    capitalDefinition: "Carrying value of routes, hubs and distribution centres (SAR m).", icon: "truck",
  },
  entities: ent,
  metrics: [
    { id: "MET-LOG-01", sectorId: S, name: "Delayed shipments", theme: "Shipment delays", unit: "% of shipments", period: "Sep 2026", decimals: 1, formula: "Σ delayed shipments ÷ Σ shipments across routes × 100.",
      compute: () => ({ value: delayPct, sources: ids(routes) }), status: (v) => (v > 12 ? "alert" : v > 8 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≤ 8% ok, > 12% alert.", assumptions: ["Delayed = more than 24h beyond promised arrival."], additive: false },
    { id: "MET-LOG-02", sectorId: S, name: "Gateway Port route dependency", theme: "Route dependencies", unit: "% of shipments", period: "Sep 2026", decimals: 1, formula: "Σ shipments on routes dependent on the Red Sea Gateway Port ÷ Σ shipments × 100.",
      compute: () => ({ value: gwShare, sources: [GW, ...ids(gwRoutes)] }), status: (v) => (v > 55 ? "alert" : v > 45 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≤ 45% ok, > 55% alert.", assumptions: ["Dependency is by origin gateway."], additive: false },
    { id: "MET-LOG-03", sectorId: S, name: "Inventory cover", theme: "Inventory buffers", unit: "days", period: "As at 30 Sep 2026", decimals: 1, formula: "Σ inventory on hand ÷ Σ daily demand across distribution centres.",
      compute: () => ({ value: cover, sources: ids(dcs) }), status: (v) => (v < 10 ? "alert" : v < 12 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≥ 12 days ok, < 10 alert.", assumptions: ["Demand is flat at current daily rate."], additive: false },
    { id: "MET-LOG-04", sectorId: S, name: "Top-two supplier share", theme: "Supplier concentration", unit: "% of inbound volume", period: "Sep 2026", decimals: 1, formula: "Σ inbound volume of two largest suppliers ÷ Σ inbound volume × 100.",
      compute: () => ({ value: supShare, sources: ids(sups) }), status: (v) => (v > 60 ? "alert" : v > 50 ? "watch" : "ok"), thresholdNote: "Demonstration tolerance: ≤ 50% ok, > 60% alert.", assumptions: ["Volume by weight."], additive: false },
  ],
  charts: [
    { id: "CHT-LOG-01", sectorId: S, title: "Delayed shipment rate by route", subtitle: "Apr–Sep 2026", kind: "line", xLabel: "Month (2026)", yLabel: "Delayed shipments (%)", unit: "%", decimals: 1, yMin: 4, formula: "series.delayed ÷ series.shipments × 100.",
      build: (es, p) => { const r = byCat(es, R); return { categories: p, series: r.map((e) => ({ name: shortN(e), values: e.series!.delayed.map((d, i) => (d / e.series!.shipments[i]) * 100) })), sources: ids(r) }; } },
    { id: "CHT-LOG-02", sectorId: S, title: "Inventory cover by distribution centre", subtitle: "As at 30 Sep 2026", kind: "bars", xLabel: "Distribution centre", yLabel: "Days of cover", unit: "days", decimals: 1, refLine: { value: 12, label: "Target 12 days" }, formula: "stock ÷ demand per centre.",
      build: (es) => { const d = byCat(es, W); return { categories: d.map((e) => e.name), series: [{ name: "Days of cover", values: d.map(dcCover) }], sources: ids(d) }; } },
  ],
  signals: [
    { id: "SIG-LOG-01", sectorId: S, title: `Western trucking delay rate up to ${r1(westRate(5))}% from ${r1(westRate(0))}%`, severity: "critical",
      summary: `${west.series!.delayed[5]} of ${fmt(west.series!.shipments[5])} shipments delayed in Sep.`, detectedAt: "2026-10-10T08:30", metricId: "MET-LOG-01", entityIds: [west.id, GW], evidenceIds: ["EVD-LOG-01"], caseId: "CAS-LOG-01", assumptions: ["Delay definition unchanged."] },
    { id: "SIG-LOG-02", sectorId: S, title: `${r1(gwShare)}% of shipments depend on the Red Sea Gateway Port`, severity: "high",
      summary: "Single-gateway dependency exceeds the 45% watch tolerance.", detectedAt: "2026-10-09T10:00", metricId: "MET-LOG-02", entityIds: [GW, ...ids(gwRoutes)], evidenceIds: ["EVD-LOG-02"], caseId: "CAS-LOG-01", assumptions: ["No alternate gateway capacity modelled."] },
    { id: "SIG-LOG-03", sectorId: S, title: `Jeddah DC cover ${r1(dcCover(jed))} days, below 10-day floor`, severity: "high",
      summary: `Stock ${fmt(attr(jed, "stock"))} k units vs demand ${attr(jed, "demand")} k/day.`, detectedAt: "2026-10-10T12:00", entityIds: [jed.id], evidenceIds: ["EVD-LOG-03"], caseId: "CAS-LOG-02", assumptions: ["Demand held at current rate."] },
    { id: "SIG-LOG-04", sectorId: S, title: `Top-two suppliers supply ${r1(supShare)}% of inbound volume`, severity: "moderate",
      summary: "Orient Components and Delta Packaging account for most inbound weight.", detectedAt: "2026-10-08T14:00", metricId: "MET-LOG-04", entityIds: ids(top2), evidenceIds: ["EVD-LOG-03"], caseId: "CAS-LOG-02", assumptions: ["Volumes by weight."] },
  ],
  cases: [
    { id: "CAS-LOG-01", sectorId: S, title: "Gateway corridor delay recovery", status: "Awaiting decision", owner: "Tariq Al-Ghamdi (Analyst)", openedAt: "2026-10-10T09:00", summary: "Reduce Western trucking delays and gateway dependency.", nextStep: "Approver decision on rerouting.",
      signalIds: ["SIG-LOG-01", "SIG-LOG-02"], decisionIds: ["DEC-LOG-01"], entityIds: [west.id, GW], evidenceIds: ["EVD-LOG-01", "EVD-LOG-02"], assumptions: ["Eastern terminal has spare capacity."], expertInputRequested: true },
    { id: "CAS-LOG-02", sectorId: S, title: "Buffer stock and supplier concentration", status: "In analysis", owner: "Maha Al-Dosari (Analyst)", openedAt: "2026-10-09T15:00", summary: "Size buffers and diversify suppliers.", nextStep: "Approver decision on Jeddah buffer.",
      signalIds: ["SIG-LOG-03", "SIG-LOG-04"], decisionIds: ["DEC-LOG-02"], entityIds: [jed.id, ...ids(top2)], evidenceIds: ["EVD-LOG-03"], assumptions: ["Working-capital cost is indicative."], expertInputRequested: false },
  ],
  decisions: [
    { id: "DEC-LOG-01", sectorId: S, title: "Reroute 15% of Western trucking via Eastern Gulf Terminal", decisionType: "Operations", amountSARm: 38, amountKind: "commitment", amountNote: "Illustrative 12-month incremental cost.", summary: "Shift part of Western volume to reduce gateway dependency.",
      proposedBy: "Tariq Al-Ghamdi", dueBy: "2026-10-25", caseId: "CAS-LOG-01", signalIds: ["SIG-LOG-01", "SIG-LOG-02"], entityIds: [west.id, "ENT-LOG-06"], evidenceIds: ["EVD-LOG-01", "EVD-LOG-02"],
      options: [{ label: "Reroute 15%", effect: "Lower gateway share, higher unit cost." }, { label: "Reroute 8%", effect: "Smaller effect." }], recommendation: "Reroute 15%.", assumptions: ["Eastern capacity available."] },
    { id: "DEC-LOG-02", sectorId: S, title: "Approve buffer stock top-up at Jeddah DC", decisionType: "Working capital", amountSARm: 64, amountKind: "commitment", amountNote: "Illustrative inventory investment.", summary: "Lift Jeddah cover to the 12-day target.",
      proposedBy: "Maha Al-Dosari", dueBy: "2026-11-01", caseId: "CAS-LOG-02", signalIds: ["SIG-LOG-03"], entityIds: [jed.id], evidenceIds: ["EVD-LOG-03"],
      options: [{ label: "Top up to 12 days", effect: "Meets target." }, { label: "Top up to 10 days", effect: "Meets floor only." }], recommendation: "Top up to 12 days.", assumptions: ["Storage capacity available."] },
  ],
  evidence: [
    { id: "EVD-LOG-01", sectorId: S, title: "Shipment performance ledger (illustrative)", kind: "Dataset extract", source: "Demonstration TMS", asOf: "2026-10-05", summary: "Shipments and delays by route." },
    { id: "EVD-LOG-02", sectorId: S, title: "Gateway dependency map (illustrative)", kind: "Network extract", source: "Demonstration network model", asOf: "2026-09-30", summary: "Routes by origin gateway." },
    { id: "EVD-LOG-03", sectorId: S, title: "Inventory and inbound supplier report (illustrative)", kind: "Report extract", source: "Demonstration WMS", asOf: "2026-09-30", summary: "Stock, demand and supplier volumes." },
  ],
  activity: [
    { id: "ACT-LOG-01", sectorId: S, at: "2026-10-11T09:30", actor: "Tariq Al-Ghamdi", text: "Proposed rerouting.", recordId: "DEC-LOG-01" },
    { id: "ACT-LOG-02", sectorId: S, at: "2026-10-10T12:00", actor: "System (seeded)", text: "Raised Jeddah cover signal.", recordId: "SIG-LOG-03" },
    { id: "ACT-LOG-03", sectorId: S, at: "2026-10-10T08:30", actor: "System (seeded)", text: "Raised Western delay signal.", recordId: "SIG-LOG-01" },
    { id: "ACT-LOG-04", sectorId: S, at: "2026-10-09T15:00", actor: "Maha Al-Dosari", text: "Opened buffer case.", recordId: "CAS-LOG-02" },
  ],
};
void sum;
