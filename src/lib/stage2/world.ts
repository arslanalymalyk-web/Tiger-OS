/** Current world = seeded records + local Stage 2 changes. Dashboard counts, search and notifications derive from it. */
import type { Notification, SectorId, Severity, Signal } from "../types";
import { NOTIFICATIONS, SECTOR_BY_ID, SECTOR_IDS, SEVERITY_ORDER, PEOPLE_BY_ID, search as baseSearch, type RecordKind } from "@/data";
import { EVIDENCE_LIST, SIGNAL_LIST, personName } from "./catalog";
import { allCases, isActive, openReviews } from "./rules";
import { isBriefStale } from "./brief";
import type { CaseAggregate, WorkState } from "./types";
import type { AiRun } from "../stage3/types";
import { OPERATION_LABEL, MODE_LABEL } from "../stage3/types";
import { buildContext, staleReasons } from "../stage3/context";

export interface World {
  work: WorkState;
  cases: CaseAggregate[];
  caseById: Map<string, CaseAggregate>;
  signals: Signal[];
  notifications: Notification[];
  /** Stage 3: local assistant runs, newest first, and why each completed run Needs refresh (empty list = current). */
  runs: AiRun[];
  runStale: Map<string, string[]>;
}
export function buildWorld(work: WorkState): World {
  const cases = allCases(work);
  const caseMap = new Map(cases.map((c) => [c.id, c]));
  const runs = Object.values(work.ai.runs).sort((a, b) => b.id.localeCompare(a.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const runStale = new Map<string, string[]>();
  for (const r of runs) {
    if (r.status !== "completed") continue;
    const c = caseMap.get(r.caseId);
    runStale.set(r.id, c ? staleReasons(r.snapshot, buildContext(c)) : ["The case no longer exists."]);
  }
  return {
    work, cases, runs, runStale, caseById: new Map(cases.map((c) => [c.id, c])), signals: SIGNAL_LIST,
    notifications: [...NOTIFICATIONS, ...work.notifications].sort((a, b) => b.at.localeCompare(a.at)),
  };
}
export const casesForSignal = (w: World, signalId: string) => w.cases.filter((c) => c.signalIds.includes(signalId));
export const activeCaseForSignal = (w: World, signalId: string) => casesForSignal(w, signalId).find(isActive);
export const casesForEvidence = (w: World, evidenceId: string) => w.cases.filter((c) => c.links.some((l) => l.evidenceId === evidenceId && !l.unlinkedAt));
export const casesForSector = (w: World, id: SectorId) => w.cases.filter((c) => c.sectorId === id);
export const signalsWithoutActiveCase = (w: World) => w.signals.filter((s) => !activeCaseForSignal(w, s.id));

export function sectorCounts(w: World, id: SectorId) {
  const sd = SECTOR_BY_ID[id];
  const bySev = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, sd.signals.filter((x) => x.severity === s).length])) as Record<Severity, number>;
  const commitments = sd.decisions.filter((d) => d.amountKind === "commitment").reduce((a, d) => a + (d.amountSARm ?? 0), 0);
  const reallocations = sd.decisions.filter((d) => d.amountKind === "reallocation").reduce((a, d) => a + (d.amountSARm ?? 0), 0);
  const cs = casesForSector(w, id);
  return {
    signals: sd.signals.length, bySev, cases: cs.filter(isActive).length, allCases: cs.length, decisions: sd.decisions.length, commitments, reallocations,
    openReviews: cs.reduce((a, c) => a + openReviews(c).length, 0), staleBriefs: cs.filter((c) => isBriefStale(c)).length,
    untriaged: sd.signals.filter((s) => !activeCaseForSignal(w, s.id)).length,
    aiRuns: w.runs.filter((r) => r.sectorId === id).length,
    aiRunning: w.runs.filter((r) => r.sectorId === id && (r.status === "queued" || r.status === "running")).length,
    aiNeedsRefresh: w.runs.filter((r) => r.sectorId === id && (w.runStale.get(r.id)?.length ?? 0) > 0).length,
  };
}
export function groupCounts(w: World) {
  const parts = SECTOR_IDS.map((id) => sectorCounts(w, id));
  const sev = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, parts.reduce((a, p) => a + p.bySev[s], 0)])) as Record<Severity, number>;
  const sum = (k: "signals" | "cases" | "decisions" | "commitments" | "reallocations" | "openReviews" | "staleBriefs" | "untriaged" | "allCases" | "aiRuns" | "aiRunning" | "aiNeedsRefresh") => parts.reduce((a, p) => a + p[k], 0);
  return { signals: sum("signals"), bySev: sev, cases: sum("cases"), allCases: sum("allCases"), decisions: sum("decisions"), commitments: sum("commitments"), reallocations: sum("reallocations"), openReviews: sum("openReviews"), staleBriefs: sum("staleBriefs"), untriaged: sum("untriaged"), aiRuns: sum("aiRuns"), aiRunning: sum("aiRunning"), aiNeedsRefresh: sum("aiNeedsRefresh") };
}

