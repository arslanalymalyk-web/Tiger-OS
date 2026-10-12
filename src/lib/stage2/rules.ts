/** Demonstration permissions and the central case-status state machine. */
import type { Role } from "../types";
import { PEOPLE_BY_ID } from "@/data";
import { SEED_CASES } from "./seed";
import { isBriefStale, latestBrief, activeLinks } from "./brief";
import type { Action, CaseAggregate, CaseStatus, ReviewRequest, ReviewState, WorkState } from "./types";

/** Demonstration behaviour only — NOT production authentication or authorisation. */
const PERMISSIONS: Record<Role, Action[]> = {
  Analyst: ["case.create", "case.edit", "case.transition", "evidence.link", "task.edit", "task.progress", "review.request", "brief.compile", "brief.edit"],
  Expert: ["review.submit", "task.progress"],
  Approver: [],
};
export const can = (role: Role, action: Action) => PERMISSIONS[role].includes(action);
export const ROLE_NOTE: Record<Role, string> = {
  Analyst: "Demonstration role: Analyst can create and edit investigations, assign tasks, request expert review and prepare briefs.",
  Expert: "Demonstration role: Expert can submit review findings on requests and progress tasks assigned to experts and specialists. Other edits are Analyst actions.",
  Approver: "Demonstration role: Approver can read cases, findings and briefs. Approvals cannot be recorded in Stage 2.",
};
export const DEMO_ROLE_DISCLAIMER = "Role switching and restrictions are demonstration behaviour, not production authentication or security.";
export const denied = (role: Role, what: string) => `The ${role} demonstration role cannot ${what}.`;

export function allCases(work: WorkState): CaseAggregate[] {
  const m = { ...SEED_CASES, ...work.cases };
  return Object.values(m).sort((a, b) => a.id.localeCompare(b.id));
}
export const getCase = (work: WorkState, id: string): CaseAggregate | undefined => work.cases[id] ?? SEED_CASES[id];
export const isActive = (c: CaseAggregate) => c.status !== "Closed";
export function activeCasesForSignal(work: WorkState, signalId: string): CaseAggregate[] {
  return allCases(work).filter((c) => isActive(c) && c.signalIds.includes(signalId));
}

export function reviewState(r: ReviewRequest): ReviewState {
  if (r.withdrawnAt) return "Withdrawn";
  const last = r.rounds[r.rounds.length - 1];
  return last.submission ? last.submission.outcome : "Requested";
}
export const openReviews = (c: CaseAggregate) => c.reviews.filter((r) => reviewState(r) === "Requested");
export const reviewedRequests = (c: CaseAggregate) => c.reviews.filter((r) => reviewState(r) === "Reviewed");

export const NEXT_STATUS: Record<CaseStatus, CaseStatus[]> = {
  Draft: ["Investigating", "Closed"],
  Investigating: ["Expert review", "Closed"],
  "Expert review": ["Investigating", "Brief ready"],
  "Brief ready": ["Investigating", "Closed"],
  Closed: ["Investigating"],
};

export interface TransitionCheck { allowed: boolean; reasons: string[]; hint?: string }

/** Central validation of status transitions. Returns every reason a transition is blocked. */
export function checkTransition(c: CaseAggregate, to: CaseStatus, role: Role): TransitionCheck {
  const reasons: string[] = [];
  const from = c.status;
  if (!NEXT_STATUS[from].includes(to)) {
    return { allowed: false, reasons: [`A case cannot move from “${from}” to “${to}”. From “${from}” it can move to: ${NEXT_STATUS[from].join(", ")}.`] };
  }
  if (!can(role, "case.transition")) reasons.push(denied(role, "change a case's status"));
  if (to === "Investigating" && from === "Draft") {
    if (c.question.trim().length < 10) reasons.push("Add an investigation question (at least 10 characters).");
    if (!c.ownerId) reasons.push("Assign an owner.");
    if (!c.dueDate) reasons.push("Set a due date.");
    if (!c.signalIds.length && !c.objectiveIds.length) reasons.push("Link at least one signal or mandate objective so the case is anchored.");
  }
  if (to === "Expert review") {
    reasons.push("Use “Request expert review”: moving to Expert review requires creating a review request for a named expert.");
    if (!c.hypotheses.length) reasons.push("Record at least one hypothesis.");
    if (!activeLinks(c).length) reasons.push("Link at least one piece of evidence.");
  }
  if (to === "Brief ready") {
    if (openReviews(c).length) reasons.push("An expert review is still open. The expert must return “Reviewed” or “Revision requested”.");
    if (!reviewedRequests(c).length) reasons.push("At least one expert review must be returned as “Reviewed”.");
    const b = latestBrief(c);
    if (!b) reasons.push("Compile a decision brief.");
    else if (isBriefStale(c)) reasons.push(`The latest brief (v${b.version}) “Needs refresh”: records changed since it was saved. Compile or edit and save a new version.`);
  }
  if (to === "Closed") {
    if (from === "Brief ready" && isBriefStale(c)) reasons.push("The brief “Needs refresh”. Compile a new version before closing, or return the case to Investigating.");
  }
  const hint = to === "Closed" ? "Closing a case records that the investigation is finished. It does not mean any decision was approved or executed." : undefined;
  return { allowed: reasons.length === 0, reasons, hint };
}

export function personIsExpert(id: string) { return PEOPLE_BY_ID[id]?.kind === "expert"; }
