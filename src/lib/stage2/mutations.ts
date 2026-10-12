/** Pure mutation layer. Every function validates, returns a new WorkState, and records local demonstration activity. */
import type { Role, SectorId } from "../types";
import { PEOPLE_BY_ID, SECTOR_BY_ID } from "@/data";
import { evidenceRefs, versionOf } from "@/data/stage2/blocks";
import { EVIDENCE_BY_ID, SIGNAL_BY_ID, ENTITY_BY_ID, isReadable, latestVersion, personName, sectorCodeOf } from "./catalog";
import { activeLinks, basisOf, caseNumber, compileBrief as compileTemplate, isBriefStale, latestBrief } from "./brief";
import { activeCasesForSignal, allCases, can, checkTransition, denied, getCase, isActive, openReviews, reviewState } from "./rules";
import {
  CLOSURE_REASONS, FINDING_TYPES, HYP_KINDS, HYP_STATUSES, PRIORITIES, REVIEW_OUTCOMES, STANCES, TASK_STATUSES,
  type BriefContent, type CaseAggregate, type CaseStatus, type Citation, type Ctx, type Finding, type FindingType, type HypKind, type HypStatus, type Priority,
  type Result, type ReviewOutcome, type Stance, type TaskStatus, type WorkState,
} from "./types";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (...errors: string[]): Result<never> => ({ ok: false, errors });
const roleActor = (role: Role) => `${role} (demo role)`;

/** The clock for new local activity: never earlier than the seeded data's reference time. */
export function demoNow(real: Date = new Date()): string {
  const ast = new Date(real.getTime() + 3 * 3600_000).toISOString().slice(0, 16);
  return ast < "2026-10-12T09:00" ? "2026-10-12T09:00" : ast;
}

function guardOpen(c: CaseAggregate): string | null {
  return c.status === "Closed" ? "This case is closed and read-only. Reopen it (return to Investigating) to edit." : null;
}
function addEvent(c: CaseAggregate, ctx: Ctx, type: string, text: string, actor = roleActor(ctx.role)): CaseAggregate {
  const n = c.seq.event + 1;
  return { ...c, seq: { ...c.seq, event: n }, events: [...c.events, { id: `EVT-${sectorCodeOf(c.sectorId)}-${caseNumber(c.id)}-${pad(n, 3)}`, at: ctx.now, actor, type, text }] };
}
function touch(c: CaseAggregate, ctx: Ctx): CaseAggregate { return { ...c, revision: c.revision + 1, updatedAt: ctx.now }; }
function put(work: WorkState, c: CaseAggregate): WorkState { return { ...work, cases: { ...work.cases, [c.id]: c } }; }
function notify(work: WorkState, ctx: Ctx, n: { sectorId: SectorId; title: string; body: string; recordId?: string }): WorkState {
  const k = work.counters.notification + 1;
  return { ...work, counters: { ...work.counters, notification: k }, notifications: [...work.notifications, { id: `NTF-W-${pad(k, 4)}`, at: ctx.now, ...n }] };
}
const ok = <T>(work: WorkState, value: T): Result<T> => ({ ok: true, work, value });

/** Run `fn` against a writable (not closed) case the caller may edit. */
function withCase<T>(work: WorkState, ctx: Ctx, caseId: string, action: Parameters<typeof can>[1], what: string, fn: (c: CaseAggregate) => { c: CaseAggregate; value: T; notify?: { title: string; body: string } } | string[], allowClosed = false): Result<T> {
  if (!can(ctx.role, action)) return fail(denied(ctx.role, what));
  const c = getCase(work, caseId);
  if (!c) return fail(`Case ${caseId} was not found.`);
  if (!allowClosed) { const g = guardOpen(c); if (g) return fail(g); }
  const r = fn(c);
  if (Array.isArray(r)) return fail(...r);
  let next = put(work, touch(r.c, ctx));
  if (r.notify) next = notify(next, ctx, { sectorId: c.sectorId, title: r.notify.title, body: r.notify.body, recordId: c.id });
  return ok(next, r.value);
}

