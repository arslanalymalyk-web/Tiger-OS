import { z } from "zod";
import { AppError, forbidden, notFound, type Actor } from "./actor";
import { audit } from "./audit";
import { sha256 } from "./crypto";
import { clock, withTx, type Db } from "./db";
import { flushOutbox } from "./mail";
import { isMetric, metricSql, nowSql } from "./metrics";
import { notify, recipientsFor, type CaseRef } from "./notify";
import { can, type Permission } from "./rbac";
import { visibleCases } from "./scope";
import { blobStore, sniffMime } from "./storage";
import { maxUploadBytes } from "./env";

export const STATUSES = ["new", "assigned", "in_progress", "pending_review", "info_requested", "awaiting_customer", "customer_query", "approved", "rejected", "deferred", "work_completed", "closed"] as const;
export type Status = (typeof STATUSES)[number];
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const CASE_TYPES = ["corrective", "preventive", "inspection"] as const;

export type CaseRow = {
  id: string; company_id: string; number: string; type: string; title: string; description: string | null;
  site_id: string; asset_id: string | null; contract_id: string | null; customer_id: string; priority: string; status: Status;
  created_by: string; assigned_to: string | null; reviewed_by: string | null; created_at: Date; updated_at: Date;
  response_due_at: Date; resolution_due_at: Date; first_response_at: Date | null; submitted_at: Date | null;
  work_completed_at: Date | null; closed_at: Date | null; deferred_until: string | null; shared_with_customer_at: Date | null;
};

// ── workflow definition: which actions exist, from which states, who may perform them ──
type ActionDef = { from: Status[]; perm: Permission; assignedOnly?: boolean };
export const ACTIONS = {
  assign: { from: ["new", "assigned", "in_progress", "info_requested"], perm: "case.assign" },
  start: { from: ["assigned"], perm: "case.work", assignedOnly: true },
  submit: { from: ["in_progress", "info_requested"], perm: "case.work", assignedOnly: true },
  return_info: { from: ["pending_review"], perm: "case.review" },
  request_approval: { from: ["pending_review"], perm: "approval.request" },
  respond_query: { from: ["customer_query"], perm: "approval.request" },
  cancel_approval: { from: ["awaiting_customer", "customer_query"], perm: "approval.request" },
  decide: { from: ["awaiting_customer"], perm: "approval.decide" },
  defer: { from: ["pending_review", "rejected"], perm: "approval.request" },
  reopen: { from: ["deferred", "rejected"], perm: "approval.request" },
  complete_work: { from: ["approved"], perm: "case.work", assignedOnly: true },
  close: { from: ["work_completed", "pending_review", "rejected", "deferred"], perm: "case.close" },
} satisfies Record<string, ActionDef>;
export type ActionName = keyof typeof ACTIONS;

/** Actions the actor may perform right now (used to render only valid controls; enforced again on the server). */
export function availableActions(actor: Actor, c: Pick<CaseRow, "status" | "assigned_to">): ActionName[] {
  const mine = c.assigned_to === actor.userId;
  return (Object.keys(ACTIONS) as ActionName[]).filter((a) => {
    const d: ActionDef = ACTIONS[a];
    if (!d.from.includes(c.status)) return false;
    if (a === "complete_work") return (can(actor.role, "case.work") && mine) || can(actor.role, "case.review");
    if (!can(actor.role, d.perm)) return false;
    return !d.assignedOnly || mine;
  });
}

const text = (min = 1, max = 4000) => z.string().trim().min(min).max(max);
const uuid = z.string().uuid();

async function loadVisible(db: Db, actor: Actor, id: string, lock = false): Promise<CaseRow> {
  if (!actor.companyId || !uuid.safeParse(id).success) throw notFound();
  const params: unknown[] = [id];
  const where = visibleCases(actor, "c", params);
  const c = await db.one<CaseRow>(`select c.* from cases c where c.id = $1 and ${where} ${lock ? "for update" : ""}`, params);
  if (!c) throw notFound(); // never reveal existence of records outside the actor's scope
  return c;
}

const ref = (c: CaseRow): CaseRef => c;

