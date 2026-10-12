/** Pure mutation layer for Stage 3 runs and proposals. Generated content never modifies a case until an Analyst accepts it. */
import { PEOPLE_BY_ID } from "@/data";
import { addTask } from "../stage2/mutations";
import { validateBrief } from "../stage2/mutations";
import { basisOf, caseNumber, compileBrief, latestBrief } from "../stage2/brief";
import { sectorCodeOf } from "../stage2/catalog";
import { can, denied, getCase } from "../stage2/rules";
import type { AiOrigin, CaseAggregate, Ctx, Result, WorkState } from "../stage2/types";
import { buildContext, scopeOf, snapshotOf, staleReasons } from "./context";
import {
  ASSISTANT_BY_OP, LIMITS, OPERATION_LABEL, type AiError, type AiOperation, type AiRun, type AssistOutput, type BriefProposal, type OutputMode, type TaskProposal,
} from "./types";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const fail = (...errors: string[]): Result<never> => ({ ok: false, errors });
const ok = <T>(work: WorkState, value: T): Result<T> => ({ ok: true, work, value });
const actor = (ctx: Ctx) => `${ctx.role} (demo role)`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function putRun(work: WorkState, run: AiRun): WorkState { return { ...work, ai: { ...work.ai, runs: { ...work.ai.runs, [run.id]: run } } }; }
function putCase(work: WorkState, c: CaseAggregate): WorkState { return { ...work, cases: { ...work.cases, [c.id]: c } }; }
function withEvent(work: WorkState, ctx: Ctx, caseId: string, type: string, text: string): WorkState {
  const c = getCase(work, caseId);
  if (!c) return work;
  const n = c.seq.event + 1;
  return putCase(work, { ...c, seq: { ...c.seq, event: n }, events: [...c.events, { id: `EVT-${sectorCodeOf(c.sectorId)}-${caseNumber(c.id)}-${pad(n, 3)}`, at: ctx.now, actor: actor(ctx), type, text }] });
}
function notify(work: WorkState, ctx: Ctx, run: AiRun, title: string, body: string): WorkState {
  const k = work.counters.notification + 1;
  return { ...work, counters: { ...work.counters, notification: k }, notifications: [...work.notifications, { id: `NTF-W-${pad(k, 4)}`, at: ctx.now, sectorId: run.sectorId, title, body, recordId: run.caseId }] };
}
const modeWord = (m: OutputMode) => (m === "ai" ? "AI-generated" : m === "deterministic" ? "deterministic demonstration" : "mocked-provider test");

export const ACTIVE_STATUSES = ["queued", "running"] as const;
export const isActiveRun = (r: AiRun) => r.status === "queued" || r.status === "running";
export const runsForCase = (work: WorkState, caseId: string) => Object.values(work.ai.runs).filter((r) => r.caseId === caseId).sort((a, b) => b.id.localeCompare(a.id));
export const staleFor = (run: AiRun, c: CaseAggregate | undefined): string[] => (c ? staleReasons(run.snapshot, buildContext(c)) : ["The case no longer exists."]);