// ---------------------------------------------------------------- creation
export interface CreateCaseInput {
  sectorId: SectorId; title: string; question: string; summary: string; ownerId: string; priority: Priority; dueDate: string;
  signalIds: string[]; entityIds: string[]; objectiveIds: string[];
}
export function validateCaseFields(i: { title: string; dueDate: string; priority: string; ownerId: string; sectorId: SectorId }): string[] {
  const e: string[] = [];
  if (i.title.trim().length < 5) e.push("Title must be at least 5 characters.");
  if (!DATE.test(i.dueDate)) e.push("Due date must be a valid date (YYYY-MM-DD).");
  if (!PRIORITIES.includes(i.priority as Priority)) e.push("Choose a priority.");
  const p = PEOPLE_BY_ID[i.ownerId];
  if (!p || p.sectorId !== i.sectorId || p.kind !== "analyst") e.push("Choose an owner from this sector's analysts.");
  return e;
}
export function createCase(work: WorkState, ctx: Ctx, i: CreateCaseInput): Result<{ caseId: string }> {
  if (!can(ctx.role, "case.create")) return fail(denied(ctx.role, "create cases"));
  const errors = validateCaseFields(i);
  for (const sid of i.signalIds) {
    const s = SIGNAL_BY_ID[sid];
    if (!s) errors.push(`Signal ${sid} was not found.`);
    else if (s.sectorId !== i.sectorId) errors.push(`Signal ${sid} belongs to a different sector.`);
  }
  for (const sid of i.signalIds) {
    const dup = activeCasesForSignal(work, sid)[0];
    if (dup) return { ok: false, errors: [`Signal ${sid} already has an active case: ${dup.id} “${dup.title}” (${dup.status}).`], code: "DUPLICATE_ACTIVE_CASE", caseId: dup.id };
  }
  if (errors.length) return fail(...errors);
  const used = Math.max(0, ...allCases(work).filter((c) => c.sectorId === i.sectorId).map((c) => Number(caseNumber(c.id))), work.counters.case[i.sectorId] ?? 0);
  const n = used + 1;
  const code = sectorCodeOf(i.sectorId);
  const id = `CAS-${code}-${pad(n)}`;
  const c: CaseAggregate = {
    id, sectorId: i.sectorId, origin: "created", title: i.title.trim(), question: i.question.trim(), summary: i.summary.trim(), status: "Draft", priority: i.priority,
    ownerId: i.ownerId, dueDate: i.dueDate, signalIds: [...i.signalIds], entityIds: [...i.entityIds], objectiveIds: [...i.objectiveIds], decisionIds: [],
    hypotheses: [], links: [], assumptions: [], missing: [], questions: [], tasks: [], reviews: [], briefs: [], events: [], revision: 0, createdAt: ctx.now, updatedAt: ctx.now,
    seq: { hyp: 0, link: 0, task: 0, note: 0, review: 0, finding: 0, event: 0 },
  };
  const withEvt = addEvent(c, ctx, "created", i.signalIds.length ? `Case created from ${i.signalIds.join(", ")}.` : "Case created (standalone).");
  let next: WorkState = { ...put(work, withEvt), counters: { ...work.counters, case: { ...work.counters.case, [i.sectorId]: n } } };
  next = notify(next, ctx, { sectorId: i.sectorId, title: `Case created: ${c.title}`, body: `${id} is in Draft, owned by ${personName(i.ownerId)}.`, recordId: id });
  return ok(next, { caseId: id });
}

// ---------------------------------------------------------------- case fields
export type CasePatch = Partial<Pick<CaseAggregate, "title" | "question" | "summary" | "priority" | "ownerId" | "dueDate" | "entityIds" | "objectiveIds">>;
export function updateCase(work: WorkState, ctx: Ctx, caseId: string, patch: CasePatch): Result<{ changed: string[] }> {
  return withCase(work, ctx, caseId, "case.edit", "edit cases", (c) => {
    const merged = { ...c, ...patch };
    const errors = validateCaseFields(merged);
    if (patch.entityIds?.some((id) => ENTITY_BY_ID[id]?.sectorId !== c.sectorId)) errors.push("Entities must belong to the case's sector.");
    if (errors.length) return errors;
    const changed = (Object.keys(patch) as (keyof CasePatch)[]).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(c[k]));
    if (!changed.length) return ["No changes to save."];
    const trimmed = { ...merged, title: merged.title.trim(), question: merged.question.trim(), summary: merged.summary.trim() };
    return { c: addEvent(trimmed, ctx, "case-updated", `Updated ${changed.join(", ")}.`), value: { changed } };
  });
}
export function linkSignal(work: WorkState, ctx: Ctx, caseId: string, signalId: string): Result<null> {
  return withCase(work, ctx, caseId, "case.edit", "edit cases", (c) => {
    const s = SIGNAL_BY_ID[signalId];
    if (!s) return [`Signal ${signalId} was not found.`];
    if (s.sectorId !== c.sectorId) return ["The signal belongs to a different sector."];
    if (c.signalIds.includes(signalId)) return ["This signal is already linked to the case."];
    const dup = activeCasesForSignal(work, signalId).find((x) => x.id !== c.id);
    if (dup) return [`Signal ${signalId} already has an active case: ${dup.id}.`];
    return { c: addEvent({ ...c, signalIds: [...c.signalIds, signalId] }, ctx, "signal-linked", `Linked signal ${signalId}.`), value: null };
  });
}
export function unlinkSignal(work: WorkState, ctx: Ctx, caseId: string, signalId: string): Result<null> {
  return withCase(work, ctx, caseId, "case.edit", "edit cases", (c) => {
    if (!c.signalIds.includes(signalId)) return ["This signal is not linked to the case."];
    return { c: addEvent({ ...c, signalIds: c.signalIds.filter((x) => x !== signalId) }, ctx, "signal-unlinked", `Unlinked signal ${signalId}.`), value: null };
  });
}