async function event(db: Db, actor: Actor, c: CaseRow, kind: string, from: Status | null, to: Status | null, detail: Record<string, unknown> = {}, ip?: string | null) {
  await db.q("insert into case_events (company_id, case_id, actor_id, kind, from_status, to_status, detail, at) values ($1,$2,$3,$4,$5,$6,$7,$8)", [c.company_id, c.id, actor.userId, kind, from, to, detail, clock.now()]);
  await audit(db, { action: `case.${kind}`, actorId: actor.userId, entityType: "case", entityId: c.id, detail: { number: Number(c.number), from, to, ...detail }, ip });
}

/** Guarded status change: re-checks permission, assignment and current state under a row lock. */
async function step(db: Db, actor: Actor, id: string, name: ActionName, to: Status, sets: Record<string, unknown> = {}, detail: Record<string, unknown> = {}, ip?: string | null, allowAlt?: Permission) {
  const c = await loadVisible(db, actor, id, true);
  const d: ActionDef = ACTIONS[name];
  if (!can(actor.role, d.perm) && !(allowAlt && can(actor.role, allowAlt))) throw forbidden();
  if (!d.from.includes(c.status)) throw new AppError("invalid_state", 409);
  if (d.assignedOnly && !(allowAlt && can(actor.role, allowAlt)) && c.assigned_to !== actor.userId) throw forbidden();
  const cols = { status: to, updated_at: clock.now(), ...sets };
  const keys = Object.keys(cols);
  await db.q(`update cases set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where id = $1`, [c.id, ...Object.values(cols)]);
  await event(db, actor, c, name, c.status, to, detail, ip);
  return c;
}

const addNote = (db: Db, c: CaseRow, authorId: string, kind: string, visibility: "internal" | "customer", body: string, observedAt?: Date | null) =>
  db.q("insert into case_notes (company_id, case_id, author_id, kind, visibility, body, observed_at, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)", [c.company_id, c.id, authorId, kind, visibility, body, observedAt ?? null, clock.now()]);

const done = async (actor: Actor) => { await flushOutbox(actor.companyId); };

// ── creation & assignment ──
export const CreateCaseInput = z.object({
  type: z.enum(CASE_TYPES), title: text(1, 300), description: z.string().trim().max(4000).optional(),
  siteId: uuid, assetId: uuid.optional().nullable(), priority: z.enum(PRIORITIES), assignedTo: uuid.optional().nullable(),
});

export async function createCase(actor: Actor, raw: z.input<typeof CreateCaseInput>, ip?: string | null): Promise<string> {
  if (!actor.companyId || !can(actor.role, "case.create")) throw forbidden();
  const input = CreateCaseInput.parse(raw);
  const id = await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const site = await db.one<{ id: string; customer_id: string; contract_id: string | null }>("select id, customer_id, contract_id from sites where id = $1", [input.siteId]);
    if (!site || (actor.siteGrants && !actor.siteGrants.includes(site.id)) || (actor.contractGrants && !(site.contract_id && actor.contractGrants.includes(site.contract_id)))) throw notFound();
    if (input.assetId && !(await db.one("select 1 from assets where id = $1 and site_id = $2", [input.assetId, input.siteId]))) throw new AppError("asset_site_mismatch");
    let assignee: { id: string } | undefined;
    if (input.assignedTo) {
      assignee = await db.one("select id from users where id = $1 and status = 'active' and role = 'field_technician'", [input.assignedTo]);
      if (!assignee) throw new AppError("invalid_assignee");
    }
    const sla = await db.one<{ response_minutes: number; resolution_minutes: number }>("select response_minutes, resolution_minutes from sla_policies where priority = $1", [input.priority]);
    if (!sla) throw new AppError("sla_missing", 500);
    const now = clock.now();
    const n = await db.one<{ case_counter: string }>("update companies set case_counter = case_counter + 1 where id = $1 returning case_counter", [actor.companyId]);
    const row = await db.one<CaseRow>(
      `insert into cases (company_id, number, type, title, description, site_id, asset_id, contract_id, customer_id, priority, status, created_by, assigned_to, created_at, updated_at, response_due_at, resolution_due_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15,$16) returning *`,
      [actor.companyId, n!.case_counter, input.type, input.title, input.description ?? null, site.id, input.assetId ?? null, site.contract_id, site.customer_id, input.priority,
       assignee ? "assigned" : "new", actor.userId, assignee?.id ?? null, now, new Date(now.getTime() + sla.response_minutes * 60_000), new Date(now.getTime() + sla.resolution_minutes * 60_000)]);
    await event(db, actor, row!, "created", null, row!.status, { priority: input.priority, type: input.type, assignedTo: assignee?.id ?? null }, ip);
    if (assignee) await notify(db, await db.q("select id, email, name, locale from users where id = $1", [assignee.id]), actor.userId, "assigned", ref(row!));
    return row!.id;
  });
  await done(actor);
  return id;
}

