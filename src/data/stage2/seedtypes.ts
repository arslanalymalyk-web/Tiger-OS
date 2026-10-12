import type { Evidence, SectorId, Signal } from "@/lib/types";
import type { HypKind, HypStatus, Objective, Person, Priority, Stance, TaskStatus, FindingType } from "@/lib/stage2/types";

export interface SeedHypothesis { id: string; kind: HypKind; statement: string; status: HypStatus; rationale: string }
export interface SeedLink { evidenceId: string; version: number; stance: Stance; hypothesisId: string | null; refs: string[]; note: string }
export interface SeedTask { title: string; description: string; assigneeId: string; dueDate: string; status: TaskStatus; evidenceIds: string[]; findings: string; completionNote: string }
export interface SeedEvent { at: string; actor: string; type: string; text: string }
export interface InvestigationSeed {
  caseId: string; question: string; objectiveIds: string[]; priority: Priority; ownerId: string; dueDate: string;
  hypotheses: SeedHypothesis[]; links: SeedLink[]; assumptions: string[]; missing: string[]; questions: string[];
  tasks: SeedTask[];
  review: { assigneeId: string; scope: string; requestedAt: string; dueDate: string };
  events: SeedEvent[];
}
export interface S2Content {
  people: Person[]; objectives: Objective[]; evidence: Evidence[]; newSignals: Signal[]; investigation: InvestigationSeed;
  notification: { title: string; body: string; at: string };
}
export type S2ContentMap = Record<SectorId, S2Content>;
export type { FindingType };
