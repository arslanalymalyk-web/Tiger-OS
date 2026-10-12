"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Ban, Loader2 } from "lucide-react";
import { PEOPLE } from "@/data";
import { useDemo } from "@/state/DemoProvider";
import { useAssistant, useProviderStatus } from "@/state/assist";
import { can } from "@/lib/stage2/rules";
import { personLabel } from "@/lib/stage2/catalog";
import { acceptBriefProposal, acceptTaskProposal, discardProposal, dispositionOf, editBriefProposal, editTaskProposal } from "@/lib/stage3/mutations";
import { ASSISTANT_BY_OP, OPERATION_LABEL, type AiRun, type BriefProposal, type Claim, type TaskProposal } from "@/lib/stage3/types";
import { Btn, ErrorList, Locked, Notice, StaleBadge, TextArea, TextField, SelectField, fmtDateTime, useAction } from "../stage2/common";
import { CitationChip, ModeBadge, RunStatusBadge } from "./common3";

const SECTION = "rounded-lg border border-line bg-white p-3";
function ClaimList({ title, claims, testId, empty }: { title: string; claims: Claim[]; testId: string; empty?: string }) {
  return (
    <section className={SECTION} data-testid={testId} aria-label={title}>
      <h4 className="text-sm font-semibold">{title} ({claims.length})</h4>
      {claims.length === 0 ? <p className="mt-1 text-xs text-muted">{empty ?? "None."}</p> : (
        <ul className="mt-2 space-y-3">{claims.map((c) => (
          <li key={c.id} className="text-sm" data-testid={`claim-${c.id}`}>
            <p>{c.text}</p>
            {c.basis && <p className="mt-0.5 text-xs text-ink-2"><b>Basis:</b> {c.basis}</p>}
            {c.citations.length > 0 && <ul className="mt-1 space-y-1">{c.citations.map((x) => <li key={`${x.evidenceId}${x.ref}`} className="text-xs"><CitationChip c={x} /> <q className="text-ink-2">{x.quote}</q></li>)}</ul>}
            {c.records.length > 0 && <p className="mt-0.5 text-[11px] text-muted">Case records: {c.records.join(", ")}</p>}
          </li>
        ))}</ul>
      )}
    </section>
  );
}
function TextList({ title, items, testId, empty }: { title: string; items: { id: string; text: string }[]; testId: string; empty?: string }) {
  return (
    <section className={SECTION} data-testid={testId} aria-label={title}>
      <h4 className="text-sm font-semibold">{title} ({items.length})</h4>
      {items.length === 0 ? <p className="mt-1 text-xs text-muted">{empty ?? "None."}</p> : <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{items.map((i) => <li key={i.id}>{i.text}</li>)}</ul>}
    </section>
  );
}

