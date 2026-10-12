import type { Signal } from "@/lib/types";
import { sovereign } from "../sovereign";
import { attr, fmt, r1, sum, sumAttr } from "../helpers";
import { ev, p, tbl, ver } from "./blocks";
import type { S2Content } from "./seedtypes";

const S = "sovereign" as const;
const ents = sovereign.entities;
const cls = ents; // five external portfolio classes (memo is added later in the index)
const total = sumAttr(cls, "capital");
const eq = ents[0];
const w = (e: (typeof ents)[number]) => (attr(e, "capital") / total) * 100;
const wAt = (e: (typeof ents)[number], i: number) => (e.series!.capital[i] / sum(cls.map((c) => c.series!.capital[i]))) * 100;
const trim = Math.round(attr(eq, "capital") - (attr(eq, "max") / 100) * total);

export const sovereignS2: S2Content = {
  people: [
    { id: "PER-SOV-01", sectorId: S, name: "Reema Al-Salem", title: "Portfolio Allocation Analyst", kind: "analyst" },
    { id: "PER-SOV-02", sectorId: S, name: "Nasser Al-Kuwari", title: "Liquidity Analyst", kind: "analyst" },
    { id: "PER-SOV-03", sectorId: S, name: "Dr. Khalid Al-Obaid", title: "Portfolio Construction Expert", kind: "expert" },
    { id: "PER-SOV-04", sectorId: S, name: "Lamia Abu-Saud", title: "Liquidity and Commitments Expert", kind: "expert" },
    { id: "PER-SOV-05", sectorId: S, name: "Tamer Younes", title: "Risk Analyst", kind: "specialist" },
  ],
  objectives: [
    { id: "OBJ-SOV-01", sectorId: S, text: "Portfolio allocation: hold each class within its mandate band." },
    { id: "OBJ-SOV-02", sectorId: S, text: "Mandate alignment: keep at least 90% of the portfolio within band." },
    { id: "OBJ-SOV-03", sectorId: S, text: "Concentration: keep the largest class at or below 33% of the portfolio." },
    { id: "OBJ-SOV-04", sectorId: S, text: "Liquidity and commitments: keep liquid cover of unfunded commitments at or above 6 times." },
  ],
  evidence: [
    ev("EVD-SOV-01", S, { title: "Portfolio valuation report (illustrative)", kind: "Report extract", source: "Demonstration custody ledger", summary: "Market values by class and quarter.", entityIds: cls.map((e) => e.id) }, [
      ver(1, "2026-09-30", "Initial issue.", ["Quarter-end marks; no intra-quarter prices.", "Memo stakes in Group entities are excluded."], [
        tbl("Market value by class (SAR m)", ["Class", ...sovereign.sector.periods], cls.map((e) => [e.name, ...e.series!.capital])),
        tbl("Weight vs mandate band, Q3 2026", ["Class", "Weight (%)", "Band min (%)", "Band max (%)", "Target (%)"], cls.map((e) => [e.name, r1(w(e)), attr(e, "min"), attr(e, "max"), attr(e, "target")])),
        p(`Global Public Equities are ${r1(w(eq))}% of the portfolio, above the ${attr(eq, "max")}% band maximum. The weight rose ${r1(wAt(eq, 5) - wAt(eq, 0))} points over six quarters.`),
      ]),
    ]),
    ev("EVD-SOV-02", S, { title: "Commitment and liquidity schedule (illustrative)", kind: "Schedule", source: "Demonstration treasury", summary: "Unfunded commitments and liquid assets.", entityIds: cls.map((e) => e.id) }, [
      ver(1, "2026-09-30", "Initial issue.", ["Call timing is indicative."], [
        tbl("Liquidity and unfunded commitments, 30 Sep 2026 (SAR m)", ["Class", "Value", "Liquid within 30 days", "Unfunded commitments"], cls.map((e) => [e.name, attr(e, "capital"), attr(e, "liquid") ? "Yes" : "No", attr(e, "unfunded")])),
      ]),
    ]),
    ev("EVD-SOV-03", S, { title: "Investment mandate extract (illustrative)", kind: "Mandate extract", source: "Fictional Investment Committee — mandate document", summary: "Allocation bands and breach handling.", entityIds: [eq.id] }, [
      ver(1, "2026-07-01", "Initial issue.", ["Fictional wording for demonstration only.", "Does not state a deadline in calendar days."], [
        p("Each asset class is held within a band around its target weight. For Global Public Equities the band is 25% to 35% of the external portfolio."),
        p("A breach of a band maximum is reported to the Investment Committee and corrected at the next rebalancing opportunity, unless the Committee records a temporary exception."),
        p("A temporary exception requires a stated reason and a review date."),
      ]),
    ]),
    ev("EVD-SOV-04", S, { title: "House market outlook note (illustrative)", kind: "Opinion note", source: "Fictional Office Strategy team — outlook note", summary: "Tactical view favouring a temporary equity overweight.", entityIds: [eq.id] }, [
      ver(1, "2026-10-02", "Initial issue.", ["Opinion; not data.", "No downside scenario is quantified."], [
        p("The house view favours a modest, temporary overweight to equities through year end."),
        p("The note does not address the mandate band or the rebalancing procedure."),
      ]),
    ]),
  ],
  newSignals: [{
    id: "SIG-SOV-05", sectorId: S, title: "House outlook favours a temporary equity overweight", severity: "low",
    summary: "An opinion note favours overweight equities, which could support a temporary exception request.", detectedAt: "2026-10-11T08:10",
    entityIds: [eq.id], evidenceIds: ["EVD-SOV-04"], caseId: null, assumptions: ["Outlook is a view, not a forecast."],
  } satisfies Signal],
  investigation: {
    caseId: "CAS-SOV-01", priority: "High", ownerId: "PER-SOV-01", dueDate: "2026-10-29",
    question: "Should global equities be trimmed to the band ceiling now, or is a temporary exception justified?",
    objectiveIds: ["OBJ-SOV-01", "OBJ-SOV-02"],
    hypotheses: [
      { id: "H1", kind: "primary", statement: `The ${r1(w(eq))}% weight breaches the ${attr(eq, "max")}% band maximum and should be corrected at the next rebalancing opportunity.`, status: "Open", rationale: "Mandate requires correction unless the Committee records an exception." },
      { id: "H2", kind: "alternative", statement: "A temporary exception is justified by the house market view.", status: "Open", rationale: "Outlook note favours a temporary overweight." },
    ],
    links: [
      { evidenceId: "EVD-SOV-01", version: 1, stance: "supports", hypothesisId: "H1", refs: ["T2R1", "P1"], note: `Equities ${r1(w(eq))}% against a ${attr(eq, "max")}% maximum.` },
      { evidenceId: "EVD-SOV-03", version: 1, stance: "supports", hypothesisId: "H1", refs: ["P2"], note: "Breaches are corrected unless an exception is recorded." },
      { evidenceId: "EVD-SOV-04", version: 1, stance: "contradicts", hypothesisId: "H1", refs: ["P1"], note: "House view favours a temporary overweight." },
      { evidenceId: "EVD-SOV-03", version: 1, stance: "context", hypothesisId: "H2", refs: ["P3"], note: "An exception needs a reason and a review date." },
    ],
    assumptions: ["Prices are as at 30 Sep 2026.", `Trim to ceiling is SAR ${fmt(trim)} m (value above the ${attr(eq, "max")}% band maximum).`],
    missing: ["Transaction cost estimate.", "Downside view if the overweight is retained."],
    questions: ["Has the Investment Committee ever recorded an exception for this class?"],
    tasks: [
      { title: "Recompute class weights from the custody ledger", description: "Independently recompute weights for six quarters.", assigneeId: "PER-SOV-05", dueDate: "2026-10-11", status: "Done", evidenceIds: ["EVD-SOV-01"], findings: `Recomputed equity weight ${r1(w(eq))}% matches the valuation report.`, completionNote: "Spreadsheet reconciled." },
      { title: "Draft the temporary-exception template", description: "Outline the reason and review-date fields an exception would need.", assigneeId: "PER-SOV-01", dueDate: "2026-10-17", status: "In progress", evidenceIds: ["EVD-SOV-03"], findings: "", completionNote: "" },
      { title: "Estimate rebalancing transaction costs", description: "Collect indicative trading costs for the trim.", assigneeId: "PER-SOV-02", dueDate: "2026-10-22", status: "Not started", evidenceIds: [], findings: "", completionNote: "" },
    ],
    review: { assigneeId: "PER-SOV-03", scope: "Review whether the mandate requires correction now and whether a temporary exception is defensible on the evidence.", requestedAt: "2026-10-11T13:30", dueDate: "2026-10-21" },
    events: [
      { at: "2026-10-10T08:45", actor: "Reema Al-Salem (Analyst)", type: "created", text: "Opened the case from signals SIG-SOV-01 and SIG-SOV-02." },
      { at: "2026-10-10T14:30", actor: "Reema Al-Salem (Analyst)", type: "evidence-linked", text: "Linked valuation report and mandate extract." },
      { at: "2026-10-11T09:30", actor: "Reema Al-Salem (Analyst)", type: "evidence-linked", text: "Linked house outlook note (contradicts H1)." },
      { at: "2026-10-11T13:30", actor: "Reema Al-Salem (Analyst)", type: "review-requested", text: "Requested expert review from Dr. Khalid Al-Obaid." },
    ],
  },
  notification: { title: "Expert review requested: Equity overweight", body: "Dr. Khalid Al-Obaid is asked to review CAS-SOV-01 by 2026-10-21.", at: "2026-10-11T13:30" },
};
