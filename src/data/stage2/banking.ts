import type { Signal } from "@/lib/types";
import { banking } from "../banking";
import { attr, r1, sum, sumAttr } from "../helpers";
import { ev, p, tbl, ver } from "./blocks";
import type { S2Content } from "./seedtypes";

const S = "banking" as const;
const ents = banking.entities;
const credit = ents.filter((e) => e.category === "Credit portfolio");
const liq = ents[5];
const funding = ents.filter((e) => e.category === "Funding");
const re = ents[1];
const pay = ents[9];
const P = banking.sector.periods;
const lcr = (i: number) => (liq.series!.hqla[i] / sum(funding.map((f) => f.series!.outflow30[i]))) * 100;
const outflow = (i: number) => sum(funding.map((f) => f.series!.outflow30[i]));

export const bankingS2: S2Content = {
  people: [
    { id: "PER-BNK-01", sectorId: S, name: "Noura Al-Fahad", title: "Liquidity Analyst", kind: "analyst" },
    { id: "PER-BNK-02", sectorId: S, name: "Khalid Mansour", title: "Credit Risk Analyst", kind: "analyst" },
    { id: "PER-BNK-03", sectorId: S, name: "Sara Al-Otaibi", title: "Payments Resilience Analyst", kind: "analyst" },
    { id: "PER-BNK-04", sectorId: S, name: "Dr. Maha Al-Sudairi", title: "Liquidity Risk Expert", kind: "expert" },
    { id: "PER-BNK-05", sectorId: S, name: "Rami Al-Ghannam", title: "Credit Risk Expert", kind: "expert" },
    { id: "PER-BNK-06", sectorId: S, name: "Yara Haddadin", title: "Treasury Operations Specialist", kind: "specialist" },
  ],
  objectives: [
    { id: "OBJ-BNK-01", sectorId: S, text: "Capital: keep the capital adequacy ratio at or above 16%." },
    { id: "OBJ-BNK-02", sectorId: S, text: "Liquidity: keep the liquidity coverage ratio at or above 120%." },
    { id: "OBJ-BNK-03", sectorId: S, text: "Credit exposure: keep top-two sector concentration at or below 40%." },
    { id: "OBJ-BNK-04", sectorId: S, text: "Payment resilience: keep payment platform availability at or above 99.95%." },
  ],
  evidence: [
    ev("EVD-BNK-01", S, { title: "Liquidity ladder Q2 25–Q3 26 (illustrative)", kind: "Dataset extract", source: "Demonstration treasury ledger", summary: "HQLA and stressed outflows by quarter.", entityIds: [liq.id, ...funding.map((e) => e.id)] }, [
      ver(1, "2026-09-30", "Initial issue.", ["Quarter-end values only; intra-quarter movements are not shown.", "Outflow rates embed demonstration run-off assumptions."], [
        tbl("HQLA, stressed 30-day outflows and LCR by quarter (SAR m)", ["Quarter", "HQLA", "Retail outflow", "Corporate outflow", "Wholesale outflow", "Total outflow", "LCR (%)"], P.map((q, i) => [q, liq.series!.hqla[i], funding[0].series!.outflow30[i], funding[1].series!.outflow30[i], funding[2].series!.outflow30[i], outflow(i), r1(lcr(i))])),
        p(`LCR fell from ${r1(lcr(0))}% to ${r1(lcr(5))}% as stressed outflows grew by ${r1(((outflow(5) - outflow(0)) / outflow(0)) * 100)}% against ${r1(((liq.series!.hqla[5] - liq.series!.hqla[0]) / liq.series!.hqla[0]) * 100)}% growth in HQLA.`),
      ]),
    ]),
    ev("EVD-BNK-02", S, { title: "Real-estate portfolio quality report (illustrative)", kind: "Report extract", source: "Demonstration credit risk", summary: "Exposure, NPL and watchlist names.", entityIds: credit.map((e) => e.id) }, [
      ver(1, "2026-09-30", "Initial issue.", ["NPL defined at 90 days past due; no collateral revaluation applied."], [
        tbl("Credit portfolios, 30 Sep 2026 (SAR m)", ["Portfolio", "Gross exposure", "Non-performing", "NPL ratio (%)"], credit.map((e) => [e.name, attr(e, "exposure"), attr(e, "npl"), r1((attr(e, "npl") / attr(e, "exposure")) * 100)])),
        p(`Real-estate and construction lending has an NPL ratio of ${r1((attr(re, "npl") / attr(re, "exposure")) * 100)}% against ${r1((sumAttr(credit, "npl") / sumAttr(credit, "exposure")) * 100)}% for the whole book.`),
      ]),
    ]),
    ev("EVD-BNK-03", S, { title: "Payments incident log (illustrative)", kind: "Incident log", source: "Demonstration operations", summary: "Downtime events in the 30-day window.", entityIds: [pay.id] }, [
      ver(1, "2026-09-30", "Initial issue.", ["Planned maintenance is excluded from downtime."], [
        tbl("Unplanned downtime, 30 days to 30 Sep 2026", ["Incident", "Minutes", "Cause"], [["INC-1", 17, "Switch failover delay"], ["INC-2", 12, "Database lock"], ["INC-3", 9, "Network path flap"]]),
        p(`Total downtime ${attr(pay, "downtimeMin")} minutes in a ${attr(pay, "minutes")}-minute window.`),
      ]),
    ]),
    ev("EVD-BNK-04", S, { title: "Treasury funding plan note (illustrative)", kind: "Internal note", source: "Fictional Group Treasury — funding desk", summary: "Planned Q4 funding actions.", entityIds: [liq.id, funding[2].id] }, [
      ver(1, "2026-10-07", "Initial issue.", ["Plan is intent, not executed transactions.", "No pricing or market capacity assessment is attached."], [
        p("Treasury intends to issue a SAR 1,500 m medium-term funding instrument in Q4 2026, which would replace part of the wholesale funding that currently counts as a stressed outflow."),
        p("Treasury also expects corporate deposit balances to remain elevated until year end because of seasonal government-related inflows."),
        p("If both hold, the LCR is expected to stabilise but not recover to 120% without additional HQLA."),
      ]),
    ]),
    ev("EVD-BNK-05", S, { title: "Stress assumptions memo (illustrative)", kind: "Methodology memo", source: "Fictional Risk Methodology team", summary: "Run-off rates behind the liquidity stress.", entityIds: funding.map((e) => e.id) }, [
      ver(1, "2026-09-15", "Initial issue.", ["Run-off rates were last reviewed in 2024.", "Corporate run-off is a single blended rate for all counterparties."], [
        p("Retail deposit run-off is set conservatively; recent behaviour suggests actual retail outflow would be lower than the stress rate."),
        p("Corporate deposit run-off is a blended rate. Large government-related accounts may behave differently from the blend."),
        p("The memo concludes the stress is adequate for the current balance sheet but recommends a review of corporate run-off."),
      ]),
    ]),
  ],
  newSignals: [{
    id: "SIG-BNK-05", sectorId: S, title: "Stress run-off rates not reviewed since 2024", severity: "low",
    summary: "The liquidity stress uses run-off rates last reviewed in 2024, and the corporate rate is a single blended assumption.", detectedAt: "2026-10-11T08:20",
    entityIds: funding.map((e) => e.id), evidenceIds: ["EVD-BNK-05"], caseId: null, assumptions: ["Run-off rates are as documented in the memo."],
  } satisfies Signal],
  investigation: {
    caseId: "CAS-BNK-01", priority: "High", ownerId: "PER-BNK-01", dueDate: "2026-10-28",
    question: "Is the decline in the liquidity coverage ratio structural, and does it justify topping up HQLA now?",
    objectiveIds: ["OBJ-BNK-02"],
    hypotheses: [
      { id: "H1", kind: "primary", statement: "Stressed outflows are growing structurally faster than HQLA, so coverage will keep falling without a top-up.", status: "Open", rationale: `LCR fell in five of six quarters (${r1(lcr(0))}% → ${r1(lcr(5))}%).` },
      { id: "H2", kind: "alternative", statement: "The decline is seasonal and driven by temporary corporate deposit inflows.", status: "Open", rationale: "Treasury expects elevated corporate deposits until year end." },
    ],
    links: [
      { evidenceId: "EVD-BNK-01", version: 1, stance: "supports", hypothesisId: "H1", refs: ["T1R6", "P1"], note: `Outflows grew faster than HQLA; LCR ${r1(lcr(5))}% in Q3 2026.` },
      { evidenceId: "EVD-BNK-04", version: 1, stance: "supports", hypothesisId: "H2", refs: ["P2"], note: "Seasonal corporate inflows expected until year end." },
      { evidenceId: "EVD-BNK-04", version: 1, stance: "context", hypothesisId: "H1", refs: ["P3"], note: "LCR stabilises but does not recover without more HQLA." },
      { evidenceId: "EVD-BNK-05", version: 1, stance: "contradicts", hypothesisId: "H1", refs: ["P1"], note: "Retail run-off in the stress is conservative, so the stress may overstate outflows." },
    ],
    assumptions: ["Quarter-end values represent the trend.", "Stress run-off rates are unchanged from the 2024 review."],
    missing: ["Intra-quarter LCR movement.", "Review of corporate run-off rates."],
    questions: ["Would the planned Q4 funding instrument change the LCR trend materially?"],
    tasks: [
      { title: "Recompute LCR from the treasury ledger", description: "Independently recompute LCR for the last six quarters.", assigneeId: "PER-BNK-06", dueDate: "2026-10-11", status: "Done", evidenceIds: ["EVD-BNK-01"], findings: `Recomputed LCR matches the ledger: ${r1(lcr(0))}% (Q2 25) to ${r1(lcr(5))}% (Q3 26).`, completionNote: "Spreadsheet reconciled to the ledger extract." },
      { title: "Summarise Q4 funding plan effect on outflows", description: "Describe, without modelling, how the planned instrument changes the outflow profile.", assigneeId: "PER-BNK-01", dueDate: "2026-10-15", status: "In progress", evidenceIds: ["EVD-BNK-04"], findings: "", completionNote: "" },
      { title: "Request corporate run-off review from Risk Methodology", description: "Ask for a refreshed corporate run-off assessment.", assigneeId: "PER-BNK-02", dueDate: "2026-10-22", status: "Not started", evidenceIds: ["EVD-BNK-05"], findings: "", completionNote: "" },
    ],
    review: { assigneeId: "PER-BNK-04", scope: "Review whether the LCR trend is structural or seasonal and whether an HQLA top-up is warranted.", requestedAt: "2026-10-11T11:00", dueDate: "2026-10-20" },
    events: [
      { at: "2026-10-10T10:30", actor: "Noura Al-Fahad (Analyst)", type: "created", text: "Opened the case from signals SIG-BNK-01 and SIG-BNK-02." },
      { at: "2026-10-10T14:00", actor: "Noura Al-Fahad (Analyst)", type: "evidence-linked", text: "Linked the liquidity ladder." },
      { at: "2026-10-11T09:10", actor: "Noura Al-Fahad (Analyst)", type: "evidence-linked", text: "Linked funding plan note and stress memo." },
      { at: "2026-10-11T11:00", actor: "Noura Al-Fahad (Analyst)", type: "review-requested", text: "Requested expert review from Dr. Maha Al-Sudairi." },
    ],
  },
  notification: { title: "Expert review requested: Liquidity buffer outlook", body: "Dr. Maha Al-Sudairi is asked to review CAS-BNK-01 by 2026-10-20.", at: "2026-10-11T11:00" },
};