export function RunView({ run, stale }: { run: AiRun; stale: string[] }) {
  const { role } = useDemo();
  const { cancel, start } = useAssistant();
  const status = useProviderStatus();
  const { errors, setErrors } = useAction();
  const o = run.output;
  const disp = dispositionOf(run);
  const [retryErr, setRetryErr] = useState<string[]>([]);
  const s = stale.length > 0;
  return (
    <article className="space-y-4 rounded-xl border border-line bg-ivory p-4" aria-label={`Assistant run ${run.id}`} data-testid={`run-view-${run.id}`}>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-serif text-lg">{OPERATION_LABEL[run.operation]}</h3><code className="font-mono text-xs text-muted">{run.id}</code><ModeBadge mode={run.mode} /><RunStatusBadge status={run.status} />{s && <StaleBadge />}</div>
        <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3" data-testid="run-provenance">
          <div><dt className="font-semibold uppercase tracking-wide text-muted">Assistant</dt><dd>{ASSISTANT_BY_OP[run.operation].name}</dd></div>
          <div><dt className="font-semibold uppercase tracking-wide text-muted">Case</dt><dd><Link href={`/cases/${run.caseId}?tab=ai`} className="text-em-700 underline">{run.caseId}</Link></dd></div>
          <div><dt className="font-semibold uppercase tracking-wide text-muted">Requested by</dt><dd>{run.role} demonstration role</dd></div>
          <div><dt className="font-semibold uppercase tracking-wide text-muted">Created</dt><dd>{fmtDateTime(run.createdAt)}</dd></div>
          <div><dt className="font-semibold uppercase tracking-wide text-muted">Started / finished</dt><dd>{run.startedAt ? fmtDateTime(run.startedAt) : "—"} / {run.finishedAt ? fmtDateTime(run.finishedAt) : "—"}</dd></div>
          <div><dt className="font-semibold uppercase tracking-wide text-muted">Provider and model</dt><dd data-testid="run-model">{run.mode === "deterministic" ? "None — rule-based text assembly, no model used" : run.provider ? `${run.provider} · ${run.model}` : "Not recorded (no response received)"}</dd></div>
          {run.promptVersion && <div><dt className="font-semibold uppercase tracking-wide text-muted">Prompt template</dt><dd>{run.promptVersion}</dd></div>}
          {run.usage && <div><dt className="font-semibold uppercase tracking-wide text-muted">Usage reported by provider</dt><dd data-testid="run-usage">{run.usage.inputTokens.toLocaleString("en-US")} input / {run.usage.outputTokens.toLocaleString("en-US")} output tokens (no cost is estimated)</dd></div>}
          {run.durationMs !== undefined && <div><dt className="font-semibold uppercase tracking-wide text-muted">Duration</dt><dd>{(run.durationMs / 1000).toFixed(1)} s</dd></div>}
          <div><dt className="font-semibold uppercase tracking-wide text-muted">Input snapshot</dt><dd data-testid="run-fingerprint"><code>{run.snapshot.fingerprint}</code> · {run.snapshot.evidence.map((e) => `${e.evidenceId} v${e.version}`).join(", ")} · {run.snapshot.chars.toLocaleString("en-US")} chars</dd></div>
          <div><dt className="font-semibold uppercase tracking-wide text-muted">Review disposition</dt><dd data-testid="run-disposition">{disp.replace("-", " ")}</dd></div>
          {run.question && <div className="sm:col-span-3"><dt className="font-semibold uppercase tracking-wide text-muted">Question</dt><dd>{run.question}</dd></div>}
        </dl>
      </header>

      {(run.status === "queued" || run.status === "running") && (
        <div className="space-y-2 rounded-lg border border-gd-500/40 bg-gd-100/50 p-3 text-sm" role="status" data-testid="run-active">
          <p className="flex items-center gap-2"><Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden /> <b>{run.status === "queued" ? "Queued" : "Running"}.</b> {run.mode === "deterministic" ? "Assembling the demonstration output." : "Waiting for the provider. Nothing is saved to the case until you review it."}</p>
          {can(role, "ai.run") && <><Btn kind="secondary" onClick={() => { const r = cancel(run.id); if (!r.ok) setErrors(r.errors); }} testId={`cancel-${run.id}`}><Ban size={14} aria-hidden />Cancel run</Btn>
            {run.mode !== "deterministic" && <p className="text-xs text-ink-2">Cancelling stops waiting locally. It may not stop the provider from processing the request, and any late result is discarded.</p>}</>}
        </div>
      )}
      <ErrorList errors={errors} />
      {run.status === "cancelled" && <p className="rounded-lg border border-line bg-white p-3 text-sm" data-testid="run-cancelled"><b>Cancelled.</b> {run.note}</p>}
      {run.status === "failed" && run.error && (
        <div className="space-y-2 rounded-lg border border-rd-600/40 bg-rd-100 p-3 text-sm text-rd-800" role="alert" data-testid="run-error" data-code={run.error.code}>
          <p><b>This run failed ({run.error.code.replace(/_/g, " ")}).</b> {run.error.message}{run.error.retryAfterSeconds ? ` Retry after about ${run.error.retryAfterSeconds} seconds.` : ""}</p>
          <p className="text-xs">Nothing was changed in the case, and no output was saved. The app did not switch to the deterministic demonstration.</p>
          {can(role, "ai.run") && run.mode !== "deterministic" && !!status?.configured && <Btn kind="secondary" onClick={async () => { setRetryErr([]); const r = await start({ caseId: run.caseId, operation: run.operation, question: run.question, mode: "ai", status }); if (!r.ok) setRetryErr(r.errors); }} testId={`retry-${run.id}`}>Retry as a new run</Btn>}
          <ErrorList errors={retryErr} />
        </div>
      )}

      {s && (
        <div className="rounded-lg border border-am-600/40 bg-am-100 p-3 text-sm text-am-800" role="status" data-testid="run-stale">
          <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} aria-hidden />Needs refresh — the case changed after this run&apos;s inputs were captured.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{stale.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className="mt-1 text-xs">This output is kept for inspection. Its proposals cannot be accepted; run the assistant again.</p>
        </div>
      )}

      {o && run.status === "completed" && (
        <div className="space-y-3">
          {o.insufficient && <div className="rounded-lg border border-am-600/40 bg-am-100 p-3 text-sm text-am-800" role="status" data-testid="run-insufficient"><b>Insufficient evidence.</b> {o.insufficient}</div>}
          {o.warnings.length > 0 && <ul className="list-disc space-y-0.5 rounded-lg border border-line bg-white p-3 pl-7 text-xs text-ink-2" data-testid="run-warnings">{o.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          <p className="text-xs text-ink-2" data-testid="validation-note">Validation checked that each citation names evidence, a version and a reference that were supplied, that the quotation appears in that passage, and that figures appear in the supplied material. <b>It cannot confirm that a passage supports a claim — a reviewer must judge that.</b></p>
          {run.operation !== "tasks" && run.operation !== "brief" && <ClaimList title="Source-supported findings" claims={o.sourceSupported} testId="out-supported" empty="None survived validation." />}
          {(run.operation === "summarize" || run.operation === "conflicts" || run.operation === "question") && <ClaimList title="Inferences and assumptions (not source-supported)" claims={o.inferences} testId="out-inferences" />}
          {(run.operation === "conflicts") && <ClaimList title="Contradictions" claims={o.contradictions} testId="out-contradictions" empty="No contradictions were identified in the supplied evidence." />}
          <TextList title="Missing information" items={o.missing} testId="out-missing" />
          {(run.operation === "summarize" || run.operation === "tasks") && <TextList title="Suggested next steps" items={o.nextSteps} testId="out-next" />}
          {run.operation === "tasks" && <TaskProposals run={run} stale={s} />}
          {run.operation === "brief" && o.briefProposal && <BriefProposalView run={run} proposal={o.briefProposal} stale={s} />}
          {o.rejected.length > 0 && (
            <details className="rounded-lg border border-rd-600/30 bg-white p-3" data-testid="out-rejected" open>
              <summary className="cursor-pointer text-sm font-semibold text-rd-800">Rejected by validation ({o.rejected.length})</summary>
              <ul className="mt-2 space-y-2 text-sm">{o.rejected.map((r, i) => <li key={i}><span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{r.section}</span><p>{r.text}</p><ul className="list-disc pl-5 text-xs text-rd-800">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul></li>)}</ul>
              <p className="mt-2 text-xs text-ink-2">Rejected items are shown so you can see what was discarded and why. They were not added to the case.</p>
            </details>
          )}
        </div>
      )}
    </article>
  );
}

function TaskProposals({ run, stale }: { run: AiRun; stale: boolean }) {
  const list = run.output!.taskProposals;
  return (
    <section className={SECTION} data-testid="out-task-proposals" aria-label="Proposed tasks">
      <h4 className="text-sm font-semibold">Proposed tasks ({list.length}) — not created until you accept them</h4>
      <p className="mt-1 text-xs text-ink-2">These are suggestions for human analysts. Accepting one creates a normal Stage 2 task; no message is sent to anyone.</p>
      {list.length === 0 ? <p className="mt-2 text-xs text-muted">No task proposals survived validation.</p> : <ul className="mt-3 space-y-3">{list.map((p) => <li key={p.id}><TaskProposalCard run={run} p={p} stale={stale} /></li>)}</ul>}
    </section>
  );
}

function TaskProposalCard({ run, p, stale }: { run: AiRun; p: TaskProposal; stale: boolean }) {
  const { run: exec, errors, notice, clear } = useAction();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(p.title), [desc, setDesc] = useState(p.description), [who, setWho] = useState(p.assigneeId), [due, setDue] = useState(p.dueDate);
  const people = PEOPLE.filter((x) => x.sectorId === run.sectorId);
  const pending = p.status === "pending";
  const key = `${run.id}-${p.id}`;
  return (
    <div className={`rounded-lg border p-3 ${p.status === "accepted" ? "border-sg-500/50 bg-sg-100/50" : p.status === "discarded" ? "border-line bg-ivory-2 opacity-80" : "border-line"}`} data-testid={`proposal-${key}`} data-status={p.status}>
      <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{p.title}</span><span className="rounded-full border border-line bg-white px-2 py-0.5 text-xs font-semibold capitalize">{p.status}{p.edited ? " · edited" : ""}</span>{p.createdTaskId && <Link href={`/cases/${run.caseId}?tab=tasks&focus=${p.createdTaskId}`} className="font-mono text-xs text-em-700 underline" data-testid={`created-${key}`}>{p.createdTaskId}</Link>}</div>
      {!editing && <>
        <p className="mt-1 text-sm">{p.description || <em className="text-muted">No description.</em>}</p>
        <p className="mt-1 text-xs text-ink-2"><b>Rationale:</b> {p.rationale}</p>
        <p className="mt-1 text-xs text-ink-2">Proposed assignee: {personLabel(p.assigneeId)} · due {p.dueDate}</p>
        {p.citations.length > 0 && <p className="mt-1 text-xs">{p.citations.map((c) => <span key={`${c.evidenceId}${c.ref}`} className="mr-1"><CitationChip c={c} /></span>)}</p>}
      </>}
      {editing && (
        <div className="mt-2 space-y-2" data-testid={`edit-form-${key}`}>
          <TextField label="Task title" value={title} onChange={setTitle} required testId={`edit-title-${key}`} />
          <TextArea label="Description" value={desc} onChange={setDesc} rows={2} testId={`edit-desc-${key}`} />
          <div className="grid gap-2 sm:grid-cols-2">
            <SelectField label="Assignee (named, fictional)" value={who} onChange={setWho} options={people.map((x) => ({ value: x.id, label: `${x.name} — ${x.title}` }))} testId={`edit-who-${key}`} />
            <TextField label="Due date" type="date" value={due} onChange={setDue} testId={`edit-due-${key}`} />
          </div>
          <div className="flex gap-2"><Btn onClick={() => { const r = exec((w, c) => editTaskProposal(w, c, run.id, p.id, { title, description: desc, assigneeId: who, dueDate: due }), "Edits saved to the proposal. The case is unchanged until you accept it."); if (r.ok) setEditing(false); }} testId={`save-edit-${key}`}>Save edits</Btn><Btn kind="secondary" onClick={() => { setEditing(false); clear(); }}>Cancel</Btn></div>
        </div>
      )}
      {pending && !editing && (
        <Locked action="ai.review" what="edit, accept or discard assistant proposals">
          <div className="mt-2 flex flex-wrap gap-2">
            <Btn kind="secondary" onClick={() => { clear(); setEditing(true); }} testId={`edit-${key}`}>Edit</Btn>
            <Btn onClick={() => exec((w, c) => acceptTaskProposal(w, c, run.id, p.id), (v) => `Created task ${v.taskId}.`)} disabled={stale} testId={`accept-${key}`} title={stale ? "This run Needs refresh" : undefined}>Accept as task</Btn>
            <Btn kind="secondary" onClick={() => exec((w, c) => discardProposal(w, c, run.id, p.id), "Proposal discarded. The case was not changed.")} testId={`discard-${key}`}>Discard</Btn>
          </div>
          {stale && <p className="mt-1 text-xs text-am-800">Accepting is disabled while this run Needs refresh.</p>}
        </Locked>
      )}
      {!pending && p.decidedAt && <p className="mt-1 text-[11px] text-muted">{p.status === "accepted" ? "Accepted" : "Discarded"} by {p.decidedRole} (demonstration role) · {fmtDateTime(p.decidedAt)}</p>}
      <div className="mt-2 space-y-2"><ErrorList errors={errors} />{notice && <Notice>{notice}</Notice>}</div>
    </div>
  );
}

function BriefProposalView({ run, proposal: b, stale }: { run: AiRun; proposal: BriefProposal; stale: boolean }) {
  const { run: exec, errors, notice, clear } = useAction();
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState(b.content.decisionQuestion);
  const [fs, setFs] = useState(b.content.findings.map((f) => ({ id: f.id, text: f.text })));
  const [unc, setUnc] = useState(b.content.uncertainties.join("\n"));
  const [next, setNext] = useState(b.content.nextStep);
  const pending = b.status === "pending";
  return (
    <section className={`${SECTION} ${b.status === "accepted" ? "border-sg-500/50" : ""}`} data-testid="out-brief-proposal" data-status={b.status} aria-label="Proposed decision brief">
      <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold">Proposed decision brief — not saved until you accept it</h4><span className="rounded-full border border-line bg-white px-2 py-0.5 text-xs font-semibold capitalize">{b.status}{b.edited ? " · edited" : ""}</span>{b.createdBriefVersion && <Link href={`/cases/${run.caseId}?tab=brief&version=${b.createdBriefVersion}`} className="text-xs text-em-700 underline" data-testid="created-brief">Brief v{b.createdBriefVersion}</Link>}</div>
      <p className="mt-1 text-xs text-ink-2">Accepting creates a new brief version whose origin records this run. Evidence lists, expert findings and options come from the case record (the same deterministic template as Compile brief). No financial impact is calculated.</p>
      {!editing ? (
        <div className="mt-3 space-y-3 text-sm">
          <p><b>Decision question:</b> {b.content.decisionQuestion}</p>
          <div><b>Findings (cited):</b><ul className="mt-1 space-y-2">{b.content.findings.map((f) => <li key={f.id} data-testid={`brief-finding-${f.id}`}>{f.text}<br />{f.citations.map((c) => <span key={`${c.evidenceId}${c.ref}`} className="mr-1"><CitationChip c={c} /></span>)}{b.edited && <span className="text-[11px] text-muted"> (text may have been edited; citations are those of the original)</span>}</li>)}</ul></div>
          <div><b>Uncertainties:</b>{b.content.uncertainties.length ? <ul className="list-disc pl-5">{b.content.uncertainties.map((u) => <li key={u}>{u}</li>)}</ul> : <span className="text-muted"> none proposed</span>}</div>
          <p><b>Suggested next step:</b> {b.content.nextStep}</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2" data-testid="brief-edit-form">
          <TextArea label="Decision question" value={q} onChange={setQ} rows={2} testId="bp-question" />
          {fs.map((f, i) => <TextArea key={f.id} label={`Finding ${i + 1}`} value={f.text} onChange={(v) => setFs(fs.map((x) => (x.id === f.id ? { ...x, text: v } : x)))} rows={2} hint="Citations stay attached. Edited wording is not re-validated against the source." testId={`bp-finding-${f.id}`} />)}
          <TextArea label="Uncertainties (one per line)" value={unc} onChange={setUnc} rows={3} testId="bp-uncertainties" />
          <TextField label="Suggested next step" value={next} onChange={setNext} testId="bp-next" />
          <div className="flex gap-2"><Btn onClick={() => { const r = exec((w, c) => editBriefProposal(w, c, run.id, { decisionQuestion: q, findings: fs, uncertainties: unc.split("\n"), nextStep: next }), "Edits saved to the proposal. The case is unchanged until you accept it."); if (r.ok) setEditing(false); }} testId="bp-save">Save edits</Btn><Btn kind="secondary" onClick={() => { setEditing(false); clear(); }}>Cancel</Btn></div>
        </div>
      )}
      {pending && !editing && (
        <Locked action="ai.review" what="edit, accept or discard assistant proposals">
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn kind="secondary" onClick={() => { clear(); setEditing(true); }} testId="bp-edit">Edit</Btn>
            <Btn onClick={() => exec((w, c) => acceptBriefProposal(w, c, run.id), (v) => `Saved as brief v${v.version}.`)} disabled={stale} testId="bp-accept">Accept as new brief version</Btn>
            <Btn kind="secondary" onClick={() => exec((w, c) => discardProposal(w, c, run.id, b.id), "Brief draft discarded. The case was not changed.")} testId="bp-discard">Discard</Btn>
          </div>
          {stale && <p className="mt-1 text-xs text-am-800">Accepting is disabled while this run Needs refresh.</p>}
        </Locked>
      )}
      {!pending && b.decidedAt && <p className="mt-2 text-[11px] text-muted">{b.status === "accepted" ? "Accepted" : "Discarded"} by {b.decidedRole} (demonstration role) · {fmtDateTime(b.decidedAt)}</p>}
      <div className="mt-2 space-y-2"><ErrorList errors={errors} />{notice && <Notice>{notice}</Notice>}</div>
    </section>
  );
}
