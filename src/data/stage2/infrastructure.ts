import type { Signal } from "@/lib/types";
import { infrastructure } from "../infrastructure";
import { attr, fmt, r1 } from "../helpers";
import { ev, p, tbl, ver } from "./blocks";
import type { S2Content } from "./seedtypes";

const S = "infrastructure" as const;
const ents = infrastructure.entities;
const projects = ents.filter((e) => e.category === "Capital project");
const assets = ents.filter((e) => e.category === "Service asset");
const metroC = ents[1];
const metro1 = ents[7];
const behind = attr(metroC, "planned") - attr(metroC, "complete");

export const infrastructureS2: S2Content = {
  people: [
    { id: "PER-INF-01", sectorId: S, name: "Yousef Al-Amri", title: "Programme Delivery Analyst", kind: "analyst" },
    { id: "PER-INF-02", sectorId: S, name: "Hessa Al-Mazrouei", title: "Asset Reliability Analyst", kind: "analyst" },
    { id: "PER-INF-03", sectorId: S, name: "Eng. Fahad Al-Marri", title: "Rail Programme Controls Expert", kind: "expert" },
    { id: "PER-INF-04", sectorId: S, name: "Dr. Aisha Bakr", title: "Asset Reliability Expert", kind: "expert" },
    { id: "PER-INF-05", sectorId: S, name: "Nader Salameh", title: "Contracts Specialist", kind: "specialist" },
  ],
  objectives: [
    { id: "OBJ-INF-01", sectorId: S, text: "Project delivery: keep the budget-weighted delivery gap at or below 3 points." },
    { id: "OBJ-INF-02", sectorId: S, text: "Service availability: keep capital-weighted availability at or above 99.5%." },
    { id: "OBJ-INF-03", sectorId: S, text: "Maintenance backlog: reduce unfunded backlog on the highest-risk assets." },
    { id: "OBJ-INF-04", sectorId: S, text: "Capital commitments: draw commitments in step with delivery." },
  ],
  evidence: [
    ev("EVD-INF-01", S, { title: "Capital programme report (illustrative)", kind: "Report extract", source: "Demonstration programme office", summary: "Budget, commitments, spend and completion.", entityIds: projects.map((e) => e.id) }, [
      ver(1, "2026-09-30", "Initial issue.", ["Completion is as certified by the programme office.", "Contingencies are excluded from commitments."], [
        tbl("Capital projects, Q3 2026 (SAR m)", ["Project", "Budget", "Committed", "Spend", "Complete (%)", "Planned (%)"], projects.map((e) => [e.name, attr(e, "budget"), attr(e, "committed"), attr(e, "capital"), attr(e, "complete"), attr(e, "planned")])),
        p(`Capital Metro Extension – Package C is ${behind} points behind plan (${attr(metroC, "complete")}% against ${attr(metroC, "planned")}%).`),
      ]),
    ]),
    ev("EVD-INF-02", S, { title: "Asset availability and backlog register (illustrative)", kind: "Register extract", source: "Demonstration asset management", summary: "Availability by quarter and backlog by asset.", entityIds: assets.map((e) => e.id) }, [
      ver(1, "2026-09-30", "Initial issue.", ["Availability includes planned closures; backlog is at current-year prices."], [
        tbl("Service assets, Q3 2026", ["Asset", "Availability (%)", "Backlog (SAR m)", "Carrying value (SAR m)"], assets.map((e) => [e.name, attr(e, "availability"), attr(e, "backlog"), attr(e, "capital")])),
        p(`Metro Line 1 availability has fallen from ${metro1.series!.availability[0]}% to ${attr(metro1, "availability")}% over six quarters.`),
      ]),
    ]),
    ev("EVD-INF-03", S, { title: "Contractor delay notice (illustrative)", kind: "Contractor notice", source: "Fictional Metro Package C contractor — notice to Authority", summary: "Contractor attributes delay to design changes.", entityIds: [metroC.id] }, [
      ver(1, "2026-10-03", "Initial issue.", ["Contractor assertion; not verified by the Authority.", "Commercial claim; may be self-serving."], [
        p("The contractor notifies the Authority of delay arising from late design changes at two station interfaces and an eight-week wait for approval of revised drawings."),
        p("The contractor states that these events account for the whole of the programme slippage and reserves its right to claim time and cost."),
      ]),
    ]),
    ev("EVD-INF-04", S, { title: "Independent progress certificate (illustrative)", kind: "Certificate", source: "Fictional independent certifier — progress certificate No. 14", summary: "Certified progress, with off-site works not measured.", entityIds: [metroC.id] }, [
      ver(1, "2026-10-08", "Initial issue.", ["Off-site fabrication is not measured in the certified percentage.", "Certificate addresses progress, not cause of delay."], [
        p(`The certifier certifies completion of ${attr(metroC, "complete")}% as at 30 September 2026 against ${attr(metroC, "planned")}% planned.`),
        p("The certifier attributes about four of the points behind plan to design-change interfaces and finds the remainder consistent with lower than planned site productivity."),
        p("Off-site fabricated systems are not included in the certified percentage."),
      ]),
    ]),
  ],
  newSignals: [{
    id: "SIG-INF-05", sectorId: S, title: "Certifier finds only part of the Metro C slippage is design-related", severity: "moderate",
    summary: "Independent certificate attributes about four points to design changes and the rest to site productivity.", detectedAt: "2026-10-11T08:40",
    entityIds: [metroC.id], evidenceIds: ["EVD-INF-04"], caseId: null, assumptions: ["Certifier's attribution is reasonable."],
  } satisfies Signal],
  investigation: {
    caseId: "CAS-INF-01", priority: "Critical", ownerId: "PER-INF-01", dueDate: "2026-11-04",
    question: "Is the Metro Extension C delay recoverable, and is the SAR 420 m recovery package proportionate to its causes?",
    objectiveIds: ["OBJ-INF-01", "OBJ-INF-04"],
    hypotheses: [
      { id: "H1", kind: "primary", statement: "Most of the slippage is caused by design-change interface issues outside site control.", status: "Open", rationale: "Contractor notice." },
      { id: "H2", kind: "alternative", statement: "A material part of the slippage is lower than planned site productivity.", status: "Open", rationale: "Independent certificate." },
    ],
    links: [
      { evidenceId: "EVD-INF-01", version: 1, stance: "supports", hypothesisId: "H2", refs: ["T1R2", "P1"], note: `Package C is ${behind} points behind plan.` },
      { evidenceId: "EVD-INF-03", version: 1, stance: "supports", hypothesisId: "H1", refs: ["P1", "P2"], note: "Contractor attributes all slippage to design changes (unverified)." },
      { evidenceId: "EVD-INF-04", version: 1, stance: "contradicts", hypothesisId: "H1", refs: ["P2"], note: "Certifier attributes only about four points to design changes." },
      { evidenceId: "EVD-INF-04", version: 1, stance: "supports", hypothesisId: "H2", refs: ["P2", "P3"], note: "Remainder consistent with lower productivity; off-site works unmeasured." },
    ],
    assumptions: ["Certified percentages are comparable to planned percentages.", "Recovery package cost of SAR 420 m is an estimate."],
    missing: ["Measurement of off-site fabricated systems.", "Contractor recovery programme."],
    questions: ["Would the recovery package recover time lost to design changes, or only productivity?"],
    tasks: [
      { title: "Reconcile completion figures with the certificate", description: "Check programme-office completion against certificate No. 14.", assigneeId: "PER-INF-05", dueDate: "2026-10-10", status: "Done", evidenceIds: ["EVD-INF-01", "EVD-INF-04"], findings: `Programme report and certificate agree at ${attr(metroC, "complete")}%.`, completionNote: "No difference found." },
      { title: "Request measurement of off-site works", description: "Ask the certifier to add off-site fabricated systems to the next certificate.", assigneeId: "PER-INF-01", dueDate: "2026-10-18", status: "In progress", evidenceIds: ["EVD-INF-04"], findings: "", completionNote: "" },
      { title: "Obtain contractor recovery programme", description: "Request a time-impact analysis and recovery programme.", assigneeId: "PER-INF-05", dueDate: "2026-10-25", status: "Not started", evidenceIds: ["EVD-INF-03"], findings: "", completionNote: "" },
    ],
    review: { assigneeId: "PER-INF-03", scope: "Review the causes of slippage and whether the recovery package is proportionate.", requestedAt: "2026-10-11T09:45", dueDate: "2026-10-21" },
    events: [
      { at: "2026-10-09T09:15", actor: "Yousef Al-Amri (Analyst)", type: "created", text: "Opened the case from signals SIG-INF-01 and SIG-INF-04." },
      { at: "2026-10-10T10:20", actor: "Yousef Al-Amri (Analyst)", type: "evidence-linked", text: "Linked programme report and contractor notice." },
      { at: "2026-10-11T08:50", actor: "Yousef Al-Amri (Analyst)", type: "evidence-linked", text: "Linked independent certificate (contradicts H1)." },
      { at: "2026-10-11T09:45", actor: "Yousef Al-Amri (Analyst)", type: "review-requested", text: "Requested expert review from Eng. Fahad Al-Marri." },
    ],
  },
  notification: { title: "Expert review requested: Metro Extension C recovery", body: "Eng. Fahad Al-Marri is asked to review CAS-INF-01 by 2026-10-21.", at: "2026-10-11T09:45" },
};
void fmt; void r1;