// ---------------------------------------------------------------- hypotheses and notes
export interface HypInput { kind: HypKind; statement: string; status: HypStatus; rationale: string }
function validateHyp(i: HypInput): string[] {
  const e: string[] = [];
  if (i.statement.trim().length < 10) e.push("Hypothesis statement must be at least 10 characters.");
  if (!HYP_KINDS.includes(i.kind)) e.push("Choose whether this is a primary hypothesis or an alternative explanation.");
  if (!HYP_STATUSES.includes(i.status)) e.push("Choose a hypothesis status.");
  return e;
}
export function addHypothesis(work: WorkState, ctx: Ctx, caseId: string, i: HypInput): Result<{ id: string }> {
  return withCase(work, ctx, caseId, "case.edit", "edit cases", (c) => {
    const e = validateHyp(i); if (e.length) return e;
    const n = c.seq.hyp + 1;
    const id = `HYP-${sectorCodeOf(c.sectorId)}-${caseNumber(c.id)}-${pad(n)}`;
    const next = { ...c, seq: { ...c.seq, hyp: n }, hypotheses: [...c.hypotheses, { id, kind: i.kind, statement: i.statement.trim(), status: i.status, rationale: i.rationale.trim(), rev: 1, createdAt: ctx.now, updatedAt: ctx.now }] };
    return { c: addEvent(next, ctx, "hypothesis-added", `Added ${i.kind} hypothesis ${id}.`), value: { id } };
  });
}
export function updateHypothesis(work: WorkState, ctx: Ctx, caseId: string, id: string, i: HypInput): Result<null> {
  return withCase(work, ctx, caseId, "case.edit", "edit cases", (c) => {
    const h = c.hypotheses.find((x) => x.id === id);
    if (!h) return [`Hypothesis ${id} was not found.`];
    const e = validateHyp(i); if (e.length) return e;
    if (h.kind === i.kind && h.statement === i.statement.trim() && h.status === i.status && h.rationale === i.rationale.trim()) return ["No changes to save."];
    const next = { ...c, hypotheses: c.hypotheses.map((x) => (x.id === id ? { ...x, ...i, statement: i.statement.trim(), rationale: i.rationale.trim(), rev: x.rev + 1, updatedAt: ctx.now } : x)) };
    return { c: addEvent(next, ctx, "hypothesis-edited", `Edited hypothesis ${id} (revision ${h.rev + 1}).`), value: null };
  });
}
export type NoteKind = "assumption" | "missing" | "question";
const NOTE_FIELD = { assumption: "assumptions", missing: "missing", question: "questions" } as const;
export function addNote(work: WorkState, ctx: Ctx, caseId: string, kind: NoteKind, text: string): Result<null> {
  return withCase(work, ctx, caseId, "case.edit", "edit cases", (c) => {
    if (text.trim().length < 5) return ["Enter at least 5 characters."];
    const n = c.seq.note + 1;
    const note = { id: `NTE-${sectorCodeOf(c.sectorId)}-${caseNumber(c.id)}-${pad(n)}`, text: text.trim(), resolved: false, createdAt: ctx.now };
    const f = NOTE_FIELD[kind];
    return { c: addEvent({ ...c, seq: { ...c.seq, note: n }, [f]: [...c[f], note] }, ctx, "note-added", `Added ${kind === "missing" ? "missing information" : kind === "question" ? "an open question" : "an assumption"}.`), value: null };
  });
}
export function updateNote(work: WorkState, ctx: Ctx, caseId: string, kind: NoteKind, id: string, patch: { text?: string; resolved?: boolean; remove?: boolean }): Result<null> {
  return withCase(work, ctx, caseId, "case.edit", "edit cases", (c) => {
    const f = NOTE_FIELD[kind];
    const n = c[f].find((x) => x.id === id);
    if (!n) return ["That note was not found."];
    if (patch.remove) return { c: addEvent({ ...c, [f]: c[f].filter((x) => x.id !== id) }, ctx, "note-removed", `Removed note ${id}.`), value: null };
    if (patch.text !== undefined && patch.text.trim().length < 5) return ["Enter at least 5 characters."];
    const next = { ...c, [f]: c[f].map((x) => (x.id === id ? { ...x, text: patch.text?.trim() ?? x.text, resolved: patch.resolved ?? x.resolved } : x)) };
    return { c: addEvent(next, ctx, "note-updated", `${patch.resolved !== undefined ? (patch.resolved ? "Resolved" : "Reopened") : "Edited"} note ${id}.`), value: null };
  });
}

