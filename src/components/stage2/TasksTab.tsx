"use client";

import { useState } from "react";
import Link from "next/link";
import { PEOPLE, PEOPLE_BY_ID, SECTOR_BY_ID } from "@/data";
import { TASK_STATUSES, type CaseAggregate, type Task, type TaskStatus } from "@/lib/stage2/types";
import { addTask, setTaskStatus, updateTask } from "@/lib/stage2/mutations";
import { can } from "@/lib/stage2/rules";
import { personLabel } from "@/lib/stage2/catalog";
import { useDemo } from "@/state/DemoProvider";
import { Btn, CardSection, ErrorList, Locked, Notice, SelectField, TextArea, TextField, fmtDate, useAction } from "./common";

export function TasksTab({ c }: { c: CaseAggregate }) {
  const { role } = useDemo();
  const canEdit = can(role, "task.edit") && c.status !== "Closed";
  return (
    <>
      <p className="rounded-lg border border-dashed border-gd-500/60 bg-gd-100/50 p-3 text-sm text-ink-2" role="note">These are <b>human investigation assignments</b> for named people. They are not executed by an AI agent. The AI assistance tab can propose tasks, but a proposal becomes a task only when an Analyst accepts it.</p>
      <CardSection title={`Investigation tasks (${c.tasks.length})`}>
        {c.tasks.length === 0 ? <p className="text-sm text-muted">No tasks yet.</p> : <ul className="space-y-3">{c.tasks.map((t) => <TaskCard key={t.id} c={c} t={t} />)}</ul>}
        {!canEdit && <div className="mt-3"><Locked action="task.edit" what="assign tasks"><span /></Locked></div>}
      </CardSection>
      {canEdit && <TaskForm c={c} />}
    </>
  );
}

