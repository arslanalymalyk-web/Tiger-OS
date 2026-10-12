/** Stage 3 model: bounded, user-triggered analytical assistance with validated, human-reviewed output. */
import type { Role, SectorId } from "../types";
import type { Citation, FindingType, HypKind, HypStatus, Stance, TaskStatus } from "../stage2/types";

export const PROMPT_VERSION = "tigeris-assist-v1";

export const AI_OPERATIONS = ["summarize", "conflicts", "tasks", "brief", "question"] as const;
export type AiOperation = (typeof AI_OPERATIONS)[number];
export const OPERATION_LABEL: Record<AiOperation, string> = {
  summarize: "Summarize this investigation",
  conflicts: "Identify conflicting evidence and missing information",
  tasks: "Suggest next investigation tasks",
  brief: "Draft a decision brief",
  question: "Answer a question about this case",
};

export type AssistantId = "summarizer" | "evidence-analyst" | "task-planner" | "brief-drafter";
export interface Assistant {
  id: AssistantId; name: string; operations: AiOperation[]; responsibility: string; produces: string; cannot: string;
}
export const ASSISTANTS: Assistant[] = [
  { id: "summarizer", name: "Case summarizer", operations: ["summarize"], responsibility: "Condenses one case — question, hypotheses, linked evidence, tasks and recorded expert findings — into a cited summary.", produces: "Source-supported findings, labelled inferences, missing information.", cannot: "Add facts that are not in the supplied case scope." },
  { id: "evidence-analyst", name: "Evidence and contradiction analyst", operations: ["conflicts", "question"], responsibility: "Finds passages in the supplied evidence that disagree, gaps the evidence leaves open, and answers questions strictly from the supplied evidence.", produces: "Contradictions with two or more citations, missing information, cited answers or an insufficient-evidence statement.", cannot: "Resolve a contradiction by itself, or answer from outside the supplied scope." },
  { id: "task-planner", name: "Investigation task planner", operations: ["tasks"], responsibility: "Proposes next investigation tasks for human analysts, each with a rationale.", produces: "Proposed tasks the Analyst can edit, accept or discard.", cannot: "Create tasks itself, assign work to real people or send any message." },
  { id: "brief-drafter", name: "Decision-brief drafting assistant", operations: ["brief"], responsibility: "Drafts the narrative fields of a decision brief from the case record and cited evidence.", produces: "A proposed brief the Analyst can edit, accept as a new version or discard.", cannot: "Calculate financial impact, record approvals or alter expert findings." },
];
export const ASSISTANT_BY_OP: Record<AiOperation, Assistant> = Object.fromEntries(ASSISTANTS.flatMap((a) => a.operations.map((o) => [o, a]))) as Record<AiOperation, Assistant>;

/** ai = a real model call; deterministic = rule-based demonstration output (not AI); mock-provider = automated-test fixture standing in for a provider. */
export type OutputMode = "ai" | "deterministic" | "mock-provider";
export const MODE_LABEL: Record<OutputMode, string> = {
  ai: "AI-generated",
  deterministic: "Deterministic demonstration (not AI)",
  "mock-provider": "Mocked provider (automated-test fixture, not AI)",
};
export const RUN_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const ERROR_CODES = [
  "not_configured", "rate_limited", "provider_error", "provider_auth", "timeout", "invalid_response", "refused", "input_too_large",
  "duplicate_in_flight", "interrupted", "network", "bad_request",
] as const;
export type AiErrorCode = (typeof ERROR_CODES)[number];
export interface AiError { code: AiErrorCode; message: string; retryAfterSeconds?: number }

