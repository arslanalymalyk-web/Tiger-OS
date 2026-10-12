import type { Signal } from "@/lib/types";
import { logistics } from "../logistics";
import { attr, fmt, r1 } from "../helpers";
import { ev, p, tbl, ver } from "./blocks";
import type { S2Content } from "./seedtypes";

const S = "logistics" as const;
const ents = logistics.entities;
const routes = ents.filter((e) => e.category === "Route");
const dcs = ents.filter((e) => e.category === "Distribution centre");
const sups = ents.filter((e) => e.category === "Inbound supplier");
const GW = "ENT-LOG-05";
const rate = (e: (typeof ents)[number], i: number) => (e.series!.delayed[i] / e.series!.shipments[i]) * 100;
const west = routes[1];
const totalShip = routes.reduce((a, e) => a + attr(e, "shipments"), 0);
const gwRoutes = routes.filter((e) => e.dependsOn?.includes(GW));
const gwShare = (gwRoutes.reduce((a, e) => a + attr(e, "shipments"), 0) / totalShip) * 100;
const westDelayed = attr(west, "delayed");
// Cause-code counts must add up to the Western lane's September delayed count (checked by verify-store).
const causes: [string, number][] = [["Port release wait", 302], ["Truck availability", 114], ["Documentation hold", 62], ["Other", westDelayed - 302 - 114 - 62]];

const ledgerBlocks = () => [
  p("Definition: a shipment is counted as delayed when it arrives more than 24 hours after the promised arrival time. Counts are monthly, for four routes. Source: demonstration transport management system (TMS) export."),
  tbl("Shipments and delays by route, Sep 2026", ["Route", "Shipments", "Delayed", "Delay rate (%)"], routes.map((e) => [e.name, attr(e, "shipments"), attr(e, "delayed"), r1((attr(e, "delayed") / attr(e, "shipments")) * 100)])),
  tbl("Delay rate by month (%)", ["Route", "Apr", "May", "Jun", "Jul", "Aug", "Sep"], routes.map((e) => [e.name, ...logistics.sector.periods.map((_, i) => r1(rate(e, i)))])),
  p(`Reading: the ${west.name} delay rate rose every month, from ${r1(rate(west, 0))}% in April to ${r1(rate(west, 5))}% in September. The other lanes rose by less.`),
];