export async function assignCase(actor: Actor, caseId: string, technicianId: string, ip?: string | null) {
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const tech = await db.one<{ id: string; email: string; name: string; locale: "en" | "ar" }>("select id, email, name, locale from users where id = $1 and status = 'active' and role = 'field_technician'", [technicianId]);
    if (!tech) throw new AppError("invalid_assignee");
    const prev = await loadVisible(db, actor, caseId);
    // assignee must also be inside the case's site/contract grants
    const ok = await db.one(`select 1 from users u where u.id = $1
       and (not exists (select 1 from user_access a where a.user_id = u.id and a.kind='site') or exists (select 1 from user_access a where a.user_id = u.id and a.kind='site' and a.ref_id = $2))`, [tech.id, prev.site_id]);
    if (!ok) throw new AppError("assignee_no_site_access");
    const c = await step(db, actor, caseId, "assign", prev.status === "new" ? "assigned" : prev.status, { assigned_to: tech.id }, { assignedTo: tech.id, previous: prev.assigned_to }, ip);
    await notify(db, [tech], actor.userId, "assigned", ref(c));
  });
  await done(actor);
}

// ── technician ──
export async function startWork(actor: Actor, caseId: string, ip?: string | null) {
  await withTx({ companyId: actor.companyId, userId: actor.userId }, (db) => step(db, actor, caseId, "start", "in_progress", { first_response_at: clock.now() }, {}, ip));
}

export const SubmitInput = z.object({ observation: text(1, 8000), observedAt: z.coerce.date().optional() });
export async function submitForReview(actor: Actor, caseId: string, raw: z.input<typeof SubmitInput>, ip?: string | null) {
  const input = SubmitInput.parse(raw);
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const c = await step(db, actor, caseId, "submit", "pending_review", { submitted_at: clock.now() }, { observedAt: input.observedAt?.toISOString() ?? null }, ip);
    await addNote(db, c, actor.userId, "observation", "internal", input.observation, input.observedAt);
    await notify(db, await recipientsFor(db, ref(c), ["engineer"]), actor.userId, "submitted", ref(c));
  });
  await done(actor);
}

// ── engineer review ──
export async function returnForInfo(actor: Actor, caseId: string, reasonRaw: string, ip?: string | null) {
  const reason = text(3, 4000).parse(reasonRaw);
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const c = await step(db, actor, caseId, "return_info", "info_requested", { reviewed_by: actor.userId }, {}, ip);
    await addNote(db, c, actor.userId, "review", "internal", reason);
    if (c.assigned_to) await notify(db, await db.q("select id, email, name, locale from users where id = $1", [c.assigned_to]), actor.userId, "info_requested", ref(c));
  });
  await done(actor);
}

export const ApprovalInput = z.object({ summary: text(1, 4000), dueAt: z.coerce.date().optional(), internalNote: z.string().trim().max(4000).optional() });
export async function requestApproval(actor: Actor, caseId: string, raw: z.input<typeof ApprovalInput>, ip?: string | null) {
  const input = ApprovalInput.parse(raw);
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const now = clock.now();
    const due = input.dueAt ?? new Date(now.getTime() + 72 * 3600_000);
    if (due <= now) throw new AppError("due_in_past");
    const c = await step(db, actor, caseId, "request_approval", "awaiting_customer", { reviewed_by: actor.userId, shared_with_customer_at: now }, { dueAt: due.toISOString() }, ip);
    const a = await db.one<{ id: string }>("insert into approval_requests (company_id, case_id, customer_id, requested_by, summary, status, requested_at, due_at) values ($1,$2,$3,$4,$5,'pending',$6,$7) returning id", [c.company_id, c.id, c.customer_id, actor.userId, input.summary, now, due]);
    await audit(db, { action: "approval.requested", actorId: actor.userId, entityType: "approval", entityId: a!.id, detail: { caseId: c.id, dueAt: due.toISOString() }, ip });
    await addNote(db, c, actor.userId, "customer_message", "customer", input.summary);
    if (input.internalNote) await addNote(db, c, actor.userId, "review", "internal", input.internalNote);
    await notify(db, await recipientsFor(db, ref(c), ["customer_approver"], { customer: true }), actor.userId, "approval_requested", ref(c));
  });
  await done(actor);
}

