import type { Signal } from "@/lib/types";
import { energy } from "../energy";
import { attr, fmt, r1, sumAttr } from "../helpers";
import { ev, p, tbl, ver } from "./blocks";
import type { S2Content } from "./seedtypes";

const S = "energy" as const;
const ents = energy.entities;
const up = ents.filter((e) => e.category === "Upstream");
const HUB = "ENT-ENR-04";
const totalProd = sumAttr(up, "production");
const hubAssets = up.filter((e) => e.dependsOn?.includes(HUB));
const hubShare = (sumAttr(hubAssets, "production") / totalProd) * 100;
const altShare = (sumAttr(up.filter((e) => attr(e, "altRoute") === 1), "production") / totalProd) * 100;
const sahil = ents[2];
const dep = (e: (typeof ents)[number]) => (e.dependsOn?.includes(HUB) ? "Wadi Processing Hub" : e.dependsOn?.includes("ENT-ENR-07") ? "Noor Pipeline Trunk" : "—");

export const energyS2: S2Content = {
  people: [
    { id: "PER-ENR-01", sectorId: S, name: "Layla Haddad", title: "Energy Systems Analyst", kind: "analyst" },
    { id: "PER-ENR-02", sectorId: S, name: "Omar Siddiq", title: "Upstream Performance Analyst", kind: "analyst" },
    { id: "PER-ENR-03", sectorId: S, name: "Dr. Hana Al-Rashed", title: "Midstream and Processing Systems Expert", kind: "expert" },
    { id: "PER-ENR-04", sectorId: S, name: "Dr. Bader Al-Mutlaq", title: "Reservoir and Supply Resilience Expert", kind: "expert" },
    { id: "PER-ENR-05", sectorId: S, name: "Faris Al-Dossary", title: "Pipeline Integrity Engineer", kind: "specialist" },
  ],
  objectives: [
    { id: "OBJ-ENR-01", sectorId: S, text: "Production: sustain net hydrocarbon output against plan." },
    { id: "OBJ-ENR-02", sectorId: S, text: "Asset dependencies: keep dependence on any single processing hub at or below 45% of production." },
    { id: "OBJ-ENR-03", sectorId: S, text: "Supply resilience: keep at least 60% of production on an alternate export route." },
    { id: "OBJ-ENR-04", sectorId: S, text: "Capital exposure: limit capital employed at single-route assets." },
  ],
  evidence: [
    ev("EVD-ENR-01", S, { title: "Midstream dependency map (illustrative)", kind: "Network extract", source: "Demonstration asset register", summary: "Maps upstream assets to processing and export nodes.", entityIds: [HUB, ...up.map((e) => e.id)] }, [
      ver(1, "2026-09-30", "Initial issue.", ["Dependency means no processing path that bypasses the hub exists today.", "Outage frequency and duration are not part of this extract."], [
        p(`${hubAssets.length} of ${up.length} upstream assets (${fmt(sumAttr(hubAssets, "production"))} of ${fmt(totalProd)} kboe/d, ${r1(hubShare)}%) have no processing path that bypasses the Wadi Processing Hub.`),
        tbl("Upstream assets, dependencies and alternate routes, Sep 2026", ["Asset", "Production (kboe/d)", "Depends on", "Alternate export route"], up.map((e) => [e.name, attr(e, "production"), dep(e), attr(e, "altRoute") ? "Yes" : "No"])),
      ]),
    ]),
    ev("EVD-ENR-02", S, { title: "Export route redundancy review (illustrative)", kind: "Memo", source: "Demonstration supply planning memo", summary: "Alternate routes and whether each can carry full output.", entityIds: up.map((e) => e.id) }, [
      ver(1, "2026-09-28", "Initial issue.", ["An alternate route is counted only if it can carry the asset's full current output.", "Cost of using alternate routes is not assessed."], [
        p(`Assets with an alternate export route produce ${r1(altShare)}% of upstream output; the demonstration tolerance is 60%.`),
        p("Najd Crude Cluster can move its full output by rail-and-truck; Dhahab Condensate can move its output by truck-to-rail. Rimal Gas Field and Sahil Offshore Platform have a single export path each."),
        p("Reaching the 60% tolerance would need an alternate route for one of the single-route assets."),
      ]),
    ]),
    ev("EVD-ENR-03", S, { title: "Production ledger Apr–Sep 2026 (illustrative)", kind: "Dataset extract", source: "Demonstration production ledger", summary: "Monthly average production by asset.", entityIds: up.map((e) => e.id) }, [
      ver(1, "2026-10-05", "Initial issue.", ["Monthly averages of metered output; boe conversion uses one illustrative factor."], [
        tbl("Net production by upstream asset (kboe/d)", ["Asset", ...energy.sector.periods], up.map((e) => [e.name, ...e.series!.production])),
        p(`Sahil Offshore output fell from ${sahil.series!.production[0]} to ${attr(sahil, "production")} kboe/d over six months.`),
      ]),
    ]),
    ev("EVD-ENR-04", S, { title: "Sahil reservoir performance note (illustrative)", kind: "Engineering note", source: "Demonstration reservoir team", summary: "Pressure decline and candidate infill locations.", entityIds: [sahil.id] }, [
      ver(1, "2026-10-02", "Initial issue.", ["Qualitative note; no pressure data table is attached."], [
        p("Reservoir pressure at Sahil has declined faster than the original development plan assumed."),
        p("Four candidate infill locations are under review; none has been drilled."),
      ]),
    ]),
    ev("EVD-ENR-05", S, { title: "Wadi hub reliability record (illustrative)", kind: "Operations record", source: "Demonstration plant operations log", summary: "Unplanned outage history for the Wadi Processing Hub.", entityIds: [HUB] }, [
      ver(1, "2026-10-03", "Initial issue.", ["Covers unplanned outages only; scheduled turnarounds are excluded.", "Outage consequences for downstream assets are not assessed.", "No bypass cost estimate has been provided."], [
        p("Over the last 24 months the hub recorded availability of 99.1% on unplanned outages."),
        p("The longest single unplanned outage lasted 3 days (March 2025)."),
        tbl("Unplanned outages, last 24 months", ["Period", "Outages", "Total days lost"], [["Oct 2024 – Mar 2025", 2, 4], ["Apr 2025 – Sep 2025", 1, 1], ["Oct 2025 – Sep 2026", 1, 1]]),
        p("Conclusion in the log: reliability is high; concentration risk is judged tolerable by the plant team."),
      ]),
    ]),
  ],
  newSignals: [{
    id: "SIG-ENR-05", sectorId: S, title: "Wadi hub reliability record is limited to unplanned outages", severity: "low",
    summary: "The reliability record excludes turnarounds and consequences, so it may understate dependency risk.", detectedAt: "2026-10-11T06:50",
    entityIds: [HUB], evidenceIds: ["EVD-ENR-05"], caseId: null, assumptions: ["Record is accurate for the period it covers."],
  } satisfies Signal],
  investigation: {
    caseId: "CAS-ENR-01", priority: "High", ownerId: "PER-ENR-01", dueDate: "2026-10-30",
    question: "Does concentration of production on the Wadi Processing Hub justify funding a bypass feasibility study?",
    objectiveIds: ["OBJ-ENR-02", "OBJ-ENR-03"],
    hypotheses: [
      { id: "H1", kind: "primary", statement: `Hub concentration (${r1(hubShare)}% of production) is a material single point of failure that justifies a bypass study.`, status: "Open", rationale: "Most upstream output has no processing path that bypasses the hub." },
      { id: "H2", kind: "alternative", statement: "Hub reliability is high enough that concentration risk is tolerable without a bypass study.", status: "Open", rationale: "Reliability record shows 99.1% availability and no outage longer than 3 days." },
    ],
    links: [
      { evidenceId: "EVD-ENR-01", version: 1, stance: "supports", hypothesisId: "H1", refs: ["P1", "T1R1"], note: "Three of four upstream assets depend on the hub." },
      { evidenceId: "EVD-ENR-02", version: 1, stance: "supports", hypothesisId: "H1", refs: ["P1", "P3"], note: "Route redundancy is below the 60% tolerance." },
      { evidenceId: "EVD-ENR-05", version: 1, stance: "contradicts", hypothesisId: "H1", refs: ["P1", "P2"], note: "High availability and short outages weaken the urgency." },
      { evidenceId: "EVD-ENR-05", version: 1, stance: "supports", hypothesisId: "H2", refs: ["P3"], note: "Plant team judges concentration tolerable." },
    ],
    assumptions: ["Dependency means no bypass path exists today.", "Study cost of SAR 85 m is an indicative estimate."],
    missing: ["Consequence of a multi-week hub outage on exports.", "Bypass cost estimate and route options."],
    questions: ["Is hub reliability data representative of future conditions?"],
    tasks: [
      { title: "Confirm production share dependent on the hub", description: "Recompute the hub-dependent production share from the production ledger.", assigneeId: "PER-ENR-02", dueDate: "2026-10-12", status: "Done", evidenceIds: ["EVD-ENR-01", "EVD-ENR-03"], findings: `Recomputed: ${fmt(sumAttr(hubAssets, "production"))} of ${fmt(totalProd)} kboe/d (${r1(hubShare)}%).`, completionNote: "Matches the dependency map." },
      { title: "Document outage consequence assumptions", description: "List what a 14-day hub outage would interrupt, without modelling it.", assigneeId: "PER-ENR-01", dueDate: "2026-10-16", status: "In progress", evidenceIds: ["EVD-ENR-01"], findings: "", completionNote: "" },
      { title: "Identify candidate bypass routes", description: "Ask pipeline integrity for feasible bypass corridors and rough scope.", assigneeId: "PER-ENR-05", dueDate: "2026-10-20", status: "Not started", evidenceIds: [], findings: "", completionNote: "" },
    ],
    review: { assigneeId: "PER-ENR-03", scope: "Review whether hub reliability evidence outweighs the concentration evidence, and whether a bypass feasibility study is warranted.", requestedAt: "2026-10-11T09:30", dueDate: "2026-10-20" },
    events: [
      { at: "2026-10-09T11:00", actor: "Layla Haddad (Analyst)", type: "created", text: "Opened the case from signals SIG-ENR-01 and SIG-ENR-03." },
      { at: "2026-10-09T15:00", actor: "Layla Haddad (Analyst)", type: "evidence-linked", text: "Linked dependency map and redundancy review." },
      { at: "2026-10-10T10:00", actor: "Layla Haddad (Analyst)", type: "evidence-linked", text: "Linked hub reliability record (contradicts urgency)." },
      { at: "2026-10-11T09:30", actor: "Layla Haddad (Analyst)", type: "review-requested", text: "Requested expert review from Dr. Hana Al-Rashed." },
    ],
  },
  notification: { title: "Expert review requested: Wadi hub concentration", body: "Dr. Hana Al-Rashed is asked to review CAS-ENR-01 by 2026-10-20.", at: "2026-10-11T09:30" },
};
