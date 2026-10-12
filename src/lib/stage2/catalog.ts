/** Static lookups over the seeded records (Stage 1 + Stage 2 content). */
import type { Decision, Entity, Evidence, Signal } from "../types";
import { OBJECTIVE_BY_ID, PEOPLE_BY_ID, SECTOR_BY_ID, SEEDS } from "@/data";
import { evidenceRefs, versionOf, type EvidenceRef } from "@/data/stage2/blocks";
import type { SectorId } from "../types";

export const EVIDENCE_LIST: Evidence[] = SEEDS.flatMap((s) => s.evidence);
export const EVIDENCE_BY_ID: Record<string, Evidence> = Object.fromEntries(EVIDENCE_LIST.map((e) => [e.id, e]));
export const SIGNAL_LIST: Signal[] = SEEDS.flatMap((s) => s.signals);
export const SIGNAL_BY_ID: Record<string, Signal> = Object.fromEntries(SIGNAL_LIST.map((s) => [s.id, s]));
export const DECISION_BY_ID: Record<string, Decision> = Object.fromEntries(SEEDS.flatMap((s) => s.decisions).map((d) => [d.id, d]));
export const ENTITY_BY_ID: Record<string, Entity> = Object.fromEntries(SEEDS.flatMap((s) => s.entities).map((e) => [e.id, e]));

export const sectorCodeOf = (id: SectorId) => SECTOR_BY_ID[id].sector.code;
export const personName = (id: string | undefined) => (id ? PEOPLE_BY_ID[id]?.name ?? id : "—");
export const personLabel = (id: string | undefined) => (id && PEOPLE_BY_ID[id] ? `${PEOPLE_BY_ID[id].name} (${PEOPLE_BY_ID[id].title})` : id ?? "—");
export const objectiveText = (id: string) => OBJECTIVE_BY_ID[id]?.text ?? id;

export function latestVersion(evidenceId: string): number {
  const e = EVIDENCE_BY_ID[evidenceId];
  return e?.versions?.[e.versions.length - 1]?.version ?? 0;
}
export function refsFor(evidenceId: string, version: number): EvidenceRef[] {
  const e = EVIDENCE_BY_ID[evidenceId];
  const v = e ? versionOf(e, version) : undefined;
  return v ? evidenceRefs(v) : [];
}
export const isReadable = (evidenceId: string) => !!EVIDENCE_BY_ID[evidenceId]?.versions?.length;