export const logisticsS2: S2Content = {
  people: [
    { id: "PER-LOG-01", sectorId: S, name: "Tariq Al-Ghamdi", title: "Logistics Analyst", kind: "analyst" },
    { id: "PER-LOG-02", sectorId: S, name: "Maha Al-Dosari", title: "Supply Planning Analyst", kind: "analyst" },
    { id: "PER-LOG-03", sectorId: S, name: "Dr. Yasmin Al-Harthi", title: "Port and Corridor Operations Expert", kind: "expert" },
    { id: "PER-LOG-04", sectorId: S, name: "Mazen Al-Qahtani", title: "Inventory Planning Expert", kind: "expert" },
    { id: "PER-LOG-05", sectorId: S, name: "Hamad Al-Shamri", title: "Carrier Performance Analyst", kind: "specialist" },
  ],
  objectives: [
    { id: "OBJ-LOG-01", sectorId: S, text: "Shipment delays: keep delayed shipments at or below the 8% tolerance." },
    { id: "OBJ-LOG-02", sectorId: S, text: "Route dependencies: keep any single gateway at or below 45% of shipments." },
    { id: "OBJ-LOG-03", sectorId: S, text: "Inventory buffers: hold at least 12 days of cover at every distribution centre." },
    { id: "OBJ-LOG-04", sectorId: S, text: "Supplier concentration: keep the top two suppliers at or below 50% of inbound volume." },
  ],
  evidence: [
    ev("EVD-LOG-01", S, { title: "Shipment performance ledger (illustrative)", kind: "Dataset extract", source: "Demonstration TMS", summary: "Shipments and delays by route.", entityIds: routes.map((e) => e.id) }, [
      ver(1, "2026-10-05", "Initial issue.", ["Delay cause codes are not included in this version.", "Counts are per consignment and not weighted by value."], ledgerBlocks()),
      ver(2, "2026-10-11", "Adds delay cause codes for the Gateway → West lane (Sep 2026).", ["Cause codes are assigned by carrier dispatchers and are not independently verified.", "Only the Gateway → West lane is coded in this version."], [
        ...ledgerBlocks(),
        tbl(`Delay cause codes, ${west.name}, Sep 2026`, ["Cause code", "Delayed shipments", "Share of delayed (%)"], causes.map(([c, n]) => [c, n, r1((n / westDelayed) * 100)])),
        p(`Of ${westDelayed} delayed shipments on the Western lane in September, ${causes[0][1]} (${r1((causes[0][1] / westDelayed) * 100)}%) were coded as waiting for port release and ${causes[2][1]} (${r1((causes[2][1] / westDelayed) * 100)}%) as documentation holds.`),
      ]),
    ]),
    ev("EVD-LOG-02", S, { title: "Gateway dependency map (illustrative)", kind: "Network extract", source: "Demonstration network model", summary: "Routes by origin gateway.", entityIds: [GW, ...routes.map((e) => e.id)] }, [
      ver(1, "2026-09-30", "Initial issue.", ["Dependency is by origin gateway only; transhipment and alternative gateways are not modelled.", "No spare-capacity data for the Eastern Gulf Terminal is included."], [
        p(`Maps each route to the gateway through which its freight enters. Routes dependent on the Red Sea Gateway Port carry ${r1(gwShare)}% of September shipments, above the 45% demonstration tolerance.`),
        tbl("Routes by origin gateway, Sep 2026", ["Route", "Origin gateway", "Sep shipments", "Share of network (%)"], routes.map((e) => [e.name, e.dependsOn?.includes(GW) ? "Red Sea Gateway Port" : e.dependsOn?.length ? "Eastern Gulf Terminal" : "Land border", attr(e, "shipments"), r1((attr(e, "shipments") / totalShip) * 100)])),
      ]),
    ]),
    ev("EVD-LOG-03", S, { title: "Inventory and inbound supplier report (illustrative)", kind: "Report extract", source: "Demonstration WMS", summary: "Stock, demand and supplier volumes.", entityIds: [...dcs.map((e) => e.id), ...sups.map((e) => e.id)] }, [
      ver(1, "2026-09-30", "Initial issue.", ["Demand is held flat at the current daily rate.", "Supplier volumes are by weight, not value."], [
        tbl("Inventory cover by distribution centre, 30 Sep 2026", ["Distribution centre", "Stock (k units)", "Daily demand (k units)", "Days of cover"], dcs.map((e) => [e.name, attr(e, "stock"), attr(e, "demand"), r1(attr(e, "stock") / attr(e, "demand"))])),
        tbl("Inbound volume by supplier, Sep 2026", ["Supplier", "Inbound (kt)", "Share (%)"], sups.map((e) => [e.name, attr(e, "inboundKt"), r1((attr(e, "inboundKt") / sups.reduce((a, x) => a + attr(x, "inboundKt"), 0)) * 100)])),
      ]),
    ]),
    ev("EVD-LOG-04", S, { title: "Red Sea Gateway Port operations bulletin (illustrative)", kind: "Operator bulletin", source: "Fictional Red Sea Gateway Port Authority — Operations Desk", summary: "Port waiting times, crane availability and release backlog.", entityIds: [GW] }, [
      ver(1, "2026-10-10", "Initial issue.", ["Operator-reported figures; not independently audited.", "No lane-level or carrier-level breakdown.", "The clearance date is an expectation, not a commitment."], [
        p("Berth congestion: average vessel waiting time rose to 31 hours in the week to 9 October, from 19 hours in the week to 4 September."),
        p("Quay cranes: two of eight quay cranes are out of service for scheduled maintenance until 20 October 2026, which reduces discharge throughput."),
        p("Release processing: container release requests queued for an average of 26 hours. The port expects the backlog to clear by the end of October if crane maintenance finishes on schedule."),
        p("This bulletin covers all inbound freight and gives no lane-level figures."),
      ]),
    ]),
    ev("EVD-LOG-05", S, { title: "Western region carrier statement (illustrative)", kind: "Third-party statement", source: "Fictional Western Carriers Association — statement to Al Noor Logistics", summary: "Carrier view that capacity is adequate and documentation holds drive delays.", entityIds: [west.id] }, [
      ver(1, "2026-10-08", "Initial issue.", ["Opinion without supporting data.", "The 40% estimate cannot be reproduced from the TMS ledger.", "Carriers have an interest in how delays are attributed."], [
        p("Our members report that truck capacity on the Gateway → West lane is adequate; no member declined loads in September."),
        p("We believe most delays arise from consignee documentation holds at release rather than from the port, and we estimate that about 40% of delayed loads are documentation-related."),
        p("This statement is based on member recollection. No data set is attached."),
      ]),
    ]),
  ],
  newSignals: [{
    id: "SIG-LOG-05", sectorId: S, title: "Gateway Port vessel waiting time up to 31 hours", severity: "moderate",
    summary: "The port reports waiting times of 31 hours (from 19) and two quay cranes out of service until 20 October.", detectedAt: "2026-10-11T07:30",
    entityIds: [GW], evidenceIds: ["EVD-LOG-04"], caseId: null, assumptions: ["Operator-reported figures."],
  } satisfies Signal],
  investigation: {
    caseId: "CAS-LOG-01", priority: "Critical", ownerId: "PER-LOG-01", dueDate: "2026-10-25",
    question: "Are Western-lane delays driven mainly by release congestion at the Red Sea Gateway Port, and is rerouting 15% of Western volume via the Eastern Gulf Terminal proportionate?",
    objectiveIds: ["OBJ-LOG-01", "OBJ-LOG-02"],
    hypotheses: [
      { id: "H1", kind: "primary", statement: "Western-lane delays are driven mainly by release congestion at the Red Sea Gateway Port, a dependency shared with the Rail lane.", status: "Open", rationale: "Delay growth is concentrated on the two port-dependent lanes and the port reports longer waits." },
      { id: "H2", kind: "alternative", statement: "Delays are driven by a truck-capacity shortfall on the Western lane.", status: "Open", rationale: "Would explain growth confined to the trucking lane." },
      { id: "H3", kind: "alternative", statement: "Delays are driven mainly by consignee documentation holds (carrier estimate: about 40%).", status: "Open", rationale: "Carrier statement; unverified." },
    ],
    links: [
      { evidenceId: "EVD-LOG-01", version: 1, stance: "supports", hypothesisId: "H1", refs: ["T1R2", "T2R2"], note: `Western-lane delay rate ${r1(rate(west, 5))}% in September, up from ${r1(rate(west, 0))}% in April.` },
      { evidenceId: "EVD-LOG-02", version: 1, stance: "supports", hypothesisId: "H1", refs: ["T1R1", "T1R2"], note: `Both port-dependent lanes carry rising delay rates; ${r1(gwShare)}% of shipments depend on the port.` },
      { evidenceId: "EVD-LOG-04", version: 1, stance: "supports", hypothesisId: "H1", refs: ["P1", "P2", "P3"], note: "Port reports longer waits, two cranes out of service and a release backlog." },
      { evidenceId: "EVD-LOG-05", version: 1, stance: "contradicts", hypothesisId: "H1", refs: ["P2"], note: "Carriers attribute a large share of delays to documentation holds, not the port." },
      { evidenceId: "EVD-LOG-05", version: 1, stance: "supports", hypothesisId: "H3", refs: ["P2"], note: "Carrier estimate of about 40% documentation-related (unverified)." },
      { evidenceId: "EVD-LOG-05", version: 1, stance: "contradicts", hypothesisId: "H2", refs: ["P1"], note: "Carriers report adequate truck capacity." },
    ],
    assumptions: ["The delay definition (more than 24 hours beyond promise) is unchanged across the period.", "The Eastern Gulf Terminal has spare capacity for rerouted volume (not yet confirmed)."],
    missing: ["Delay cause codes for the Gateway → Rail lane.", "Eastern Gulf Terminal spare-capacity figures."],
    questions: ["Would rerouting 15% of Western volume raise unit cost by more than the delay savings?"],
    tasks: [
      { title: "Reconcile Western-lane delay counts with the TMS extract", description: "Check that September delayed and total shipment counts for the Western lane match the TMS source.", assigneeId: "PER-LOG-05", dueDate: "2026-10-10", status: "Done", evidenceIds: ["EVD-LOG-01"], findings: `Counts reconcile: ${westDelayed} delayed of ${fmt(attr(west, "shipments"))} shipments (${r1(rate(west, 5))}%). No duplicate consignments found.`, completionNote: "Reconciled against the TMS export dated 2026-10-05." },
      { title: "Obtain delay cause codes for the Western lane", description: "Request cause codes from carrier dispatch and add them to the ledger.", assigneeId: "PER-LOG-01", dueDate: "2026-10-14", status: "In progress", evidenceIds: ["EVD-LOG-01"], findings: "", completionNote: "" },
      { title: "Confirm Eastern Gulf Terminal spare capacity for rerouting", description: "Obtain weekly spare discharge and onward-haul capacity from the terminal.", assigneeId: "PER-LOG-04", dueDate: "2026-10-16", status: "Not started", evidenceIds: [], findings: "", completionNote: "" },
    ],
    review: { assigneeId: "PER-LOG-03", scope: "Assess whether the linked evidence supports attributing Western-lane delay growth to Gateway Port release congestion, and whether rerouting 15% of Western volume is proportionate.", requestedAt: "2026-10-11T10:00", dueDate: "2026-10-18" },
    events: [
      { at: "2026-10-10T09:00", actor: "Tariq Al-Ghamdi (Analyst)", type: "created", text: "Opened the case from signals SIG-LOG-01 and SIG-LOG-02." },
      { at: "2026-10-10T11:20", actor: "Tariq Al-Ghamdi (Analyst)", type: "evidence-linked", text: "Linked ledger and dependency-map evidence." },
      { at: "2026-10-10T15:40", actor: "Tariq Al-Ghamdi (Analyst)", type: "hypothesis-added", text: "Recorded three competing explanations." },
      { at: "2026-10-11T08:15", actor: "Tariq Al-Ghamdi (Analyst)", type: "evidence-linked", text: "Linked port bulletin and carrier statement." },
      { at: "2026-10-11T10:00", actor: "Tariq Al-Ghamdi (Analyst)", type: "review-requested", text: "Requested expert review from Dr. Yasmin Al-Harthi." },
    ],
  },
  notification: { title: "Expert review requested: Gateway corridor delay", body: "Dr. Yasmin Al-Harthi is asked to review CAS-LOG-01 by 2026-10-18.", at: "2026-10-11T10:00" },
};