// ------------------------------------------------------------------ scope
/** Everything the assistant may see for one case. Nothing outside it is retrieved. */
export interface CaseContext {
  caseId: string; sectorId: SectorId; title: string; question: string; summary: string;
  hypotheses: { id: string; kind: HypKind; status: HypStatus; statement: string; rationale: string }[];
  links: { id: string; evidenceId: string; version: number; stance: Stance; hypothesisId: string | null; note: string; refs: string[] }[];
  tasks: { id: string; title: string; status: TaskStatus; assigneeId: string; findings: string; completionNote: string }[];
  findings: { id: string; type: FindingType; text: string; citations: Citation[]; by: string; outcome: string }[];
  notes: { id: string; kind: "assumption" | "missing" | "question"; text: string; resolved: boolean }[];
  ownerId: string;
}
export interface ScopeBlock { ref: string; kind: "paragraph" | "row"; text: string }
export interface ScopeEvidence { evidenceId: string; version: number; title: string; source: string; sourceDate: string; limitations: string[]; blocks: ScopeBlock[]; stances: Stance[] }
export interface Scope {
  caseId: string; evidence: ScopeEvidence[];
  recordIds: { hypotheses: string[]; tasks: string[]; findings: string[]; notes: string[] };
  evidenceChars: number; contextChars: number; totalChars: number; tooLarge: boolean; problems: string[]; fingerprint: string;
  /** numeric tokens that appear in the case-record part of the scope (used to reject invented figures) */
  contextNumbers: string[];
}
/** Compact, persisted record of what a run was based on. Used for the fingerprint and for "Needs refresh" reasons. */
export interface Snapshot {
  fingerprint: string; chars: number;
  evidence: { evidenceId: string; version: number; refCount: number }[];
  links: { id: string; evidenceId: string; version: number; stance: Stance; hypothesisId: string | null; h: string }[];
  hypotheses: { id: string; h: string }[]; tasks: { id: string; h: string }[]; findings: string[]; notes: { id: string; h: string }[];
  caseText: string; contextNumbers: string[];
}

// ------------------------------------------------------------------ output
export interface VCitation { evidenceId: string; version: number; ref: string; quote: string }
export interface Claim { id: string; text: string; citations: VCitation[]; records: string[]; basis?: string }
export interface Rejected { section: string; text: string; reasons: string[] }
export interface Provenance { by: string; at: string; role: Role }
export type Disposition = "pending" | "accepted" | "discarded";
export interface TaskProposal {
  id: string; title: string; description: string; assigneeId: string; dueDate: string; rationale: string; citations: VCitation[];
  status: Disposition; edited: boolean; decidedAt?: string; decidedRole?: Role; createdTaskId?: string;
}
export interface BriefProposalContent { decisionQuestion: string; findings: Claim[]; uncertainties: string[]; nextStep: string }
export interface BriefProposal {
  id: string; content: BriefProposalContent; status: Disposition; edited: boolean; decidedAt?: string; decidedRole?: Role; createdBriefVersion?: number;
}
export interface AssistOutput {
  sourceSupported: Claim[]; inferences: Claim[]; contradictions: Claim[];
  missing: { id: string; text: string }[]; nextSteps: { id: string; text: string }[];
  taskProposals: TaskProposal[]; briefProposal?: BriefProposal;
  insufficient?: string; rejected: Rejected[]; warnings: string[];
}
export const emptyOutput = (): AssistOutput => ({ sourceSupported: [], inferences: [], contradictions: [], missing: [], nextSteps: [], taskProposals: [], rejected: [], warnings: [] });

export interface AiRun {
  id: string; // RUN-<SEC>-nn
  caseId: string; sectorId: SectorId; operation: AiOperation; assistantId: AssistantId; question?: string;
  mode: OutputMode; role: Role; status: RunStatus;
  createdAt: string; startedAt?: string; finishedAt?: string; durationMs?: number;
  provider?: string; model?: string; promptVersion?: string; usage?: { inputTokens: number; outputTokens: number };
  snapshot: Snapshot; output?: AssistOutput; error?: AiError; note?: string;
}
export interface AiState { runs: Record<string, AiRun>; counters: Partial<Record<SectorId, number>> }
export const emptyAi = (): AiState => ({ runs: {}, counters: {} });

// ------------------------------------------------------------------ server API
export interface AssistRequest { operation: AiOperation; question?: string; context: CaseContext; mockScenario?: string }
export interface ProviderStatus {
  configured: boolean; provider: "anthropic" | "test-mock" | null; model: string | null; mock: boolean;
  timeoutMs: number; maxInputChars: number; reason?: string; missing?: string[];
}
export type AssistResponse =
  | { ok: true; raw: unknown; meta: { provider: string; model: string; promptVersion: string; usage?: { inputTokens: number; outputTokens: number }; durationMs: number; mode: OutputMode; warnings: string[] } }
  | { ok: false; error: AiError };

export const LIMITS = {
  maxInputChars: 60_000, maxQuestionChars: 500, maxRawChars: 40_000, maxOutputTokens: 4000, defaultTimeoutMs: 45_000,
  maxClaims: 12, maxMissing: 8, maxNextSteps: 8, maxTasks: 6, maxClaimChars: 600, maxCitationsPerClaim: 4, maxLinks: 40,
} as const;