// ---------------------------------------------------------------- evidence links
export interface LinkInput { evidenceId: string; version?: number; stance: Stance; hypothesisId: string | null; refs: string[]; note: string }
export function linkEvidence(work: WorkState, ctx: Ctx, caseId: string, i: LinkInput): Result<{ id: string }> {
  return withCase(work, ctx, caseId, "evidence.link", "link evidence", (c) => {
    const ev = EVIDENCE_BY_ID[i.evidenceId];
    if (!ev) return [`Evidence ${i.evidenceId} was not found.`];
    if (!isReadable(i.evidenceId)) return ["This evidence has no readable content in the demonstration and cannot be linked."];
    if (ev.sectorId !== c.sectorId) return ["Evidence must belong to the same sector as the case."];
    if (!STANCES.includes(i.stance)) return ["Choose whether the evidence supports, contradicts or provides context."];
    if (i.stance !== "context" && !i.hypothesisId) return ["Choose the hypothesis this evidence supports or contradicts."];
    if (i.hypothesisId && !c.hypotheses.some((h) => h.id === i.hypothesisId)) return ["The chosen hypothesis does not exist on this case."];
    const version = i.version ?? latestVersion(i.evidenceId);
    const v = versionOf(ev, version);
    if (!v) return [`Version ${version} of ${i.evidenceId} does not exist.`];
    const valid = new Set(evidenceRefs(v).map((r) => r.ref));
    const badRef = i.refs.filter((r) => !valid.has(r));
    if (badRef.length) return [`Unknown reference(s) in ${i.evidenceId} v${version}: ${badRef.join(", ")}.`];
    if (activeLinks(c).some((l) => l.evidenceId === i.evidenceId && l.hypothesisId === (i.hypothesisId ?? null))) return [i.hypothesisId ? `${i.evidenceId} is already linked to this hypothesis.` : `${i.evidenceId} is already linked as general context.`];
    const n = c.seq.link + 1;
    const id = `LNK-${sectorCodeOf(c.sectorId)}-${caseNumber(c.id)}-${pad(n)}`;
    const link = { id, evidenceId: i.evidenceId, version, stance: i.stance, hypothesisId: i.hypothesisId, note: i.note.trim(), refs: i.refs, linkedAt: ctx.now, linkedBy: roleActor(ctx.role), history: [{ at: ctx.now, from: null, to: i.stance, by: roleActor(ctx.role) }] };
    return { c: addEvent({ ...c, seq: { ...c.seq, link: n }, links: [...c.links, link] }, ctx, "evidence-linked", `Linked ${i.evidenceId} v${version} as ${i.stance}${i.hypothesisId ? ` for ${i.hypothesisId}` : ""}.`), value: { id } };
  });
}
export function changeStance(work: WorkState, ctx: Ctx, caseId: string, linkId: string, stance: Stance, note?: string): Result<null> {
  return withCase(work, ctx, caseId, "evidence.link", "change evidence links", (c) => {
    const l = c.links.find((x) => x.id === linkId && !x.unlinkedAt);
    if (!l) return ["That evidence link was not found."];
    if (!STANCES.includes(stance)) return ["Choose a stance."];
    if (l.stance === stance) return ["The link already has that stance."];
    if (stance !== "context" && !l.hypothesisId) return ["Attach the link to a hypothesis before marking it as supporting or contradicting."];
    const next = { ...c, links: c.links.map((x) => (x.id === linkId ? { ...x, stance, note: note?.trim() || x.note, history: [...x.history, { at: ctx.now, from: x.stance, to: stance, by: roleActor(ctx.role) }] } : x)) };
    return { c: addEvent(next, ctx, "stance-changed", `Changed ${l.evidenceId} from “${l.stance}” to “${stance}”.`), value: null };
  });
}
export function unlinkEvidence(work: WorkState, ctx: Ctx, caseId: string, linkId: string): Result<null> {
  return withCase(work, ctx, caseId, "evidence.link", "unlink evidence", (c) => {
    const l = c.links.find((x) => x.id === linkId && !x.unlinkedAt);
    if (!l) return ["That evidence link was not found."];
    const next = { ...c, links: c.links.map((x) => (x.id === linkId ? { ...x, unlinkedAt: ctx.now, unlinkedBy: roleActor(ctx.role) } : x)) };
    return { c: addEvent(next, ctx, "evidence-unlinked", `Unlinked ${l.evidenceId} v${l.version} (history retained).`), value: null };
  });
}
export function adoptEvidenceVersion(work: WorkState, ctx: Ctx, caseId: string, linkId: string): Result<null> {
  return withCase(work, ctx, caseId, "evidence.link", "change evidence links", (c) => {
    const l = c.links.find((x) => x.id === linkId && !x.unlinkedAt);
    if (!l) return ["That evidence link was not found."];
    const latest = latestVersion(l.evidenceId);
    if (latest <= l.version) return ["This link already uses the latest version."];
    const valid = new Set(evidenceRefs(versionOf(EVIDENCE_BY_ID[l.evidenceId], latest)!).map((r) => r.ref));
    const refs = l.refs.filter((r) => valid.has(r));
    const next = { ...c, links: c.links.map((x) => (x.id === linkId ? { ...x, version: latest, refs } : x)) };
    return { c: addEvent(next, ctx, "evidence-version-adopted", `Moved ${l.evidenceId} from v${l.version} to v${latest}.`), value: null };
  });
}