export interface RunInput { caseId: string; operation: AiOperation; question?: string; mode: OutputMode }
export function createRun(work: WorkState, ctx: Ctx, i: RunInput): Result<{ runId: string }> {
  if (!can(ctx.role, "ai.run")) return fail(denied(ctx.role, "start assistant runs"));
  const c = getCase(work, i.caseId);
  if (!c) return fail(`Case ${i.caseId} was not found.`);
  const q = (i.question ?? "").trim();
  if (i.operation === "question") {
    if (q.length < 5) return fail("Enter a question of at least 5 characters.");
    if (q.length > LIMITS.maxQuestionChars) return fail(`The question is longer than ${LIMITS.maxQuestionChars} characters.`);
  }
  const x = buildContext(c), scope = scopeOf(x);
  if (scope.problems.length) return fail(...scope.problems);
  const dup = runsForCase(work, i.caseId).find((r) => isActiveRun(r) && r.operation === i.operation && (r.question ?? "") === (i.operation === "question" ? q : ""));
  if (dup) return { ok: false, errors: [`A run for “${OPERATION_LABEL[i.operation]}” is already in progress (${dup.id}). Wait for it to finish or cancel it.`], code: "DUPLICATE_ACTIVE_RUN", caseId: dup.id };
  const code = sectorCodeOf(c.sectorId);
  const n = (work.ai.counters[c.sectorId] ?? 0) + 1;
  const run: AiRun = {
    id: `RUN-${code}-${pad(n)}`, caseId: c.id, sectorId: c.sectorId, operation: i.operation, assistantId: ASSISTANT_BY_OP[i.operation].id,
    question: i.operation === "question" ? q : undefined, mode: i.mode, role: ctx.role, status: "queued", createdAt: ctx.now, snapshot: snapshotOf(x, scope),
  };
  return ok({ ...putRun(work, run), ai: { runs: { ...work.ai.runs, [run.id]: run }, counters: { ...work.ai.counters, [c.sectorId]: n } } }, { runId: run.id });
}

export function markRunning(work: WorkState, ctx: Ctx, runId: string): Result<null> {
  const r = work.ai.runs[runId];
  if (!r) return fail(`Run ${runId} was not found.`);
  if (r.status !== "queued") return fail(`Run ${runId} is ${r.status}, not queued.`);
  return ok(putRun(work, { ...r, status: "running", startedAt: ctx.now }), null);
}

export interface RunMeta { provider?: string; model?: string; promptVersion?: string; usage?: { inputTokens: number; outputTokens: number }; durationMs?: number }
export function completeRun(work: WorkState, ctx: Ctx, runId: string, output: AssistOutput, meta: RunMeta = {}): Result<{ stale: boolean }> {
  const r = work.ai.runs[runId];
  if (!r) return fail(`Run ${runId} was not found.`);
  if (r.status !== "running") return { ok: false, errors: [`Run ${runId} is ${r.status}; a late result was discarded.`], code: "NOT_RUNNING" };
  const done: AiRun = { ...r, status: "completed", finishedAt: ctx.now, output, ...meta };
  let next = putRun(work, done);
  const stale = staleFor(done, getCase(work, r.caseId)).length > 0;
  next = withEvent(next, ctx, r.caseId, "ai-run-completed", `${r.id} (${modeWord(r.mode)}, ${OPERATION_LABEL[r.operation]}) completed${stale ? "; inputs changed while it ran, so it Needs refresh" : ""}.`);
  next = notify(next, ctx, done, `Assistant run completed: ${r.id}`, `${OPERATION_LABEL[r.operation]} for ${r.caseId} (${modeWord(r.mode)}). Review it before using it.`);
  return ok(next, { stale });
}

export function failRun(work: WorkState, ctx: Ctx, runId: string, error: AiError, meta: RunMeta = {}): Result<null> {
  const r = work.ai.runs[runId];
  if (!r) return fail(`Run ${runId} was not found.`);
  if (r.status !== "running" && r.status !== "queued") return { ok: false, errors: [`Run ${runId} is ${r.status}.`], code: "NOT_RUNNING" };
  const done: AiRun = { ...r, status: "failed", finishedAt: ctx.now, error, ...meta };
  let next = putRun(work, done);
  next = withEvent(next, ctx, r.caseId, "ai-run-failed", `${r.id} (${modeWord(r.mode)}) failed: ${error.message}`);
  next = notify(next, ctx, done, `Assistant run failed: ${r.id}`, `${OPERATION_LABEL[r.operation]} for ${r.caseId} did not complete. Nothing was changed.`);
  return ok(next, null);
}