export async function remindApproval(actor: Actor, caseId: string, note?: string, ip?: string | null) {
  if (!can(actor.role, "approval.remind")) throw forbidden();
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const c = await loadVisible(db, actor, caseId, true);
    const a = await db.one<{ id: string }>("select id from approval_requests where case_id = $1 and status = 'pending'", [c.id]);
    if (c.status !== "awaiting_customer" || !a) throw new AppError("invalid_state", 409);
    await db.q("insert into approval_reminders (company_id, approval_id, sent_by, sent_at, note) values ($1,$2,$3,$4,$5)", [c.company_id, a.id, actor.userId, clock.now(), note?.slice(0, 500) ?? null]);
    await event(db, actor, c, "approval_reminded", c.status, c.status, { approvalId: a.id }, ip);
    await notify(db, await recipientsFor(db, ref(c), ["customer_approver"], { customer: true }), actor.userId, "approval_reminder", ref(c));
  });
  await done(actor);
}

export async function respondToQuery(actor: Actor, caseId: string, messageRaw: string, ip?: string | null) {
  const message = text(1, 4000).parse(messageRaw);
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const c = await step(db, actor, caseId, "respond_query", "awaiting_customer", {}, {}, ip);
    await db.q("update approval_requests set status = 'pending', decided_by = null, decided_at = null, decision_reason = null where case_id = $1 and status = 'info_requested'", [c.id]);
    await addNote(db, c, actor.userId, "customer_message", "customer", message);
    await notify(db, await recipientsFor(db, ref(c), ["customer_approver"], { customer: true }), actor.userId, "customer_message", ref(c));
  });
  await done(actor);
}

export async function cancelApproval(actor: Actor, caseId: string, reasonRaw: string, ip?: string | null) {
  const reason = text(3, 1000).parse(reasonRaw);
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const c = await step(db, actor, caseId, "cancel_approval", "pending_review", {}, { reason }, ip);
    await db.q("update approval_requests set status = 'cancelled', decided_by = $2, decided_at = $3, decision_reason = $4 where case_id = $1 and status in ('pending','info_requested')", [c.id, actor.userId, clock.now(), reason]);
  });
}

// ── customer decision ──
export async function decideApproval(actor: Actor, caseId: string, decision: "approved" | "rejected" | "info_requested", reasonRaw: string | undefined, ip?: string | null) {
  const reason = decision === "approved" ? (reasonRaw ?? "").trim().slice(0, 2000) : text(3, 2000).parse(reasonRaw);
  const to: Status = decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "customer_query";
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const c0 = await loadVisible(db, actor, caseId);
    if (actor.customerId !== c0.customer_id) throw forbidden();
    const c = await step(db, actor, caseId, "decide", to, {}, { decision, reason }, ip);
    const a = await db.one<{ id: string }>(
      "update approval_requests set status = $2, decided_by = $3, decided_at = $4, decision_reason = $5 where case_id = $1 and status = 'pending' returning id",
      [c.id, decision, actor.userId, clock.now(), reason || null]);
    if (!a) throw new AppError("no_pending_approval", 409);
    await audit(db, { action: `approval.${decision}`, actorId: actor.userId, entityType: "approval", entityId: a.id, detail: { caseId: c.id, reason }, ip });
    if (reason) await addNote(db, c, actor.userId, "comment", "customer", reason);
    const to_ = [...(await recipientsFor(db, ref(c), ["engineer", "operations_manager"])), ...(c.assigned_to ? await db.q<{ id: string; email: string; name: string; locale: "en" | "ar" }>("select id, email, name, locale from users where id = $1", [c.assigned_to]) : [])];
    await notify(db, to_, actor.userId, "approval_decided", ref(c), { decision });
  });
  await done(actor);
}