// ---------------------------------------------------------------- tasks
export interface TaskInput { title: string; description: string; assigneeId: string; dueDate: string; evidenceIds: string[] }
function validateTask(c: CaseAggregate, i: TaskInput): string[] {
  const e: string[] = [];
  if (i.title.trim().length < 5) e.push("Task title must be at least 5 characters.");
  const p = PEOPLE_BY_ID[i.assigneeId];
  if (!p || p.sectorId !== c.sectorId) e.push("Choose a named assignee from this sector.");
  if (!DATE.test(i.dueDate)) e.push("Due date must be a valid date (YYYY-MM-DD).");
  for (const id of i.evidenceIds) if (!EVIDENCE_BY_ID[id] || EVIDENCE_BY_ID[id].sectorId !== c.sectorId) e.push(`Evidence ${id} is not available for this case.`);
  return e;
}
export function addTask(work: WorkState, ctx: Ctx, caseId: string, i: TaskInput): Result<{ id: string }> {
  return withCase(work, ctx, caseId, "task.edit", "assign tasks", (c) => {
    const e = validateTask(c, i); if (e.length) return e;
    const n = c.seq.task + 1;
    const id = `TSK-${sectorCodeOf(c.sectorId)}-${caseNumber(c.id)}-${pad(n)}`;
    const task = { id, title: i.title.trim(), description: i.description.trim(), assigneeId: i.assigneeId, dueDate: i.dueDate, status: "Not started" as TaskStatus, evidenceIds: i.evidenceIds, findings: "", completionNote: "", createdAt: ctx.now };
    return { c: addEvent({ ...c, seq: { ...c.seq, task: n }, tasks: [...c.tasks, task] }, ctx, "task-created", `Assigned ${id} to ${personName(i.assigneeId)}.`), value: { id } };
  });
}
export function updateTask(work: WorkState, ctx: Ctx, caseId: string, taskId: string, i: TaskInput): Result<null> {
  return withCase(work, ctx, caseId, "task.edit", "edit tasks", (c) => {
    const t = c.tasks.find((x) => x.id === taskId);
    if (!t) return [`Task ${taskId} was not found.`];
    const e = validateTask(c, i); if (e.length) return e;
    return { c: addEvent({ ...c, tasks: c.tasks.map((x) => (x.id === taskId ? { ...x, ...i, title: i.title.trim(), description: i.description.trim() } : x)) }, ctx, "task-updated", `Edited task ${taskId}.`), value: null };
  });
}
export function setTaskStatus(work: WorkState, ctx: Ctx, caseId: string, taskId: string, status: TaskStatus, detail: { findings?: string; completionNote?: string } = {}): Result<null> {
  const c0 = getCase(work, caseId);
  const t0 = c0?.tasks.find((x) => x.id === taskId);
  const assignee = t0 ? PEOPLE_BY_ID[t0.assigneeId] : undefined;
  if (ctx.role === "Expert" && assignee?.kind === "analyst") return fail(`The Expert demonstration role can progress tasks assigned to experts and specialists, not to analysts (${assignee.name}).`);
  return withCase(work, ctx, caseId, "task.progress", "progress tasks", (c) => {
    const t = c.tasks.find((x) => x.id === taskId);
    if (!t) return [`Task ${taskId} was not found.`];
    if (!TASK_STATUSES.includes(status)) return ["Choose a task status."];
    const findings = (detail.findings ?? t.findings).trim(), completionNote = (detail.completionNote ?? t.completionNote).trim();
    if (status === "Done") {
      const e: string[] = [];
      if (findings.length < 10) e.push("Record the task's findings (at least 10 characters) before completing it.");
      if (completionNote.length < 5) e.push("Add a completion note (at least 5 characters).");
      if (e.length) return e;
    }
    if (t.status === status && detail.findings === undefined && detail.completionNote === undefined) return ["The task already has that status."];
    const next = { ...c, tasks: c.tasks.map((x) => (x.id === taskId ? { ...x, status, findings, completionNote, completedAt: status === "Done" ? ctx.now : undefined } : x)) };
    return { c: addEvent(next, ctx, status === "Done" ? "task-done" : "task-status", `Task ${taskId}: ${t.status} → ${status}.`), value: null, notify: status === "Done" ? { title: `Task completed: ${t.title}`, body: `${taskId} on ${c.id} was marked Done.` } : undefined };
  });
}