export function cancelRun(work: WorkState, ctx: Ctx, runId: string): Result<null> {
  if (!can(ctx.role, "ai.run")) return fail(denied(ctx.role, "cancel assistant runs"));
  const r = work.ai.runs[runId];
  if (!r) return fail(`Run ${runId} was not found.`);
  if (!isActiveRun(r)) return fail(`Run ${runId} is already ${r.status}.`);
  const note = r.mode === "deterministic" ? "Cancelled before completion." : "Cancelled locally. This does not guarantee the provider stopped processing; any late result is discarded and nothing is saved from it.";
  const done: AiRun = { ...r, status: "cancelled", finishedAt: ctx.now, note };
  return ok(withEvent(putRun(work, done), ctx, r.caseId, "ai-run-cancelled", `${r.id} was cancelled.`), null);
}

// ---------------------------------------------------------------- proposals
function getRunProposals(work: WorkState, runId: string): { run: AiRun; out: AssistOutput } | string {
  const run = work.ai.runs[runId];
  if (!run) return `Run ${runId} was not found.`;
  if (run.status !== "completed" || !run.output) return `Run ${runId} has no completed output.`;
  return { run, out: run.output };
}
function guardReview(work: WorkState, ctx: Ctx, run: AiRun, what: string): string[] {
  if (!can(ctx.role, "ai.review")) return [denied(ctx.role, what)];
  const c = getCase(work, run.caseId);
  if (!c) return [`Case ${run.caseId} was not found.`];
  if (c.status === "Closed") return ["This case is closed and read-only. Reopen it (return to Investigating) first."];
  return [];
}
const setTaskProposal = (work: WorkState, run: AiRun, out: AssistOutput, id: string, fn: (p: TaskProposal) => TaskProposal): WorkState =>
  putRun(work, { ...run, output: { ...out, taskProposals: out.taskProposals.map((p) => (p.id === id ? fn(p) : p)) } });
const setBriefProposal = (work: WorkState, run: AiRun, out: AssistOutput, fn: (p: BriefProposal) => BriefProposal): WorkState =>
  putRun(work, { ...run, output: { ...out, briefProposal: out.briefProposal ? fn(out.briefProposal) : undefined } });

export interface TaskPatch { title: string; description: string; assigneeId: string; dueDate: string }
function validateTaskPatch(c: CaseAggregate, p: TaskPatch): string[] {
  const e: string[] = [];
  if (p.title.trim().length < 5) e.push("Task title must be at least 5 characters.");
  if (p.title.trim().length > 120) e.push("Task title must be at most 120 characters.");
  const person = PEOPLE_BY_ID[p.assigneeId];
  if (!person || person.sectorId !== c.sectorId) e.push("Choose a named assignee from this sector.");
  if (!DATE.test(p.dueDate)) e.push("Due date must be a valid date (YYYY-MM-DD).");
  return e;
}
export function editTaskProposal(work: WorkState, ctx: Ctx, runId: string, propId: string, patch: TaskPatch): Result<null> {
  const g = getRunProposals(work, runId); if (typeof g === "string") return fail(g);
  const p = g.out.taskProposals.find((x) => x.id === propId);
  if (!p) return fail(`Proposal ${propId} was not found.`);
  const gr = guardReview(work, ctx, g.run, "edit assistant proposals"); if (gr.length) return fail(...gr);
  if (p.status !== "pending") return fail(`This proposal was already ${p.status}.`);
  const e = validateTaskPatch(getCase(work, g.run.caseId)!, patch); if (e.length) return fail(...e);
  return ok(setTaskProposal(work, g.run, g.out, propId, (x) => ({ ...x, ...patch, title: patch.title.trim(), description: patch.description.trim(), edited: true })), null);
}

