import type { Signal } from "@/lib/types";
import { realestate } from "../realestate";
import { attr, fmt, r1, sumAttr } from "../helpers";
import { ev, p, tbl, ver } from "./blocks";
import type { S2Content } from "./seedtypes";

const S = "realestate" as const;
const ents = realestate.entities;
const assets = ents.filter((e) => e.category === "Income asset");
const devs = ents.filter((e) => e.category === "Development");
const olaya = ents[0];
const occ = (e: (typeof ents)[number], i: number) => (e.series!.occupied[i] / attr(e, "leasable")) * 100;

export const realestateS2: S2Content = {
  people: [
    { id: "PER-REA-01", sectorId: S, name: "Abdulaziz Al-Rashid", title: "Leasing Analyst", kind: "analyst" },
    { id: "PER-REA-02", sectorId: S, name: "Dalal Al-Shehri", title: "Development Delivery Analyst", kind: "analyst" },
    { id: "PER-REA-03", sectorId: S, name: "Dr. Reem Al-Jubeir", title: "Commercial Leasing Market Expert", kind: "expert" },
    { id: "PER-REA-04", sectorId: S, name: "Eng. Walid Nasser", title: "Development Delivery Expert", kind: "expert" },
    { id: "PER-REA-05", sectorId: S, name: "Joud Al-Anazi", title: "Asset Manager", kind: "specialist" },
  ],
  objectives: [
    { id: "OBJ-REA-01", sectorId: S, text: "Occupancy: keep portfolio occupancy at or above 93%." },
    { id: "OBJ-REA-02", sectorId: S, text: "Lease expiries: keep expiries within 12 months at or below 18% of occupied area." },
    { id: "OBJ-REA-03", sectorId: S, text: "Development milestones: keep the budget-weighted milestone gap at or below 3 points." },
    { id: "OBJ-REA-04", sectorId: S, text: "Asset concentration: keep top-two assets at or below 35% of carrying value." },
  ],
  evidence: [
    ev("EVD-REA-01", S, { title: "Occupancy ledger (illustrative)", kind: "Dataset extract", source: "Demonstration property system", summary: "Leasable and occupied area by quarter.", entityIds: assets.map((e) => e.id) }, [
      ver(1, "2026-09-30", "Initial issue.", ["Area-based occupancy; rent levels are not included."], [
        tbl("Occupancy by income asset (%)", ["Asset", ...realestate.sector.periods], assets.map((e) => [e.name, ...realestate.sector.periods.map((_, i) => r1(occ(e, i)))])),
        p(`Olaya Tower occupancy fell from ${r1(occ(olaya, 0))}% to ${r1(occ(olaya, 5))}% over five quarters.`),
      ]),
    ]),
    ev("EVD-REA-02", S, { title: "Lease expiry schedule (illustrative)", kind: "Schedule", source: "Demonstration lease register", summary: "Area expiring in the next 12 months.", entityIds: assets.map((e) => e.id) }, [
      ver(1, "2026-09-30", "Initial issue.", ["Break options are treated as expiries; renewal likelihood is not modelled."], [
        tbl("Area expiring within 12 months (k sqm)", ["Asset", "Occupied", "Expiring", "Expiring share (%)"], assets.map((e) => [e.name, attr(e, "occupied"), attr(e, "expiring"), r1((attr(e, "expiring") / attr(e, "occupied")) * 100)])),
        p(`Portfolio expiries are ${r1((sumAttr(assets, "expiring") / sumAttr(assets, "occupied")) * 100)}% of occupied area.`),
      ]),
    ]),
    ev("EVD-REA-03", S, { title: "Development progress report (illustrative)", kind: "Report extract", source: "Demonstration project controls", summary: "Planned vs actual completion and spend.", entityIds: devs.map((e) => e.id) }, [
      ver(1, "2026-09-30", "Initial issue.", ["Progress is as certified by project managers."], [
        tbl("Developments, Q3 2026", ["Project", "Budget (SAR m)", "Spend (SAR m)", "Complete (%)", "Planned (%)"], devs.map((e) => [e.name, attr(e, "budget"), attr(e, "capital"), attr(e, "complete"), attr(e, "planned")])),
      ]),
    ]),
    ev("EVD-REA-04", S, { title: "Olaya Tower tenant exit survey summary (illustrative)", kind: "Survey summary", source: "Fictional Leasing team exit interviews", summary: "Reasons given by tenants who left Olaya Tower.", entityIds: [olaya.id] }, [
      ver(1, "2026-10-06", "Initial issue.", ["Nine responses only; not statistically representative.", "Self-reported reasons; no rent data."], [
        p("Of nine departing tenants interviewed, six cited dated common areas and lifts, five cited incentive packages offered by competing buildings, and two cited relocation to cheaper space (multiple answers allowed)."),
        p("Respondents rated location and building services positively."),
      ]),
    ]),
    ev("EVD-REA-05", S, { title: "Riyadh office market note (illustrative)", kind: "Broker market note", source: "Fictional brokerage — market research note", summary: "Submarket vacancy trend.", entityIds: [olaya.id] }, [
      ver(1, "2026-10-01", "Initial issue.", ["Broker view; methodology not disclosed.", "Covers the whole submarket, not Grade-A towers only."], [
        p("Submarket office vacancy rose by about two percentage points over the last twelve months."),
        p("Brokers attribute the rise to new supply and tenants consolidating space."),
      ]),
    ]),
  ],
  newSignals: [{
    id: "SIG-REA-05", sectorId: S, title: "Submarket office vacancy up about two points", severity: "low",
    summary: "A broker note reports rising submarket vacancy, which may partly explain Olaya Tower's decline.", detectedAt: "2026-10-11T08:00",
    entityIds: [olaya.id], evidenceIds: ["EVD-REA-05"], caseId: null, assumptions: ["Broker data is directionally right."],
  } satisfies Signal],
  investigation: {
    caseId: "CAS-REA-01", priority: "High", ownerId: "PER-REA-01", dueDate: "2026-11-08",
    question: "Is Olaya Tower's occupancy decline specific to the asset, and would the SAR 180 m refurbishment and incentive package address it?",
    objectiveIds: ["OBJ-REA-01", "OBJ-REA-02"],
    hypotheses: [
      { id: "H1", kind: "primary", statement: "The decline is asset-specific: dated common areas and uncompetitive incentives are driving tenant exits.", status: "Open", rationale: "Five consecutive quarters of decline while other assets are stable." },
      { id: "H2", kind: "alternative", statement: "The decline mainly reflects a weaker submarket (rising vacancy).", status: "Open", rationale: "Broker note reports rising vacancy." },
    ],
    links: [
      { evidenceId: "EVD-REA-01", version: 1, stance: "supports", hypothesisId: "H1", refs: ["T1R1", "P1"], note: "Olaya declines while Galleria, Logistics Park and Residential are stable or rising." },
      { evidenceId: "EVD-REA-04", version: 1, stance: "supports", hypothesisId: "H1", refs: ["P1"], note: "Six of nine departing tenants cite dated common areas (n=9)." },
      { evidenceId: "EVD-REA-05", version: 1, stance: "contradicts", hypothesisId: "H1", refs: ["P1"], note: "Market-wide vacancy rise offers another explanation." },
      { evidenceId: "EVD-REA-05", version: 1, stance: "supports", hypothesisId: "H2", refs: ["P1", "P2"], note: "Submarket vacancy up about two points." },
    ],
    assumptions: ["Area occupancy is a fair proxy for income.", `Package cost of SAR 180 m is an estimate (asset carrying value SAR ${fmt(attr(olaya, "capital"))} m).`],
    missing: ["Rent levels versus competing buildings.", "Survey responses beyond nine tenants."],
    questions: ["Would tenants return after refurbishment, or is demand structurally lower?"],
    tasks: [
      { title: "Confirm Olaya occupancy from the property system", description: "Check leasable and occupied area for the last six quarters.", assigneeId: "PER-REA-05", dueDate: "2026-10-11", status: "Done", evidenceIds: ["EVD-REA-01"], findings: `Occupied area fell from ${olaya.series!.occupied[0]} to ${attr(olaya, "occupied")} k sqm of ${attr(olaya, "leasable")} k sqm leasable.`, completionNote: "Matches the occupancy ledger." },
      { title: "Collect competing-building incentive terms", description: "Gather incentive terms from three competing Grade-A towers.", assigneeId: "PER-REA-01", dueDate: "2026-10-19", status: "In progress", evidenceIds: [], findings: "", completionNote: "" },
      { title: "Extend the exit survey to remaining tenants", description: "Interview at least ten more tenants.", assigneeId: "PER-REA-05", dueDate: "2026-10-26", status: "Not started", evidenceIds: ["EVD-REA-04"], findings: "", completionNote: "" },
    ],
    review: { assigneeId: "PER-REA-03", scope: "Review whether the evidence points to asset-specific or market-wide causes and whether the refurbishment package is proportionate.", requestedAt: "2026-10-11T14:00", dueDate: "2026-10-23" },
    events: [
      { at: "2026-10-09T09:45", actor: "Abdulaziz Al-Rashid (Analyst)", type: "created", text: "Opened the case from signals SIG-REA-01 and SIG-REA-02." },
      { at: "2026-10-10T11:00", actor: "Abdulaziz Al-Rashid (Analyst)", type: "evidence-linked", text: "Linked occupancy ledger and exit survey." },
      { at: "2026-10-11T09:20", actor: "Abdulaziz Al-Rashid (Analyst)", type: "evidence-linked", text: "Linked broker market note (alternative explanation)." },
      { at: "2026-10-11T14:00", actor: "Abdulaziz Al-Rashid (Analyst)", type: "review-requested", text: "Requested expert review from Dr. Reem Al-Jubeir." },
    ],
  },
  notification: { title: "Expert review requested: Olaya Tower leasing recovery", body: "Dr. Reem Al-Jubeir is asked to review CAS-REA-01 by 2026-10-23.", at: "2026-10-11T14:00" },
};