// ---------------------------------------------------------------- expert review
export function requestReview(work: WorkState, ctx: Ctx, caseId: string, i: { assigneeId: string; scope: string; dueDate: string }): Result<{ requestId: string; round: number }> {
  return withCase(work, ctx, caseId, "review.request", "request expert review", (c) => {
    const e: string[] = [];
    if (c.status !== "Investigating") e.push(c.status === "Expert review" ? "An expert review is already in progress for this case." : `Expert review can only be requested while the case is Investigating (it is ${c.status}).`);
    if (c.question.trim().length < 10) e.push("Add an investigation question before requesting review.");
    if (!c.hypotheses.length) e.push("Record at least one hypothesis before requesting review.");
    if (!activeLinks(c).length) e.push("Link at least one piece of evidence before requesting review.");
    const p = PEOPLE_BY_ID[i.assigneeId];
    if (!p || p.sectorId !== c.sectorId || p.kind !== "expert") e.push("Choose a named expert from this sector.");
    if (i.scope.trim().length < 15) e.push("Describe what the expert should review (at least 15 characters).");
    if (!DATE.test(i.dueDate)) e.push("Due date must be a valid date (YYYY-MM-DD).");
    if (openReviews(c).length) e.push("There is already an open review request.");
    if (e.length) return e;
    const prior = c.reviews.find((r) => r.assigneeId === i.assigneeId && reviewState(r) === "Revision requested");
    const round = { requestedAt: ctx.now, requestedBy: c.ownerId, scope: i.scope.trim(), dueDate: i.dueDate };
    let requestId: string, roundNo: number, reviews;
    if (prior) {
      roundNo = prior.rounds.length + 1; requestId = prior.id;
      reviews = c.reviews.map((r) => (r.id === prior.id ? { ...r, rounds: [...r.rounds, { round: roundNo, ...round }] } : r));
    } else {
      const n = c.seq.review + 1; roundNo = 1;
      requestId = `REV-${sectorCodeOf(c.sectorId)}-${caseNumber(c.id)}-${pad(n)}`;
      reviews = [...c.reviews, { id: requestId, assigneeId: i.assigneeId, rounds: [{ round: 1, ...round }] }];
      c = { ...c, seq: { ...c.seq, review: n } };
    }
    let next: CaseAggregate = { ...c, reviews, status: "Expert review" };
    next = addEvent(next, ctx, "review-requested", `Requested expert review ${requestId} round ${roundNo} from ${personName(i.assigneeId)}.`);
    next = addEvent(next, ctx, "status-changed", "Status changed from Investigating to Expert review.");
    return { c: next, value: { requestId, round: roundNo }, notify: { title: `Expert review requested: ${c.title}`, body: `${personName(i.assigneeId)} is asked to review ${c.id} by ${i.dueDate}.` } };
  });
}
export function withdrawReview(work: WorkState, ctx: Ctx, caseId: string, requestId: string): Result<null> {
  return withCase(work, ctx, caseId, "review.request", "withdraw review requests", (c) => {
    const r = c.reviews.find((x) => x.id === requestId);
    if (!r || reviewState(r) !== "Requested") return ["Only an open review request can be withdrawn."];
    let next: CaseAggregate = { ...c, reviews: c.reviews.map((x) => (x.id === requestId ? { ...x, withdrawnAt: ctx.now } : x)) };
    next = addEvent(next, ctx, "review-withdrawn", `Withdrew review request ${requestId}.`);
    if (!openReviews(next).length && next.status === "Expert review") { next = { ...next, status: "Investigating" }; next = addEvent(next, ctx, "status-changed", "Status changed from Expert review to Investigating."); }
    return { c: next, value: null };
  });
}