export function acceptTaskProposal(work: WorkState, ctx: Ctx, runId: string, propId: string): Result<{ taskId: string }> {
  const g = getRunProposals(work, runId); if (typeof g === "string") return fail(g);
  const p = g.out.taskProposals.find((x) => x.id === propId);
  if (!p) return fail(`Proposal ${propId} was not found.`);
  const gr = guardReview(work, ctx, g.run, "accept assistant proposals"); if (gr.length) return fail(...gr);
  if (p.status !== "pending") return fail(`This proposal was already ${p.status}.`);
  const c = getCase(work, g.run.caseId)!;
  const reasons = staleFor(g.run, c);
  if (reasons.length) return { ok: false, code: "STALE_RUN", errors: [`This run Needs refresh, so its proposals cannot be accepted: ${reasons.join(" ")} Run the assistant again.`] };
  const r = addTask(work, ctx, c.id, { title: p.title, description: p.description, assigneeId: p.assigneeId, dueDate: p.dueDate, evidenceIds: [...new Set(p.citations.map((x) => x.evidenceId))] });
  if (!r.ok) return r;
  const origin: AiOrigin = { kind: "assistant-proposal", runId, mode: g.run.mode, provider: g.run.provider, model: g.run.model, edited: p.edited, acceptedAt: ctx.now };
  let next = r.work;
  const c2 = getCase(next, c.id)!;
  next = putCase(next, { ...c2, tasks: c2.tasks.map((t) => (t.id === r.value.id ? { ...t, origin } : t)) });
  const run2 = next.ai.runs[runId]!;
  next = setTaskProposal(next, run2, run2.output!, propId, (x) => ({ ...x, status: "accepted", decidedAt: ctx.now, decidedRole: ctx.role, createdTaskId: r.value.id }));
  next = withEvent(next, ctx, c.id, "ai-proposal-accepted", `Accepted ${runId} proposal “${p.title}” as ${r.value.id}${p.edited ? " (edited by the Analyst)" : ""}.`);
  // The case changed because of this acceptance; re-baseline this run so its other proposals stay reviewable.
  const cNow = getCase(next, c.id)!, xNow = buildContext(cNow);
  const run3 = next.ai.runs[runId]!;
  next = putRun(next, { ...run3, snapshot: snapshotOf(xNow, scopeOf(xNow)) });
  return ok(next, { taskId: r.value.id });
}

export function discardProposal(work: WorkState, ctx: Ctx, runId: string, propId: string): Result<null> {
  const g = getRunProposals(work, runId); if (typeof g === "string") return fail(g);
  const gr = guardReview(work, ctx, g.run, "discard assistant proposals"); if (gr.length) return fail(...gr);
  const t = g.out.taskProposals.find((x) => x.id === propId);
  const b = g.out.briefProposal && g.out.briefProposal.id === propId ? g.out.briefProposal : undefined;
  if (!t && !b) return fail(`Proposal ${propId} was not found.`);
  if ((t ?? b)!.status !== "pending") return fail(`This proposal was already ${(t ?? b)!.status}.`);
  const next = t ? setTaskProposal(work, g.run, g.out, propId, (x) => ({ ...x, status: "discarded", decidedAt: ctx.now, decidedRole: ctx.role })) : setBriefProposal(work, g.run, g.out, (x) => ({ ...x, status: "discarded", decidedAt: ctx.now, decidedRole: ctx.role }));
  return ok(withEvent(next, ctx, g.run.caseId, "ai-proposal-discarded", `Discarded ${runId} proposal “${t ? t.title : "decision brief draft"}”. The case was not changed.`), null);
}

export interface BriefPatch { decisionQuestion: string; findings: { id: string; text: string }[]; uncertainties: string[]; nextStep: string }
export function editBriefProposal(work: WorkState, ctx: Ctx, runId: string, patch: BriefPatch): Result<null> {
  const g = getRunProposals(work, runId); if (typeof g === "string") return fail(g);
  const b = g.out.briefProposal;
  if (!b) return fail("This run has no brief proposal.");
  const gr = guardReview(work, ctx, g.run, "edit assistant proposals"); if (gr.length) return fail(...gr);
  if (b.status !== "pending") return fail(`This proposal was already ${b.status}.`);
  const e: string[] = [];
  if (patch.decisionQuestion.trim().length < 10) e.push("Decision question must be at least 10 characters.");
  if (!patch.nextStep.trim()) e.push("Suggested next step is required.");
  const keep = patch.findings.filter((f) => f.text.trim());
  if (!keep.length) e.push("Keep at least one finding.");
  if (e.length) return fail(...e);
  const findings = keep.map((f) => { const o = b.content.findings.find((x) => x.id === f.id); return o ? { ...o, text: f.text.trim() } : null; }).filter(Boolean) as BriefProposal["content"]["findings"];
  return ok(setBriefProposal(work, g.run, g.out, (x) => ({ ...x, edited: true, content: { decisionQuestion: patch.decisionQuestion.trim(), findings, uncertainties: patch.uncertainties.map((u) => u.trim()).filter(Boolean), nextStep: patch.nextStep.trim() } })), null);
}