function TaskCard({ c, t }: { c: CaseAggregate; t: Task }) {
  const { role } = useDemo();
  const { run, errors, notice, clear } = useAction();
  const assignee = PEOPLE_BY_ID[t.assigneeId];
  const [findings, setFindings] = useState(t.findings);
  const [note, setNote] = useState(t.completionNote);
  const [completing, setCompleting] = useState(false);
  const closed = c.status === "Closed";
  const mayProgress = !closed && can(role, "task.progress") && !(role === "Expert" && assignee?.kind === "analyst");
  return (
    <li className="rounded-lg border border-line p-3" data-testid={`task-${t.id}`} id={`focus-${t.id}`}>
      <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{t.title}</span><code className="font-mono text-[11px] text-muted">{t.id}</code><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${t.status === "Done" ? "border-sg-500/40 bg-sg-100 text-sg-700" : t.status === "Blocked" ? "border-am-600/30 bg-am-100 text-am-800" : "border-line bg-ivory-2"}`} data-testid={`task-status-${t.id}`}>{t.status}</span></div>
      {t.origin && <p className="mt-1 text-xs text-ink-2" data-testid={`task-origin-${t.id}`}>Created from assistant proposal <b>{t.origin.runId}</b> ({t.origin.mode === "ai" ? `AI-generated · ${t.origin.provider} · ${t.origin.model}` : t.origin.mode === "deterministic" ? "deterministic demonstration, not AI" : "mocked provider, not AI"}), accepted {fmtDate(t.origin.acceptedAt)}{t.origin.edited ? " after Analyst edits" : ""}.</p>}
      <p className="mt-1 text-xs text-ink-2">Assignee: <b>{personLabel(t.assigneeId)}</b> ({assignee?.kind}) · due {fmtDate(t.dueDate)}</p>
      {t.description && <p className="mt-1 text-sm">{t.description}</p>}
      {t.evidenceIds.length > 0 && <p className="mt-1 text-xs text-muted">Evidence: {t.evidenceIds.map((id) => <Link key={id} href={`/evidence/${id}`} className="mr-2 font-mono text-em-700 underline">{id}</Link>)}</p>}
      {t.findings && <p className="mt-2 rounded bg-ivory-2 p-2 text-sm"><b>Findings:</b> {t.findings}{t.completionNote && <><br /><b>Completion note:</b> {t.completionNote}</>}</p>}
      {mayProgress ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-44"><SelectField label="Status" value={t.status} onChange={(v) => { clear(); if (v === "Done") setCompleting(true); else run((w, ctx) => setTaskStatus(w, ctx, c.id, t.id, v as TaskStatus), `Task is now ${v}.`); }} options={TASK_STATUSES.map((s) => ({ value: s, label: s }))} testId={`task-select-${t.id}`} /></div>
            {t.status !== "Done" && <Btn kind="secondary" onClick={() => { clear(); setCompleting(true); }} testId={`task-complete-${t.id}`}>Complete task…</Btn>}
          </div>
          {completing && (
            <div className="space-y-2 rounded-lg bg-ivory p-3" data-testid={`complete-form-${t.id}`}>
              <TextArea label="Findings" value={findings} onChange={setFindings} rows={2} required hint="What did the work establish?" testId={`task-findings-${t.id}`} />
              <TextField label="Completion note" value={note} onChange={setNote} required testId={`task-note-${t.id}`} />
              <div className="flex gap-2"><Btn onClick={() => { const r = run((w, ctx) => setTaskStatus(w, ctx, c.id, t.id, "Done", { findings, completionNote: note }), "Task completed."); if (r.ok) setCompleting(false); }} testId={`task-confirm-${t.id}`}>Mark done</Btn><Btn kind="secondary" onClick={() => { setCompleting(false); clear(); }}>Cancel</Btn></div>
            </div>
          )}
          <ErrorList errors={errors} />
          {notice && <Notice>{notice}</Notice>}
        </div>
      ) : <p className="mt-2 text-xs text-muted">{closed ? "Closed case: read-only." : role === "Expert" && assignee?.kind === "analyst" ? "The Expert demonstration role can progress only tasks assigned to experts and specialists." : `The ${role} demonstration role cannot change task status.`}</p>}
    </li>
  );
}

function TaskForm({ c }: { c: CaseAggregate }) {
  const { run, errors, notice } = useAction();
  const people = PEOPLE.filter((p) => p.sectorId === c.sectorId);
  const evidence = SECTOR_BY_ID[c.sectorId].evidence.filter((e) => e.versions?.length);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState(people[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("2026-10-26");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  void updateTask;
  return (
    <CardSection title="Assign a new investigation task">
      <form className="space-y-3" noValidate data-testid="task-form" onSubmit={(e) => { e.preventDefault(); const r = run((w, ctx) => addTask(w, ctx, c.id, { title, description, assigneeId, dueDate, evidenceIds }), "Task assigned."); if (r.ok) { setTitle(""); setDescription(""); setEvidenceIds([]); } }}>
        <TextField label="Task title" value={title} onChange={setTitle} required testId="task-title" />
        <TextArea label="Description" value={description} onChange={setDescription} rows={2} testId="task-description" />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Assignee (named, fictional)" value={assigneeId} onChange={setAssigneeId} options={people.map((p) => ({ value: p.id, label: `${p.name} — ${p.title} (${p.kind})` }))} testId="task-assignee" />
          <TextField label="Due date" type="date" value={dueDate} onChange={setDueDate} testId="task-due" />
        </div>
        <fieldset className="rounded-lg border border-line p-3"><legend className="px-1 text-sm font-medium">Linked evidence (optional)</legend>
          <div className="grid gap-1 sm:grid-cols-2">{evidence.map((e) => <label key={e.id} className="flex items-start gap-2 text-xs"><input type="checkbox" checked={evidenceIds.includes(e.id)} onChange={(ev) => setEvidenceIds(ev.target.checked ? [...evidenceIds, e.id] : evidenceIds.filter((x) => x !== e.id))} className="mt-0.5" />{e.id} — {e.title}</label>)}</div>
        </fieldset>
        <ErrorList errors={errors} />
        {notice && <Notice>{notice}</Notice>}
        <Btn type="submit" testId="task-add">Assign task</Btn>
      </form>
    </CardSection>
  );
}