export interface FindingInput { type: FindingType; text: string; citations: Citation[] }
export function validateFindings(c: CaseAggregate, findings: FindingInput[]): string[] {
  const e: string[] = [];
  if (!findings.length) e.push("Add at least one finding before completing the review.");
  const links = activeLinks(c);
  findings.forEach((f, idx) => {
    const n = idx + 1;
    if (!FINDING_TYPES.includes(f.type)) e.push(`Finding ${n}: choose a type.`);
    if (f.text.trim().length < 10) e.push(`Finding ${n}: write at least 10 characters.`);
    if (!f.citations.length) e.push(`Finding ${n}: cite at least one evidence reference.`);
    for (const ct of f.citations) {
      const linked = links.some((l) => l.evidenceId === ct.evidenceId && l.version === ct.version);
      const ev = EVIDENCE_BY_ID[ct.evidenceId];
      const v = ev ? versionOf(ev, ct.version) : undefined;
      if (!linked) e.push(`Finding ${n}: ${ct.evidenceId} v${ct.version} is not linked to this case.`);
      else if (!v || !evidenceRefs(v).some((r) => r.ref === ct.ref)) e.push(`Finding ${n}: ${ct.evidenceId} v${ct.version} has no reference ${ct.ref}.`);
    }
  });
  return e;
}
export function submitReview(work: WorkState, ctx: Ctx, caseId: string, i: { requestId: string; outcome: ReviewOutcome; note: string; findings: FindingInput[] }): Result<{ outcome: ReviewOutcome; findingIds: string[] }> {
  return withCase(work, ctx, caseId, "review.submit", "submit review findings", (c) => {
    const r = c.reviews.find((x) => x.id === i.requestId);
    if (!r) return [`Review request ${i.requestId} was not found.`];
    if (reviewState(r) !== "Requested") return ["This review request is not open."];
    const e: string[] = [];
    if (!REVIEW_OUTCOMES.includes(i.outcome)) e.push("Choose “Reviewed” or “Revision requested”.");
    if (i.outcome === "Revision requested" && i.note.trim().length < 10) e.push("Explain what must be revised (at least 10 characters).");
    e.push(...validateFindings(c, i.findings));
    if (e.length) return e;
    let seq = c.seq.finding;
    const code = `${sectorCodeOf(c.sectorId)}-${caseNumber(c.id)}`;
    const findings: Finding[] = i.findings.map((f) => ({ id: `FND-${code}-${pad(++seq)}`, type: f.type, text: f.text.trim(), citations: f.citations }));
    const last = r.rounds[r.rounds.length - 1];
    const submission = { id: `RVS-${code}-${pad(c.reviews.indexOf(r) + 1)}-${last.round}`, submittedAt: ctx.now, submittedBy: r.assigneeId, outcome: i.outcome, note: i.note.trim(), findings };
    let next: CaseAggregate = { ...c, seq: { ...c.seq, finding: seq }, reviews: c.reviews.map((x) => (x.id === r.id ? { ...x, rounds: x.rounds.map((rd) => (rd.round === last.round ? { ...rd, submission } : rd)) } : x)) };
    const actor = `${personName(r.assigneeId)} (Expert, demo role)`;
    next = addEvent(next, ctx, "review-submitted", `Returned “${i.outcome}” with ${findings.length} finding(s) on ${r.id} round ${last.round}. “Reviewed” does not mean approved.`, actor);
    if (i.outcome === "Revision requested") { next = { ...next, status: "Investigating" }; next = addEvent(next, ctx, "status-changed", "Status changed from Expert review to Investigating (revision requested).", actor); }
    return { c: next, value: { outcome: i.outcome, findingIds: findings.map((f) => f.id) }, notify: { title: `${i.outcome === "Reviewed" ? "Review returned" : "Revision requested"}: ${c.title}`, body: `${personName(r.assigneeId)} returned “${i.outcome}” on ${c.id}. This is not an approval.` } };
  });
}