// ── deferral, completion, closure ──
export async function deferCase(actor: Actor, caseId: string, reasonRaw: string, until?: string, ip?: string | null) {
  const reason = text(3, 2000).parse(reasonRaw);
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const c = await step(db, actor, caseId, "defer", "deferred", { deferred_until: until || null }, { reason, until: until || null }, ip);
    await addNote(db, c, actor.userId, "review", "internal", reason);
  });
}
export async function reopenCase(actor: Actor, caseId: string, reasonRaw: string, ip?: string | null) {
  const reason = text(3, 2000).parse(reasonRaw);
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const c = await step(db, actor, caseId, "reopen", "pending_review", {}, { reason }, ip);
    await addNote(db, c, actor.userId, "review", "internal", reason);
  });
}
export async function completeWork(actor: Actor, caseId: string, noteRaw: string, ip?: string | null) {
  const note = text(1, 8000).parse(noteRaw);
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const c = await step(db, actor, caseId, "complete_work", "work_completed", { work_completed_at: clock.now() }, {}, ip, "case.review");
    await addNote(db, c, actor.userId, "completion", "customer", note);
    await notify(db, await recipientsFor(db, ref(c), ["engineer", "operations_manager"]), actor.userId, "work_completed", ref(c));
    await notify(db, await recipientsFor(db, ref(c), ["customer_approver"], { customer: true }), actor.userId, "work_completed", ref(c));
  });
  await done(actor);
}
export async function closeCase(actor: Actor, caseId: string, reasonRaw: string, ip?: string | null) {
  const reason = text(3, 2000).parse(reasonRaw);
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const c = await step(db, actor, caseId, "close", "closed", { closed_at: clock.now() }, { reason }, ip);
    await addNote(db, c, actor.userId, "review", "internal", reason);
  });
}

// ── comments & evidence ──
export async function addComment(actor: Actor, caseId: string, bodyRaw: string, visibility: "internal" | "customer" = "internal", ip?: string | null) {
  if (!can(actor.role, "case.comment")) throw forbidden();
  const body = text(1, 4000).parse(bodyRaw);
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const c = await loadVisible(db, actor, caseId);
    if (c.status === "closed") throw new AppError("case_closed", 409);
    const vis = actor.role === "customer_approver" ? "customer" : visibility;
    await addNote(db, c, actor.userId, "comment", vis, body);
    await audit(db, { action: "case.comment_added", actorId: actor.userId, entityType: "case", entityId: c.id, detail: { visibility: vis }, ip });
  });
}

export async function notifyCustomer(actor: Actor, caseId: string, messageRaw: string, ip?: string | null) {
  if (!can(actor.role, "case.notify_customer")) throw forbidden();
  const message = text(1, 4000).parse(messageRaw);
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const c = await loadVisible(db, actor, caseId, true);
    if (c.status === "new" || c.status === "closed") throw new AppError("invalid_state", 409);
    if (!c.shared_with_customer_at) await db.q("update cases set shared_with_customer_at = $2 where id = $1", [c.id, clock.now()]);
    await addNote(db, c, actor.userId, "customer_message", "customer", message);
    await event(db, actor, c, "customer_notified", c.status, c.status, {}, ip);
    await notify(db, await recipientsFor(db, ref(c), ["customer_approver"], { customer: true }), actor.userId, "customer_message", ref(c));
  });
  await done(actor);
}

