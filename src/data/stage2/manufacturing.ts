import type { Signal } from "@/lib/types";
import { manufacturing } from "../manufacturing";
import { attr, r1 } from "../helpers";
import { ev, p, tbl, ver } from "./blocks";
import type { S2Content } from "./seedtypes";

const S = "manufacturing" as const;
const ents = manufacturing.entities;
const plants = ents.filter((e) => e.category === "Plant");
const sup = ents.filter((e) => e.category === "Supplier");
const dunes = ents[3];
const pk = ents[4];
const util = (e: (typeof ents)[number]) => (attr(e, "output") / attr(e, "capacity")) * 100;

export const manufacturingS2: S2Content = {
  people: [
    { id: "PER-MFG-01", sectorId: S, name: "Majed Al-Harbi", title: "Plant Performance Analyst", kind: "analyst" },
    { id: "PER-MFG-02", sectorId: S, name: "Reem Al-Mutairi", title: "Supply Resilience Analyst", kind: "analyst" },
    { id: "PER-MFG-03", sectorId: S, name: "Eng. Saud Al-Zamil", title: "Process Engineering Expert", kind: "expert" },
    { id: "PER-MFG-04", sectorId: S, name: "Dr. Nawaf Al-Subaie", title: "Supply Chain Risk Expert", kind: "expert" },
    { id: "PER-MFG-05", sectorId: S, name: "Abeer Fakhro", title: "Plant Maintenance Planner", kind: "specialist" },
  ],
  objectives: [
    { id: "OBJ-MFG-01", sectorId: S, text: "Plant capacity: keep portfolio utilisation at or above 88%." },
    { id: "OBJ-MFG-02", sectorId: S, text: "Production variance: keep output within 3% of plan." },
    { id: "OBJ-MFG-03", sectorId: S, text: "Supplier dependencies: keep sole-source spend at or below 50%." },
    { id: "OBJ-MFG-04", sectorId: S, text: "Capital exposure: limit capital at plants below 85% utilisation." },
  ],
  evidence: [
    ev("EVD-MFG-01", S, { title: "Plant output ledger Apr–Sep 2026 (illustrative)", kind: "Dataset extract", source: "Demonstration plant MES", summary: "Monthly output and plan by plant.", entityIds: plants.map((e) => e.id) }, [
      ver(1, "2026-10-05", "Initial issue.", ["Mixed products are summed in tonnes.", "Planned outages are not separated from unplanned stoppages."], [
        tbl("Output by plant (kt/month)", ["Plant", ...manufacturing.sector.periods, "Plan (Sep)", "Utilisation Sep (%)"], plants.map((e) => [e.name, ...e.series!.output, attr(e, "plan"), r1(util(e))])),
        p(`Dunes Cement Works output fell from ${dunes.series!.output[0]} to ${attr(dunes, "output")} kt/month against a plan of ${attr(dunes, "plan")}. Noor Packaging Complex is at ${r1(util(pk))}% utilisation.`),
      ]),
    ]),
    ev("EVD-MFG-02", S, { title: "Supplier dependency register (illustrative)", kind: "Register extract", source: "Demonstration procurement", summary: "Spend, sole-source flag and plant links.", entityIds: sup.map((e) => e.id) }, [
      ver(1, "2026-09-30", "Initial issue.", ["Spend is trailing twelve months; sole-source means no qualified alternative today."], [
        tbl("Suppliers, T12M to 30 Sep 2026", ["Supplier", "Spend (SAR m)", "Sole source"], sup.map((e) => [e.name, attr(e, "spend"), attr(e, "soleSource") ? "Yes" : "No"])),
      ]),
    ]),
    ev("EVD-MFG-03", S, { title: "Dunes kiln inspection report (illustrative)", kind: "Engineering report", source: "Fictional Dunes Cement Works maintenance engineering", summary: "Kiln refractory condition and stoppages.", entityIds: [dunes.id] }, [
      ver(1, "2026-10-04", "Initial issue.", ["Visual inspection only; no thermal survey data is attached.", "Repair cost is an engineering estimate."], [
        p("Refractory lining in the burning zone is worn beyond the planned replacement threshold in two of five inspected sections."),
        p("Two unplanned kiln stoppages occurred in August and September, totalling about nine days."),
        p("Full refurbishment needs an eight-week outage; a phased repair would restore part of the capacity sooner but would need a further outage within a year."),
      ]),
    ]),
    ev("EVD-MFG-04", S, { title: "Regional cement demand outlook — draft (illustrative)", kind: "Draft forecast", source: "Fictional Commercial Planning — draft", summary: "Draft demand outlook; Q4 figures missing.", entityIds: [dunes.id] }, [
      ver(1, "2026-09-25", "Draft issue.", ["Draft: Q4 2026 figures are missing.", "Based on three of five regional customers."], [
        p("Regional cement demand for Q3 2026 was flat to slightly higher than Q2."),
        p("Planned infrastructure orders suggest stable demand through year end, but the Q4 volume table has not yet been completed."),
      ]),
    ]),
  ],
  newSignals: [{
    id: "SIG-MFG-05", sectorId: S, title: "Dunes kiln refractory worn in two of five sections", severity: "moderate",
    summary: "Inspection finds burning-zone refractory worn beyond threshold; two unplanned stoppages in Aug–Sep.", detectedAt: "2026-10-11T07:10",
    entityIds: [dunes.id], evidenceIds: ["EVD-MFG-03"], caseId: null, assumptions: ["Inspection findings are accurate."],
  } satisfies Signal],
  investigation: {
    caseId: "CAS-MFG-01", priority: "High", ownerId: "PER-MFG-01", dueDate: "2026-11-05",
    question: "Why are Dunes Cement and Noor Packaging below 85% utilisation, and is the SAR 210 m kiln refurbishment warranted?",
    objectiveIds: ["OBJ-MFG-01", "OBJ-MFG-04"],
    hypotheses: [
      { id: "H1", kind: "primary", statement: "Kiln wear at Dunes Cement is the main cause of its output decline.", status: "Open", rationale: "Output has fallen every month since April." },
      { id: "H2", kind: "alternative", statement: "Softer regional demand explains the output decline.", status: "Open", rationale: "Would also explain low Packaging utilisation." },
    ],
    links: [
      { evidenceId: "EVD-MFG-01", version: 1, stance: "supports", hypothesisId: "H1", refs: ["T1R4", "P1"], note: "Steady monthly decline at Dunes." },
      { evidenceId: "EVD-MFG-03", version: 1, stance: "supports", hypothesisId: "H1", refs: ["P1", "P2"], note: "Worn refractory and two unplanned stoppages." },
      { evidenceId: "EVD-MFG-04", version: 1, stance: "contradicts", hypothesisId: "H2", refs: ["P1", "P2"], note: "Demand flat to higher (draft; Q4 missing)." },
    ],
    assumptions: ["Output decline is not planned maintenance.", "Refurbishment budget of SAR 210 m is an estimate."],
    missing: ["Q4 demand volumes.", "Thermal survey data for the kiln."],
    questions: ["Is the Noor Packaging shortfall related to Dunes or independent?"],
    tasks: [
      { title: "Separate planned from unplanned downtime", description: "Split Dunes downtime into planned and unplanned categories.", assigneeId: "PER-MFG-05", dueDate: "2026-10-12", status: "Done", evidenceIds: ["EVD-MFG-01", "EVD-MFG-03"], findings: "About nine days of unplanned stoppage in Aug–Sep; no planned outage in the period.", completionNote: "Based on maintenance work orders." },
      { title: "Obtain the completed Q4 demand table", description: "Ask Commercial Planning to finish the draft outlook.", assigneeId: "PER-MFG-01", dueDate: "2026-10-18", status: "In progress", evidenceIds: ["EVD-MFG-04"], findings: "", completionNote: "" },
      { title: "Compare full vs phased refurbishment scope", description: "Summarise outage length and recovered capacity for each option.", assigneeId: "PER-MFG-05", dueDate: "2026-10-23", status: "Not started", evidenceIds: ["EVD-MFG-03"], findings: "", completionNote: "" },
    ],
    review: { assigneeId: "PER-MFG-03", scope: "Review whether kiln wear explains the Dunes output decline and whether full refurbishment is proportionate.", requestedAt: "2026-10-11T13:00", dueDate: "2026-10-21" },
    events: [
      { at: "2026-10-09T09:30", actor: "Majed Al-Harbi (Analyst)", type: "created", text: "Opened the case from signals SIG-MFG-01 and SIG-MFG-04." },
      { at: "2026-10-10T10:00", actor: "Majed Al-Harbi (Analyst)", type: "evidence-linked", text: "Linked output ledger and kiln inspection report." },
      { at: "2026-10-11T09:00", actor: "Majed Al-Harbi (Analyst)", type: "evidence-linked", text: "Linked draft demand outlook (incomplete)." },
      { at: "2026-10-11T13:00", actor: "Majed Al-Harbi (Analyst)", type: "review-requested", text: "Requested expert review from Eng. Saud Al-Zamil." },
    ],
  },
  notification: { title: "Expert review requested: Under-utilised plants", body: "Eng. Saud Al-Zamil is asked to review CAS-MFG-01 by 2026-10-21.", at: "2026-10-11T13:00" },
};