// ---------------------------------------------------------------- brief
export function compileBriefMut(work: WorkState, ctx: Ctx, caseId: string): Result<{ version: number }> {
  return withCase(work, ctx, caseId, "brief.compile", "compile briefs", (c) => {
    if (c.status === "Draft") return ["Move the case to Investigating before compiling a brief."];
    const cur = latestBrief(c);
    if (cur && !isBriefStale(c)) return [`Brief v${cur.version} already reflects the current records. Change the case (evidence, hypotheses or findings) or edit the brief to save a new version.`];
    const b = compileTemplate(c, { now: ctx.now, createdBy: roleActor(ctx.role), note: "Compiled from current case records (deterministic template; no AI generation)." });
    return { c: addEvent({ ...c, briefs: [...c.briefs, b] }, ctx, "brief-compiled", `Compiled brief v${b.version} from current case records.`), value: { version: b.version }, notify: { title: `Brief v${b.version} compiled: ${c.title}`, body: `${c.id} has a new decision-brief version (not an approval).` } };
  });
}
export function validateBrief(b: BriefContent): string[] {
  const e: string[] = [];
  if (b.decisionQuestion.trim().length < 10) e.push("Decision question must be at least 10 characters.");
  if (!b.nextStep.trim()) e.push("Suggested next step is required.");
  if (!b.accountableOwner.trim()) e.push("Accountable owner is required.");
  const labels = b.options.map((o) => o.label.toLowerCase());
  if (!labels.some((l) => l.includes("monitor"))) e.push("Response options must include monitoring.");
  if (!labels.some((l) => l.includes("no action"))) e.push("Response options must include taking no action.");
  if (b.options.some((o) => !o.label.trim() || !o.description.trim())) e.push("Every response option needs a label and a description.");
  return e;
}
export function editBrief(work: WorkState, ctx: Ctx, caseId: string, content: BriefContent, note: string): Result<{ version: number }> {
  return withCase(work, ctx, caseId, "brief.edit", "edit briefs", (c) => {
    const cur = latestBrief(c);
    if (!cur) return ["Compile a brief first, then edit it."];
    const e = validateBrief(content); if (e.length) return e;
    if (JSON.stringify(content) === JSON.stringify(cur.content)) return ["No changes to save."];
    const version = cur.version + 1;
    const b = { id: `BRF-${sectorCodeOf(c.sectorId)}-${caseNumber(c.id)}-v${version}`, version, createdAt: ctx.now, createdBy: roleActor(ctx.role), source: "edited" as const, note: note.trim() || "Edited by analyst.", content, basis: cur.basis };
    return { c: addEvent({ ...c, briefs: [...c.briefs, b] }, ctx, "brief-edited", `Saved edited brief v${version}.`), value: { version } };
  });
}

// ---------------------------------------------------------------- status
export function transitionCase(work: WorkState, ctx: Ctx, caseId: string, to: CaseStatus, closure?: { reason: string; note: string }): Result<{ from: CaseStatus; to: CaseStatus }> {
  const c = getCase(work, caseId);
  if (!c) return fail(`Case ${caseId} was not found.`);
  const chk = checkTransition(c, to, ctx.role);
  const errors = [...chk.reasons];
  if (to === "Closed") {
    if (!closure || !(CLOSURE_REASONS as readonly string[]).includes(closure.reason)) errors.push("Choose a closure reason.");
    if (!closure || closure.note.trim().length < 10) errors.push("Add a closure note (at least 10 characters).");
  }
  if (errors.length) return fail(...errors);
  let next: CaseAggregate = { ...c, status: to };
  if (to === "Closed") next = { ...next, closure: { at: ctx.now, by: roleActor(ctx.role), reason: closure!.reason, note: closure!.note.trim() } };
  if (c.status === "Closed") next = { ...next, closure: undefined };
  next = addEvent(next, ctx, "status-changed", `Status changed from ${c.status} to ${to}.${to === "Closed" ? " Closing does not record that any decision was approved or executed." : ""}`);
  if (c.status === "Expert review" && to === "Investigating") {
    const open = openReviews(c);
    next = { ...next, reviews: next.reviews.map((r) => (open.some((o) => o.id === r.id) ? { ...r, withdrawnAt: ctx.now } : r)) };
    for (const r of open) next = addEvent(next, ctx, "review-withdrawn", `Withdrew review request ${r.id}.`);
  }
  let out = put(work, touch(next, ctx));
  out = notify(out, ctx, { sectorId: c.sectorId, title: `${c.id} is now ${to}`, body: `${c.title}: ${c.status} → ${to}.`, recordId: c.id });
  return ok(out, { from: c.status, to });
}

export { isActive, basisOf, SECTOR_BY_ID };