export const ALLOWED_UPLOAD = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
export async function uploadEvidence(actor: Actor, caseId: string, file: { name: string; data: Buffer }, opts: { caption?: string; capturedAt?: Date | null; visibility?: "internal" | "customer" } = {}, ip?: string | null): Promise<string> {
  if (!actor.companyId || !can(actor.role, "evidence.upload")) throw forbidden();
  if (file.data.length === 0) throw new AppError("file_empty");
  if (file.data.length > maxUploadBytes()) throw new AppError("file_too_large", 413);
  const mime = sniffMime(file.data);
  if (!mime || !ALLOWED_UPLOAD.has(mime)) throw new AppError("file_type_not_allowed", 415);
  const name = file.name.replace(/[\u0000-\u001f\\/]/g, "_").slice(0, 200) || "file";
  const hash = sha256(file.data);
  const id = await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const c = await loadVisible(db, actor, caseId);
    if (c.status === "closed") throw new AppError("case_closed", 409);
    if (actor.role === "field_technician" && !["in_progress", "info_requested", "assigned"].includes(c.status)) throw new AppError("invalid_state", 409);
    const key = await blobStore.put(actor.companyId!, file.data);
    const r = await db.one<{ id: string }>(
      `insert into evidence (company_id, case_id, asset_id, uploader_id, original_name, mime, size_bytes, sha256, storage_key, visibility, caption, captured_at, uploaded_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
      [c.company_id, c.id, c.asset_id, actor.userId, name, mime, file.data.length, hash, key, opts.visibility === "customer" && actor.role !== "field_technician" ? "customer" : "internal", opts.caption?.slice(0, 500) ?? null, opts.capturedAt ?? null, clock.now()]);
    await event(db, actor, c, "evidence_uploaded", c.status, c.status, { evidenceId: r!.id, sha256: hash, name, mime, size: file.data.length }, ip);
    return r!.id;
  });
  return id;
}

export async function shareEvidence(actor: Actor, evidenceId: string, visibility: "internal" | "customer", ip?: string | null) {
  if (!can(actor.role, "case.notify_customer")) throw forbidden();
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const e = await db.one<{ id: string; case_id: string; visibility: string }>("select id, case_id, visibility from evidence where id = $1", [evidenceId]);
    if (!e) throw notFound();
    const c = await loadVisible(db, actor, e.case_id);
    await db.q("update evidence set visibility = $2 where id = $1", [e.id, visibility]);
    await event(db, actor, c, "evidence_visibility_changed", c.status, c.status, { evidenceId: e.id, from: e.visibility, to: visibility }, ip);
  });
}

/** Authorised read of an evidence file. Verifies scope, customer visibility and stored hash. */
export async function readEvidence(actor: Actor, evidenceId: string, ip?: string | null) {
  if (!uuid.safeParse(evidenceId).success) throw notFound();
  const row = await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const e = await db.one<{ id: string; case_id: string; visibility: string; storage_key: string; mime: string; original_name: string; sha256: string }>("select * from evidence where id = $1", [evidenceId]);
    if (!e) throw notFound();
    const c = await loadVisible(db, actor, e.case_id);
    if (actor.role === "customer_approver" && e.visibility !== "customer") throw notFound();
    await audit(db, { action: "evidence.accessed", actorId: actor.userId, entityType: "evidence", entityId: e.id, detail: { caseId: c.id }, ip });
    return e;
  });
  const data = await blobStore.get(row.storage_key);
  if (sha256(data) !== row.sha256) {
    await withTx({ companyId: actor.companyId, userId: actor.userId }, (db) => audit(db, { action: "evidence.integrity_failure", actorId: actor.userId, entityType: "evidence", entityId: row.id }));
    throw new AppError("integrity_failure", 500);
  }
  return { data, mime: row.mime, name: row.original_name };
}

// ── queries ──
export type ListFilters = { status?: Status[]; priority?: string; assignedTo?: string; siteId?: string; metric?: string; q?: string; mine?: boolean; limit?: number; offset?: number };
export async function listCases(actor: Actor, f: ListFilters = {}) {
  if (!actor.companyId || !can(actor.role, "case.view")) throw forbidden();
  const params: unknown[] = [];
  const where = [visibleCases(actor, "c", params)];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (f.status?.length) where.push(`c.status = any(${p(f.status)}::text[])`);
  if (f.priority && (PRIORITIES as readonly string[]).includes(f.priority)) where.push(`c.priority = ${p(f.priority)}`);
  if (f.assignedTo && uuid.safeParse(f.assignedTo).success) where.push(`c.assigned_to = ${p(f.assignedTo)}`);
  if (f.siteId && uuid.safeParse(f.siteId).success) where.push(`c.site_id = ${p(f.siteId)}`);
  if (f.mine) where.push(`c.assigned_to = ${p(actor.userId)}`);
  if (isMetric(f.metric)) where.push(`(${metricSql(f.metric, "c", nowSql(clock.now()))})`);
  if (f.q?.trim()) where.push(`(c.title ilike ${p("%" + f.q.trim().replace(/[%_\\]/g, "\\$&") + "%")} or c.number::text = ${p(f.q.trim())})`);
  const lim = p(Math.min(f.limit ?? 50, 200)), off = p(f.offset ?? 0);
  return withTx({ companyId: actor.companyId, userId: actor.userId }, (db) => db.q<CaseRow & { site_name: string; asset_tag: string | null; assignee_name: string | null }>(
    `select c.*, s.name site_name, a.tag asset_tag, u.name assignee_name
       from cases c join sites s on s.id = c.site_id left join assets a on a.id = c.asset_id left join users u on u.id = c.assigned_to
      where ${where.join(" and ")} order by case c.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, c.created_at desc limit ${lim} offset ${off}`, params));
}

export type CaseDetail = Awaited<ReturnType<typeof getCase>>;
export async function getCase(actor: Actor, id: string) {
  if (!can(actor.role, "case.view")) throw forbidden();
  const isCust = actor.role === "customer_approver";
  return withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const c = await loadVisible(db, actor, id);
    const [site, asset, assignee, notes, evidence, approvals, events] = await Promise.all([
      db.one<{ id: string; name: string; address: string | null }>("select id, name, address from sites where id = $1", [c.site_id]),
      c.asset_id ? db.one<{ id: string; tag: string; name: string; asset_type: string; criticality: string }>("select id, tag, name, asset_type, criticality from assets where id = $1", [c.asset_id]) : Promise.resolve(undefined),
      c.assigned_to ? db.one<{ id: string; name: string }>("select id, name from users where id = $1", [c.assigned_to]) : Promise.resolve(undefined),
      db.q<{ id: string; kind: string; visibility: string; body: string; observed_at: Date | null; created_at: Date; author_name: string; author_role: string }>(
        `select n.id, n.kind, n.visibility, n.body, n.observed_at, n.created_at, u.name author_name, u.role author_role from case_notes n join users u on u.id = n.author_id
          where n.case_id = $1 ${isCust ? "and n.visibility = 'customer'" : ""} order by n.created_at`, [c.id]),
      db.q<{ id: string; original_name: string; mime: string; size_bytes: string; sha256: string; visibility: string; caption: string | null; uploaded_at: Date; captured_at: Date | null; uploader_name: string }>(
        `select e.id, e.original_name, e.mime, e.size_bytes, e.sha256, e.visibility, e.caption, e.uploaded_at, e.captured_at, u.name uploader_name from evidence e join users u on u.id = e.uploader_id
          where e.case_id = $1 ${isCust ? "and e.visibility = 'customer'" : ""} order by e.uploaded_at`, [c.id]),
      db.q<{ id: string; status: string; summary: string; requested_at: Date; due_at: Date; decided_at: Date | null; decision_reason: string | null; requested_by_name: string; decided_by_name: string | null; reminders: number }>(
        `select a.id, a.status, a.summary, a.requested_at, a.due_at, a.decided_at, a.decision_reason, ru.name requested_by_name, du.name decided_by_name,
                (select count(*)::int from approval_reminders r where r.approval_id = a.id) reminders
           from approval_requests a join users ru on ru.id = a.requested_by left join users du on du.id = a.decided_by where a.case_id = $1 order by a.requested_at`, [c.id]),
      db.q<{ id: string; kind: string; from_status: string | null; to_status: string | null; at: Date; actor_name: string | null; detail: Record<string, unknown> }>(
        `select e.id, e.kind, e.from_status, e.to_status, e.at, u.name actor_name, e.detail from case_events e left join users u on u.id = e.actor_id
          where e.case_id = $1 ${isCust ? "and e.kind in ('request_approval','decide','approval_reminded','customer_notified','respond_query','complete_work','close')" : ""} order by e.at`, [c.id]),
    ]);
    return {
      case: c, site, asset, assignee, notes, evidence, approvals,
      events: isCust ? events.map((e) => ({ ...e, detail: {} as Record<string, unknown>, from_status: null })) : events,
      actions: availableActions(actor, c).filter((a) => !(a === "decide" && actor.customerId !== c.customer_id)),
    };
  });
}

/** Elapsed time an approval has been (or was) waiting on the customer. */
export const approvalElapsedMs = (a: { requested_at: Date; decided_at: Date | null; status: string }, now: Date) =>
  ((a.status === "pending" ? now : a.decided_at ?? now).getTime() - a.requested_at.getTime());

export async function listNotifications(actor: Actor, limit = 50) {
  return withTx({ companyId: actor.companyId, userId: actor.userId }, (db) =>
    db.q<{ id: string; kind: string; case_id: string | null; params: Record<string, string | number>; created_at: Date; read_at: Date | null }>(
      "select id, kind, case_id, params, created_at, read_at from notifications where user_id = $1 order by created_at desc limit $2", [actor.userId, limit]));
}
export async function markNotificationsRead(actor: Actor) {
  await withTx({ companyId: actor.companyId, userId: actor.userId }, (db) => db.q("update notifications set read_at = $2 where user_id = $1 and read_at is null", [actor.userId, clock.now()]));
}
export async function unreadCount(actor: Actor) {
  return withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => Number((await db.one<{ n: string }>("select count(*) n from notifications where user_id = $1 and read_at is null", [actor.userId]))!.n));
}