// ------------------------------------------------------------------ search
export type WorldKind = RecordKind | "task" | "hypothesis" | "finding" | "brief" | "run";
export interface WorldHit { id: string; kind: WorldKind; title: string; sectorId: SectorId; snippet: string; score: number; href?: string }
export const WORLD_KIND_LABEL: Record<WorldKind, string> = {
  metric: "Metric", signal: "Signal", case: "Intelligence case", decision: "Decision", entity: "Entity", evidence: "Evidence",
  task: "Task", hypothesis: "Hypothesis", finding: "Expert finding", brief: "Decision brief", run: "Assistant run",
};
const score = (id: string, title: string, text: string, terms: string[]): number | null => {
  const t = text.toLowerCase();
  if (!terms.every((x) => t.includes(x))) return null;
  const tl = title.toLowerCase();
  return terms.reduce((a, x) => a + (id.toLowerCase() === x ? 20 : 0) + (tl.includes(x) ? 5 : 1), 0);
};

export function searchWorld(w: World, query: string, limit = 14): WorldHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: WorldHit[] = [];
  // Stage 1 records except cases and evidence (re-indexed below from current content)
  for (const h of baseSearch(query, 400)) if (h.kind !== "case" && h.kind !== "evidence") hits.push({ ...h });
  for (const c of w.cases) {
    const text = [c.id, c.title, c.question, c.summary, c.status, c.priority, personName(c.ownerId), ...c.hypotheses.map((h) => h.statement)].join(" ");
    const sc = score(c.id, c.title, text, terms);
    if (sc !== null) hits.push({ id: c.id, kind: "case", title: c.title, sectorId: c.sectorId, snippet: `${c.status} · ${c.priority} · ${c.question}`, score: sc + 2 });
    for (const t of c.tasks) { const s2 = score(t.id, t.title, `${t.id} ${t.title} ${t.description} ${t.findings} ${t.completionNote} ${personName(t.assigneeId)}`, terms); if (s2 !== null) hits.push({ id: t.id, kind: "task", title: t.title, sectorId: c.sectorId, snippet: `${t.status} · ${personName(t.assigneeId)}`, score: s2, href: `/cases/${c.id}?tab=tasks&focus=${t.id}` }); }
    for (const h of c.hypotheses) { const s2 = score(h.id, h.statement, `${h.id} ${h.statement} ${h.rationale}`, terms); if (s2 !== null) hits.push({ id: h.id, kind: "hypothesis", title: h.statement, sectorId: c.sectorId, snippet: `${h.kind} · ${h.status}`, score: s2, href: `/cases/${c.id}?tab=evidence&focus=${h.id}` }); }
    for (const r of c.reviews) for (const rd of r.rounds) for (const f of rd.submission?.findings ?? []) { const s2 = score(f.id, f.text, `${f.id} ${f.type} ${f.text}`, terms); if (s2 !== null) hits.push({ id: f.id, kind: "finding", title: f.text, sectorId: c.sectorId, snippet: `${f.type} · ${personName(r.assigneeId)}`, score: s2, href: `/cases/${c.id}?tab=review&focus=${f.id}` }); }
    for (const b of c.briefs) { const s2 = score(b.id, b.content.decisionQuestion, `${b.id} ${b.content.decisionQuestion} ${b.content.nextStep} ${b.content.currentFindings.join(" ")}`, terms); if (s2 !== null) hits.push({ id: b.id, kind: "brief", title: `Brief v${b.version}: ${b.content.decisionQuestion}`, sectorId: c.sectorId, snippet: b.content.nextStep, score: s2, href: `/cases/${c.id}?tab=brief&version=${b.version}` }); }
  }
  for (const r of w.runs) {
    const s2 = score(r.id, `${r.id} ${OPERATION_LABEL[r.operation]}`, `${r.id} ${r.caseId} ${OPERATION_LABEL[r.operation]} ${MODE_LABEL[r.mode]} ${r.status} ${r.question ?? ""} ${r.model ?? ""}`, terms);
    if (s2 !== null) hits.push({ id: r.id, kind: "run", title: `${OPERATION_LABEL[r.operation]} (${r.caseId})`, sectorId: r.sectorId, snippet: `${MODE_LABEL[r.mode]} · ${r.status}`, score: s2, href: `/cases/${r.caseId}?tab=ai&run=${r.id}` });
  }
  for (const e of EVIDENCE_LIST) {
    const body = (e.versions ?? []).flatMap((v) => v.blocks.map((b) => (b.type === "p" ? b.text : `${b.caption} ${b.columns.join(" ")} ${b.rows.flat().join(" ")}`))).join(" ");
    const sc = score(e.id, e.title, `${e.id} ${e.title} ${e.kind} ${e.source} ${e.summary} ${body}`, terms);
    if (sc !== null) hits.push({ id: e.id, kind: "evidence", title: e.title, sectorId: e.sectorId, snippet: e.summary, score: sc });
  }
  void PEOPLE_BY_ID;
  return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}
