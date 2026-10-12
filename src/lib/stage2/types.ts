/** Stage 2 model: investigation workspace aggregates, reviews and decision briefs. All records are fictional/local. */
import type { Role, SectorId } from "../types";

export const CASE_STATUSES = ["Draft", "Investigating", "Expert review", "Brief ready", "Closed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const STANCES = ["supports", "contradicts", "context"] as const;
export type Stance = (typeof STANCES)[number];
export const TASK_STATUSES = ["Not started", "In progress", "Blocked", "Done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const HYP_KINDS = ["primary", "alternative"] as const;
export type HypKind = (typeof HYP_KINDS)[number];
export const HYP_STATUSES = ["Open", "Supported", "Contradicted", "Inconclusive"] as const;
export type HypStatus = (typeof HYP_STATUSES)[number];
export const FINDING_TYPES = ["Finding", "Caveat", "Disagreement"] as const;
export type FindingType = (typeof FINDING_TYPES)[number];
export const REVIEW_OUTCOMES = ["Reviewed", "Revision requested"] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];
export const CLOSURE_REASONS = [
  "Brief delivered — decision still pending (no approval recorded)",
  "No action required",
  "Withdrawn",
  "Superseded by another case",
] as const;

export interface Person {
  id: string; // PER-<SEC>-nn
  sectorId: SectorId;
  name: string;
  title: string; // specialist role
  kind: "analyst" | "expert" | "specialist";
}
export interface Objective { id: string; sectorId: SectorId; text: string }

export interface Note { id: string; text: string; resolved: boolean; createdAt: string }
export interface Hypothesis {
  id: string; kind: HypKind; statement: string; status: HypStatus; rationale: string;
  rev: number; createdAt: string; updatedAt: string;
}
export interface StanceChange { at: string; from: Stance | null; to: Stance; by: string }
export interface EvidenceLink {
  id: string; evidenceId: string; version: number; stance: Stance; hypothesisId: string | null;
  note: string; refs: string[]; linkedAt: string; linkedBy: string;
  unlinkedAt?: string; unlinkedBy?: string; history: StanceChange[];
}
export interface Task {
  id: string; title: string; description: string; assigneeId: string; dueDate: string; status: TaskStatus;
  evidenceIds: string[]; findings: string; completionNote: string; createdAt: string; completedAt?: string;
}
export interface Citation { evidenceId: string; version: number; ref: string }
export interface Finding { id: string; type: FindingType; text: string; citations: Citation[] }
export interface ReviewSubmission {
  id: string; submittedAt: string; submittedBy: string; outcome: ReviewOutcome; note: string; findings: Finding[];
}
export interface ReviewRound { round: number; requestedAt: string; requestedBy: string; scope: string; dueDate: string; submission?: ReviewSubmission }
export interface ReviewRequest { id: string; assigneeId: string; rounds: ReviewRound[]; withdrawnAt?: string }
export type ReviewState = "Requested" | "Reviewed" | "Revision requested" | "Withdrawn";

export interface BriefEvidenceRef { linkId: string; evidenceId: string; version: number; refs: string[]; note: string; hypothesisId: string | null }
export interface BriefOption { label: string; description: string }
export interface BriefFinding { findingId: string; type: FindingType; text: string; citations: Citation[]; by: string; round: number; outcome: ReviewOutcome }
export interface BriefContent {
  decisionQuestion: string;
  mandateAlignment: string;
  currentFindings: string[];
  affectedEntities: string[];
  supportingEvidence: BriefEvidenceRef[];
  contradictoryEvidence: BriefEvidenceRef[];
  contextEvidence: BriefEvidenceRef[];
  assumptions: string[];
  uncertainties: string[];
  options: BriefOption[];
  expertFindings: BriefFinding[];
  nextStep: string;
  accountableOwner: string;
  financialImpactNote: string;
}
/** What the brief was built from. Used to detect "Needs refresh". */
export interface BriefBasis {
  links: { evidenceId: string; version: number; stance: Stance; hypothesisId: string | null }[];
  hypotheses: { id: string; rev: number }[];
  findings: string[];
  reviews: { requestId: string; round: number; outcome: ReviewOutcome | "Pending" }[];
}
export interface BriefVersion {
  id: string; version: number; createdAt: string; createdBy: string; source: "compiled" | "edited";
  note: string; content: BriefContent; basis: BriefBasis;
}
export interface CaseEvent { id: string; at: string; actor: string; type: string; text: string }
export interface Closure { at: string; by: string; reason: string; note: string }

export interface CaseAggregate {
  id: string; // CAS-<SEC>-nn
  sectorId: SectorId;
  origin: "seed" | "created";
  title: string; question: string; summary: string;
  status: CaseStatus; priority: Priority; ownerId: string; dueDate: string;
  signalIds: string[]; entityIds: string[]; objectiveIds: string[]; decisionIds: string[];
  hypotheses: Hypothesis[]; links: EvidenceLink[];
  assumptions: Note[]; missing: Note[]; questions: Note[];
  tasks: Task[]; reviews: ReviewRequest[]; briefs: BriefVersion[]; events: CaseEvent[];
  closure?: Closure;
  revision: number; createdAt: string; updatedAt: string;
  seq: { hyp: number; link: number; task: number; note: number; review: number; finding: number; event: number };
}

export interface StoredNotification { id: string; sectorId: SectorId; at: string; title: string; body: string; recordId?: string }
export interface WorkState {
  /** Copy-on-write overrides of seeded cases plus cases created in Stage 2, keyed by case ID. */
  cases: Record<string, CaseAggregate>;
  notifications: StoredNotification[];
  counters: { case: Partial<Record<SectorId, number>>; notification: number };
}
export const emptyWork = (): WorkState => ({ cases: {}, notifications: [], counters: { case: {}, notification: 0 } });

export type Action =
  | "case.create" | "case.edit" | "case.transition" | "evidence.link" | "task.edit" | "task.progress"
  | "review.request" | "review.submit" | "brief.compile" | "brief.edit";
export interface Ctx { role: Role; now: string }
export type Result<T = unknown> = { ok: true; work: WorkState; value: T } | { ok: false; errors: string[]; code?: string; caseId?: string };
