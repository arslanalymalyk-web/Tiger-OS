import type { Signal } from "@/lib/types";
import { insurance } from "../insurance";
import { attr, fmt, r1, sumAttr } from "../helpers";
import { ev, p, tbl, ver } from "./blocks";
import type { S2Content } from "./seedtypes";

const S = "insurance" as const;
const ents = insurance.entities;
const lines = ents.filter((e) => e.category === "Line of business");
const re = ents.filter((e) => e.category === "Reinsurer");
const eng = ents[4];
const gap = attr(eng, "reserveBest") - attr(eng, "reserve");
const adequacy = (sumAttr(lines, "reserve") / sumAttr(lines, "reserveBest")) * 100;
// Accident-year split of the Engineering reserve; sums must equal the line totals (checked by verify-store).
const ay: [string, number, number][] = [["2022", 180, 190], ["2023", 240, 265], ["2024", 310, 350], ["2025", attr(eng, "reserve") - 730, attr(eng, "reserveBest") - 805]];

export const insuranceS2: S2Content = {
  people: [
    { id: "PER-INS-01", sectorId: S, name: "Huda Al-Zahrani", title: "Reserving Analyst", kind: "analyst" },
    { id: "PER-INS-02", sectorId: S, name: "Faisal Nasser", title: "Reinsurance Analyst", kind: "analyst" },
    { id: "PER-INS-03", sectorId: S, name: "Dr. Imran Qureshi", title: "Appointed Actuary (fictional)", kind: "expert" },
    { id: "PER-INS-04", sectorId: S, name: "Salma Al-Kaabi", title: "Reinsurance Specialist", kind: "expert" },
    { id: "PER-INS-05", sectorId: S, name: "Dina Farouk", title: "Claims Analyst", kind: "specialist" },
  ],
  objectives: [
    { id: "OBJ-INS-01", sectorId: S, text: "Claims: keep the portfolio loss ratio at or below 70%." },
    { id: "OBJ-INS-02", sectorId: S, text: "Underwriting exposure: grow premium within capital allocated to each line." },
    { id: "OBJ-INS-03", sectorId: S, text: "Reserving assumptions: hold booked reserves at or above the best estimate." },
    { id: "OBJ-INS-04", sectorId: S, text: "Reinsurance concentration: keep the largest reinsurer at or below 40% of recoverables." },
  ],
  evidence: [
    ev("EVD-INS-01", S, { title: "Actuarial reserving run (illustrative)", kind: "Model output", source: "Demonstration actuarial team", summary: "Best-estimate reserves by line.", entityIds: lines.map((e) => e.id) }, [
      ver(1, "2026-09-30", "Initial issue.", ["Single best-estimate run; no distribution of outcomes is provided.", "Large-loss development follows an illustrative pattern."], [
        tbl("Booked vs best-estimate reserves by line, 30 Sep 2026 (SAR m)", ["Line", "Booked", "Best estimate", "Gap"], lines.map((e) => [e.name, attr(e, "reserve"), attr(e, "reserveBest"), attr(e, "reserveBest") - attr(e, "reserve")])),
        p(`Portfolio reserve adequacy is ${r1(adequacy)}% of best estimate. Engineering & Construction has the largest gap (SAR ${fmt(gap)} m).`),
      ]),
    ]),
    ev("EVD-INS-02", S, { title: "Reinsurance recoverables schedule (illustrative)", kind: "Dataset extract", source: "Demonstration reinsurance ledger", summary: "Recoverables by counterparty.", entityIds: re.map((e) => e.id) }, [
      ver(1, "2026-09-30", "Initial issue.", ["Recoverables are treated as undisputed; credit ratings are not modelled."], [
        tbl("Recoverables by reinsurer, 30 Sep 2026 (SAR m)", ["Reinsurer", "Recoverable", "Share (%)"], re.map((e) => [e.name, attr(e, "recoverable"), r1((attr(e, "recoverable") / sumAttr(re, "recoverable")) * 100)])),
      ]),
    ]),
    ev("EVD-INS-03", S, { title: "Medical claims trend report (illustrative)", kind: "Report extract", source: "Demonstration claims analytics", summary: "Frequency and severity trend.", entityIds: [ents[2].id] }, [
      ver(1, "2026-09-30", "Initial issue.", ["Trend figures are qualitative in this extract."], [
        p("Medical claim frequency is stable; severity per claim has risen faster than tariff over the last four quarters."),
        p(`The medical loss ratio is ${r1((attr(ents[2], "claims") / attr(ents[2], "earned")) * 100)}% against a 75% alert tolerance.`),
      ]),
    ]),
    ev("EVD-INS-04", S, { title: "Engineering claims development extract (illustrative)", kind: "Dataset extract", source: "Demonstration actuarial team", summary: "Booked and best-estimate reserve by accident year, Engineering & Construction.", entityIds: [eng.id] }, [
      ver(1, "2026-10-02", "Initial issue.", ["Accident-year allocation of the booked reserve is approximate.", "Large individual losses are not itemised."], [
        tbl("Engineering & Construction reserves by accident year (SAR m)", ["Accident year", "Booked", "Best estimate", "Gap"], ay.map(([y, b, e]) => [y, b, e, e - b])),
        p(`The gap widens for recent accident years and totals SAR ${fmt(gap)} m.`),
      ]),
    ]),
    ev("EVD-INS-05", S, { title: "Appointed actuary commentary (illustrative)", kind: "Expert commentary", source: "Fictional appointed actuary's office", summary: "View that the reserve gap is within the estimation range.", entityIds: [eng.id] }, [
      ver(1, "2026-10-06", "Initial issue.", ["The method for the stated range is not included.", "Commentary pre-dates the accident-year extract."], [
        p("The uncertainty range around the Engineering & Construction best estimate is roughly plus or minus SAR 150 m."),
        p(`A booked shortfall of SAR ${fmt(gap)} m therefore lies within the range; strengthening is a prudence choice rather than a necessity.`),
        p("We recommend monitoring development for a further quarter before changing booked reserves."),
      ]),
    ]),
  ],
  newSignals: [{
    id: "SIG-INS-05", sectorId: S, title: "Actuarial range method for Engineering reserves is undocumented", severity: "low",
    summary: "The appointed actuary's uncertainty range is stated without its method.", detectedAt: "2026-10-11T09:00",
    entityIds: [eng.id], evidenceIds: ["EVD-INS-05"], caseId: null, assumptions: ["Commentary reflects the actuary's view at 2026-10-06."],
  } satisfies Signal],
  investigation: {
    caseId: "CAS-INS-01", priority: "High", ownerId: "PER-INS-01", dueDate: "2026-10-31",
    question: "Are Engineering & Construction reserves adequate, and should they be strengthened to best estimate now?",
    objectiveIds: ["OBJ-INS-03"],
    hypotheses: [
      { id: "H1", kind: "primary", statement: `Booked Engineering reserves are SAR ${fmt(gap)} m short of best estimate because of large-loss development, and should be strengthened.`, status: "Open", rationale: "Gap is largest in recent accident years." },
      { id: "H2", kind: "alternative", statement: "The shortfall is within normal estimation uncertainty and can be monitored for a quarter.", status: "Open", rationale: "Appointed actuary commentary." },
    ],
    links: [
      { evidenceId: "EVD-INS-01", version: 1, stance: "supports", hypothesisId: "H1", refs: ["T1R5", "P1"], note: "Engineering has the largest gap." },
      { evidenceId: "EVD-INS-04", version: 1, stance: "supports", hypothesisId: "H1", refs: ["T1R3", "T1R4"], note: "Gap widens in 2024 and 2025." },
      { evidenceId: "EVD-INS-05", version: 1, stance: "contradicts", hypothesisId: "H1", refs: ["P2"], note: "Actuary regards the gap as within range." },
      { evidenceId: "EVD-INS-05", version: 1, stance: "supports", hypothesisId: "H2", refs: ["P1", "P3"], note: "Range of plus or minus SAR 150 m; monitor." },
    ],
    assumptions: ["Best estimate is from a single illustrative run.", "Strengthening equals the shortfall to best estimate."],
    missing: ["Method behind the actuary's uncertainty range.", "Itemised large losses."],
    questions: ["Is a one-quarter delay acceptable given the widening recent-year gap?"],
    tasks: [
      { title: "Reconcile booked reserves to the ledger", description: "Confirm booked Engineering reserve of the amount shown in the actuarial run.", assigneeId: "PER-INS-05", dueDate: "2026-10-10", status: "Done", evidenceIds: ["EVD-INS-01"], findings: `Booked reserve SAR ${fmt(attr(eng, "reserve"))} m reconciles to the ledger.`, completionNote: "No differences found." },
      { title: "Request the actuary's range method", description: "Ask for the method and assumptions behind the plus or minus SAR 150 m range.", assigneeId: "PER-INS-01", dueDate: "2026-10-16", status: "In progress", evidenceIds: ["EVD-INS-05"], findings: "", completionNote: "" },
      { title: "Itemise large Engineering losses", description: "List the large losses driving recent accident years.", assigneeId: "PER-INS-05", dueDate: "2026-10-21", status: "Not started", evidenceIds: ["EVD-INS-04"], findings: "", completionNote: "" },
    ],
    review: { assigneeId: "PER-INS-03", scope: "Review whether the Engineering reserve gap is material relative to estimation uncertainty and whether strengthening now is warranted.", requestedAt: "2026-10-11T12:00", dueDate: "2026-10-22" },
    events: [
      { at: "2026-10-09T10:30", actor: "Huda Al-Zahrani (Analyst)", type: "created", text: "Opened the case from signals SIG-INS-01 and SIG-INS-02." },
      { at: "2026-10-10T09:45", actor: "Huda Al-Zahrani (Analyst)", type: "evidence-linked", text: "Linked actuarial run and accident-year extract." },
      { at: "2026-10-11T08:30", actor: "Huda Al-Zahrani (Analyst)", type: "evidence-linked", text: "Linked appointed actuary commentary (contradicts H1)." },
      { at: "2026-10-11T12:00", actor: "Huda Al-Zahrani (Analyst)", type: "review-requested", text: "Requested expert review from Dr. Imran Qureshi." },
    ],
  },
  notification: { title: "Expert review requested: Reserving review", body: "Dr. Imran Qureshi is asked to review CAS-INS-01 by 2026-10-22.", at: "2026-10-11T12:00" },
};
