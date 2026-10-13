import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, LocalTimeField, Submit } from "@/components/platform/ActionForm";
import { Field, PageHeader, PriorityBadge, StatusBadge } from "@/components/platform/ui";
import { AppError } from "@/server/actor";
import { approvalElapsedMs, getCase, type ActionName } from "@/server/cases";
import { clock } from "@/server/db";
import { referenceData } from "@/server/master";
import { can } from "@/server/rbac";
import { requireActor } from "@/server/web";
import { viewFor, type View } from "@/server/view";
import { caseOp, uploadEvidenceAction } from "../../../actions";

type Detail = Awaited<ReturnType<typeof getCase>>;

function OpForm({ v, caseId, op, label, confirm, danger, children, help }: { v: View; caseId: string; op: string; label: string; confirm?: boolean; danger?: boolean; children?: React.ReactNode; help?: string }) {
  return (
    <details className="card p-3">
      <summary className="font-semibold">{label}</summary>
      <ActionForm action={caseOp} errors={v.errors} confirmText={confirm ? v.t("common.confirm_action") : undefined} className="mt-2 grid gap-3">
        <input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="op" value={op} />
        {help && <p className="hint">{help}</p>}
        {children}
        <div><Submit danger={danger}>{label}</Submit></div>
      </ActionForm>
    </details>
  );
}
const Text = ({ id, label, name, rows = 3, required = true }: { id: string; label: string; name: string; rows?: number; required?: boolean }) => (
  <Field id={id} label={label}><textarea id={id} name={name} rows={rows} required={required} maxLength={4000} className="field" /></Field>
);

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await requireActor();
  const v = viewFor(a.locale);
  let d: Detail;
  try { d = await getCase(a, id); } catch (e) { if (e instanceof AppError && (e.code === "not_found" || e.code === "forbidden")) notFound(); throw e; }
  const c = d.case;
  const now = clock.now();
  const ref = can(a.role, "case.assign") && d.actions.includes("assign") ? await referenceData(a) : null;
  const has = (x: ActionName) => d.actions.includes(x);
  const isCust = a.role === "customer_approver";
  const open = c.status !== "closed";
  const overdue = !["closed", "work_completed", "deferred"].includes(c.status) && c.resolution_due_at < now;
  const pending = d.approvals.find((x) => x.status === "pending" || x.status === "info_requested");
  const label = (k: string) => v.t(`action.${k}`);

  return (
    <>
      <PageHeader title={`#${v.n(Number(c.number))} · ${c.title}`}>
        <Link className="btn btn-secondary" href={a.role === "customer_approver" ? "/app/portal" : "/app/cases"}>{v.t("common.back")}</Link>
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge v={v} status={c.status} /><PriorityBadge v={v} priority={c.priority} />
        {overdue && <span className="badge badge-bad">{v.t("case.overdue")}</span>}
        {!isCust && <span className="badge badge-neutral">{c.shared_with_customer_at ? v.t("case.shared") : v.t("case.not_shared")}</span>}
        {c.status !== "closed" && !isCust && <span className="hint">{v.t("common.waiting_on")}: <strong>{v.t(`owner.${c.status}`)}</strong></span>}
      </div>

      <section className="card mb-4 p-4" aria-labelledby="info">
        <h2 id="info" className="sr-only">{v.t("common.description")}</h2>
        {c.description && <p className="mb-3 whitespace-pre-wrap">{c.description}</p>}
        <dl className="grid gap-3 sm:grid-cols-3">
          <div><dt className="hint">{v.t("common.site")}</dt><dd className="font-semibold">{d.site?.name}</dd></div>
          <div><dt className="hint">{v.t("common.asset")}</dt><dd className="font-semibold">{d.asset ? `${d.asset.tag} — ${d.asset.name}` : "—"}</dd></div>
          <div><dt className="hint">{v.t("common.type")}</dt><dd className="font-semibold">{v.t(`type.${c.type}`)}</dd></div>
          {!isCust && <div><dt className="hint">{v.t("common.assignee")}</dt><dd className="font-semibold">{d.assignee?.name ?? v.t("common.unassigned")}</dd></div>}
          <div><dt className="hint">{v.t("common.created")}</dt><dd>{v.dt(c.created_at)}</dd></div>
          {!isCust && <div><dt className="hint">{v.t("case.sla_response")}</dt><dd>{v.dt(c.response_due_at)}</dd></div>}
          {!isCust && <div><dt className="hint">{v.t("case.sla_resolution")}</dt><dd>{v.dt(c.resolution_due_at)}</dd></div>}
          {!isCust && <div><dt className="hint">{v.t("case.first_response")}</dt><dd>{v.dt(c.first_response_at)}</dd></div>}
        </dl>
      </section>

      {open && (
        <section className="mb-4 grid gap-3" aria-labelledby="actions">
          <h2 id="actions" className="text-lg font-bold">{v.t("common.actions")}</h2>
          {has("assign") && ref && (
            <OpForm v={v} caseId={c.id} op="assign" label={label("assign")}>
              <Field id="technicianId" label={v.t("common.assignee")}><select id="technicianId" name="technicianId" required className="field">{ref.technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            </OpForm>
          )}
          {has("start") && <OpForm v={v} caseId={c.id} op="start" label={label("start")} />}
          {has("submit") && (
            <OpForm v={v} caseId={c.id} op="submit" label={label("submit")} confirm>
              <Text id="observation" name="observation" label={v.t("case.observation")} rows={4} />
              <LocalTimeField name="observedAt" label={v.t("case.observed_at")} defaultNow />
            </OpForm>
          )}
          {has("return_info") && <OpForm v={v} caseId={c.id} op="return_info" label={label("return_info")} help={v.t("case.reason_help")}><Text id="ri" name="reason" label={v.t("common.reason")} /></OpForm>}
          {has("request_approval") && (
            <OpForm v={v} caseId={c.id} op="request_approval" label={label("request_approval")} confirm>
              <Text id="summary" name="summary" label={v.t("case.summary_customer")} rows={4} />
              <LocalTimeField name="dueAt" label={v.t("case.due_by")} hint={`${v.t("common.optional")}: 72 h`} />
              <Text id="internalNote" name="internalNote" label={v.t("case.internal_note")} required={false} />
            </OpForm>
          )}
          {has("respond_query") && <OpForm v={v} caseId={c.id} op="respond_query" label={label("respond_query")}><Text id="rq" name="message" label={v.t("note.customer_message")} /></OpForm>}
          {has("decide") && (<>
            <OpForm v={v} caseId={c.id} op="approve" label={label("approve")} confirm help={v.t("approval.decision_note")}><Text id="ap" name="reason" label={`${v.t("common.reason")} (${v.t("common.optional")})`} required={false} /></OpForm>
            <OpForm v={v} caseId={c.id} op="reject" label={label("reject")} confirm danger help={v.t("case.reason_help")}><Text id="rj" name="reason" label={v.t("common.reason")} /></OpForm>
            <OpForm v={v} caseId={c.id} op="request_info" label={label("request_info")} help={v.t("case.reason_help")}><Text id="ri2" name="reason" label={v.t("common.reason")} /></OpForm>
          </>)}
          {has("cancel_approval") && <OpForm v={v} caseId={c.id} op="cancel_approval" label={label("cancel_approval")} confirm><Text id="ca" name="reason" label={v.t("common.reason")} /></OpForm>}
          {pending?.status === "pending" && can(a.role, "approval.remind") && <OpForm v={v} caseId={c.id} op="remind" label={label("remind")}><Text id="rm" name="note" label={`${v.t("common.description")} (${v.t("common.optional")})`} required={false} rows={2} /></OpForm>}
          {has("defer") && (
            <OpForm v={v} caseId={c.id} op="defer" label={label("defer")} confirm>
              <Text id="df" name="reason" label={v.t("common.reason")} />
              <Field id="until" label={`${v.t("case.defer_until")} (${v.t("common.optional")})`}><input id="until" name="until" type="date" className="field" /></Field>
            </OpForm>
          )}
          {has("reopen") && <OpForm v={v} caseId={c.id} op="reopen" label={label("reopen")}><Text id="ro" name="reason" label={v.t("common.reason")} /></OpForm>}
          {has("complete_work") && <OpForm v={v} caseId={c.id} op="complete_work" label={label("complete_work")} confirm><Text id="cw" name="note" label={v.t("case.completion_note")} rows={4} /></OpForm>}
          {has("close") && <OpForm v={v} caseId={c.id} op="close" label={label("close")} confirm danger help={v.t("case.reason_help")}><Text id="cl" name="reason" label={v.t("common.reason")} /></OpForm>}
          {can(a.role, "case.notify_customer") && c.status !== "new" && <OpForm v={v} caseId={c.id} op="notify" label={label("notify")} confirm><Text id="nt" name="message" label={v.t("note.customer_message")} /></OpForm>}
          {can(a.role, "case.comment") && (
            <OpForm v={v} caseId={c.id} op="comment" label={label("comment")}>
              <Text id="cm" name="body" label={v.t("note.comment")} />
              {!isCust && <Field id="vis" label={v.t("case.visibility")}><select id="vis" name="visibility" className="field"><option value="internal">{v.t("case.internal")}</option><option value="customer">{v.t("case.customer")}</option></select></Field>}
            </OpForm>
          )}
        </section>
      )}

      <section className="card mb-4 p-4" aria-labelledby="appr">
        <h2 id="appr" className="mb-2 text-lg font-bold">{v.t("case.approvals")}</h2>
        {d.approvals.length === 0 ? <p className="hint">{v.t("approval.none")}</p> : (
          <ul className="grid gap-3">
            {d.approvals.map((p) => (
              <li key={p.id} className="rounded-lg border border-[color:var(--color-line)] p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className={`badge ${p.status === "approved" ? "badge-ok" : p.status === "rejected" ? "badge-bad" : p.status === "cancelled" ? "badge-neutral" : "badge-warn"}`}>{v.t(`approval.${p.status}`)}</span>
                  <span className="hint">{p.status === "pending" ? v.t("approval.elapsed") : v.t("approval.took")}: <strong>{v.dur(approvalElapsedMs(p, now))}</strong></span>
                  {p.status === "pending" && p.due_at < now && <span className="badge badge-bad">{v.t("approval.past_due")}</span>}
                </div>
                <p className="whitespace-pre-wrap">{p.summary}</p>
                <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  <div><dt className="inline hint">{v.t("approval.requested_by")}: </dt><dd className="inline">{p.requested_by_name}, {v.dt(p.requested_at)}</dd></div>
                  <div><dt className="inline hint">{v.t("approval.due_at")}: </dt><dd className="inline">{v.dt(p.due_at)}</dd></div>
                  {p.decided_at && <div><dt className="inline hint">{v.t("approval.decided_by")}: </dt><dd className="inline">{p.decided_by_name}, {v.dt(p.decided_at)}</dd></div>}
                  {p.decision_reason && <div><dt className="inline hint">{v.t("common.reason")}: </dt><dd className="inline">{p.decision_reason}</dd></div>}
                  <div><dt className="inline hint">{v.t("approval.reminders")}: </dt><dd className="inline">{v.n(p.reminders)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mb-4 p-4" aria-labelledby="notes">
        <h2 id="notes" className="mb-2 text-lg font-bold">{v.t("case.notes")}</h2>
        {d.notes.length === 0 ? <p className="hint">{v.t("case.no_notes")}</p> : (
          <ul className="grid gap-3">
            {d.notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-[color:var(--color-line)] p-3">
                <p className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className="badge badge-info">{v.t(`note.${n.kind}`)}</span>
                  <strong>{n.author_name}</strong> <span className="hint">{v.t(`role.${n.author_role}`)} · {v.dt(n.created_at)}</span>
                  {n.observed_at && <span className="hint">({v.t("case.observed_at")}: {v.dt(n.observed_at)})</span>}
                  {!isCust && <span className={`badge ${n.visibility === "customer" ? "badge-ok" : "badge-neutral"}`}>{n.visibility === "customer" ? v.t("case.customer") : v.t("case.internal")}</span>}
                </p>
                <p className="whitespace-pre-wrap">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mb-4 p-4" aria-labelledby="evi">
        <h2 id="evi" className="mb-2 text-lg font-bold">{v.t("case.evidence")}</h2>
        {d.evidence.length === 0 ? <p className="hint">{v.t("case.no_evidence")}</p> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {d.evidence.map((e) => (
              <li key={e.id} className="rounded-lg border border-[color:var(--color-line)] p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, access-controlled image route: next/image optimisation would bypass it */}
                {e.mime.startsWith("image/") && <a href={`/app/files/${e.id}`} target="_blank" rel="noopener"><img src={`/app/files/${e.id}`} alt={e.caption ?? e.original_name} className="mb-2 max-h-40 rounded border" loading="lazy" /></a>}
                <p className="font-semibold"><a className="underline" href={`/app/files/${e.id}`} target="_blank" rel="noopener">{e.original_name}</a></p>
                {e.caption && <p>{e.caption}</p>}
                <p className="hint">{v.t("case.uploaded")}: {v.dt(e.uploaded_at)} · {e.uploader_name}{e.captured_at ? ` · ${v.t("case.captured_at")}: ${v.dt(e.captured_at)}` : ""}</p>
                <p className="hint" dir="ltr" title={e.sha256}>{v.t("case.sha")}: {e.sha256.slice(0, 16)}…</p>
                {!isCust && <p><span className={`badge ${e.visibility === "customer" ? "badge-ok" : "badge-neutral"}`}>{e.visibility === "customer" ? v.t("case.customer") : v.t("case.internal")}</span></p>}
                {can(a.role, "case.notify_customer") && open && (
                  <ActionForm action={caseOp} errors={v.errors} className="mt-2" resetOnSuccess={false}>
                    <input type="hidden" name="caseId" value={c.id} /><input type="hidden" name="evidenceId" value={e.id} /><input type="hidden" name="op" value={e.visibility === "customer" ? "unshare" : "share"} />
                    <Submit secondary>{e.visibility === "customer" ? label("unshare") : label("share")}</Submit>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
        {can(a.role, "evidence.upload") && open && (
          <details className="mt-3"><summary className="font-semibold">{label("upload")}</summary>
            <ActionForm action={uploadEvidenceAction} errors={v.errors} className="mt-2 grid gap-3">
              <input type="hidden" name="caseId" value={c.id} />
              <Field id="file" label={v.t("case.file")}><input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className="field" /></Field>
              <Field id="caption" label={`${v.t("case.caption")} (${v.t("common.optional")})`}><input id="caption" name="caption" maxLength={500} className="field" /></Field>
              <LocalTimeField name="capturedAt" label={`${v.t("case.captured_at")} (${v.t("common.optional")})`} />
              {a.role !== "field_technician" && <Field id="evvis" label={v.t("case.visibility")}><select id="evvis" name="visibility" className="field"><option value="internal">{v.t("case.internal")}</option><option value="customer">{v.t("case.customer")}</option></select></Field>}
              <div><Submit>{label("upload")}</Submit></div>
            </ActionForm>
          </details>
        )}
      </section>

      <section className="card mb-8 p-4" aria-labelledby="tl">
        <h2 id="tl" className="mb-2 text-lg font-bold">{v.t("case.timeline")}</h2>
        <ol className="grid gap-2">
          {d.events.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3 border-s-4 border-[color:var(--color-brand-600)] ps-3">
              <span className="font-semibold">{v.t(`event.${e.kind}`)}{typeof e.detail.decision === "string" ? `: ${v.t(`decision.${e.detail.decision}`)}` : ""}</span>
              {e.to_status && e.from_status !== e.to_status && !isCust && <span className="hint">→ {v.t(`status.${e.to_status}`)}</span>}
              <span className="hint">{e.actor_name ?? ""} · {v.dt(e.at)}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