export const citationLabel = (c: { evidenceId: string; version: number; ref: string }) => `${c.evidenceId} v${c.version} ${c.ref}`;

export function acceptBriefProposal(work: WorkState, ctx: Ctx, runId: string): Result<{ version: number }> {
  const g = getRunProposals(work, runId); if (typeof g === "string") return fail(g);
  const b = g.out.briefProposal;
  if (!b) return fail("This run has no brief proposal.");
  const gr = guardReview(work, ctx, g.run, "accept assistant proposals"); if (gr.length) return fail(...gr);
  if (b.status !== "pending") return fail(`This proposal was already ${b.status}.`);
  const c = getCase(work, g.run.caseId)!;
  if (c.status === "Draft") return fail("Move the case to Investigating before accepting a brief draft.");
  const reasons = staleFor(g.run, c);
  if (reasons.length) return { ok: false, code: "STALE_RUN", errors: [`This run Needs refresh, so its brief draft cannot be accepted: ${reasons.join(" ")} Run the assistant again.`] };
  const version = (latestBrief(c)?.version ?? 0) + 1;
  const base = compileBrief(c, { now: ctx.now, createdBy: actor(ctx), note: "" });
  const aiFindings = b.content.findings.map((f) => `${f.text} [${f.citations.map(citationLabel).join("; ")}]`);
  const content = {
    ...base.content, decisionQuestion: b.content.decisionQuestion,
    currentFindings: [...aiFindings, ...base.content.currentFindings],
    uncertainties: [...new Set([...b.content.uncertainties, ...base.content.uncertainties])],
    nextStep: b.content.nextStep,
  };
  const e = validateBrief(content); if (e.length) return fail(...e);
  const origin: AiOrigin = { kind: "assistant-proposal", runId, mode: g.run.mode, provider: g.run.provider, model: g.run.model, edited: b.edited, acceptedAt: ctx.now };
  const brief = {
    id: `BRF-${sectorCodeOf(c.sectorId)}-${caseNumber(c.id)}-v${version}`, version, createdAt: ctx.now, createdBy: actor(ctx), source: "assistant-draft" as const, origin,
    note: `Accepted from ${runId} (${modeWord(g.run.mode)}${b.edited ? ", edited by the Analyst" : ""}). Financial impact is not calculated.`, content, basis: basisOf(c),
  };
  let next = putCase(work, { ...c, briefs: [...c.briefs, brief], revision: c.revision + 1, updatedAt: ctx.now });
  next = setBriefProposal(next, next.ai.runs[runId]!, next.ai.runs[runId]!.output!, (x) => ({ ...x, status: "accepted", decidedAt: ctx.now, decidedRole: ctx.role, createdBriefVersion: version }));
  next = withEvent(next, ctx, c.id, "ai-proposal-accepted", `Accepted ${runId} brief draft as brief v${version}${b.edited ? " (edited by the Analyst)" : ""}.`);
  return ok(next, { version });
}

/** Disposition summary for a run, derived from its proposals. */
export function dispositionOf(run: AiRun): "not-applicable" | "pending" | "accepted" | "partially-accepted" | "discarded" {
  const o = run.output;
  if (!o) return "not-applicable";
  const all = [...o.taskProposals.map((p) => p.status), ...(o.briefProposal ? [o.briefProposal.status] : [])];
  if (!all.length) return "not-applicable";
  const acc = all.filter((s) => s === "accepted").length, dis = all.filter((s) => s === "discarded").length;
  if (acc === all.length) return "accepted";
  if (acc > 0) return "partially-accepted";
  if (dis === all.length) return "discarded";
  return "pending";
}
