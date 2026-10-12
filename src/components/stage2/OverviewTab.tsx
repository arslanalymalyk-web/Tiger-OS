"use client";

import { useState } from "react";
import { OBJECTIVES, PEOPLE, SECTOR_BY_ID } from "@/data";
import type { CaseAggregate, Priority } from "@/lib/stage2/types";
import { PRIORITIES } from "@/lib/stage2/types";
import { addNote, linkSignal, unlinkSignal, updateCase, updateNote, type NoteKind } from "@/lib/stage2/mutations";
import { can } from "@/lib/stage2/rules";
import { signalsWithoutActiveCase } from "@/lib/stage2/world";
import { DECISION_BY_ID, ENTITY_BY_ID, SIGNAL_BY_ID } from "@/lib/stage2/catalog";
import { useDemo } from "@/state/DemoProvider";
import { IdTag, SeverityBadge } from "../ui";
import { useRecordNav } from "@/lib/useRecordNav";
import { Btn, CardSection, ErrorList, Locked, Notice, SelectField, TextArea, TextField, useAction } from "./common";

export function OverviewTab({ c }: { c: CaseAggregate }) {
  const { role, world } = useDemo();
  const { run, errors, notice } = useAction();
  const { openRecord } = useRecordNav();
  const editable = can(role, "case.edit") && c.status !== "Closed";
  const [title, setTitle] = useState(c.title);
  const [question, setQuestion] = useState(c.question);
  const [summary, setSummary] = useState(c.summary);
  const [priority, setPriority] = useState<Priority>(c.priority);
  const [ownerId, setOwnerId] = useState(c.ownerId);
  const [dueDate, setDueDate] = useState(c.dueDate);
  const [entityIds, setEntityIds] = useState(c.entityIds);
  const [objectiveIds, setObjectiveIds] = useState(c.objectiveIds);
  const [sig, setSig] = useState("");
  const sector = SECTOR_BY_ID[c.sectorId];
  const analysts = PEOPLE.filter((p) => p.sectorId === c.sectorId && p.kind === "analyst");
  const candidateSignals = signalsWithoutActiveCase(world).filter((s) => s.sectorId === c.sectorId);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run((w, ctx) => updateCase(w, ctx, c.id, { title, question, summary, priority, ownerId, dueDate, entityIds, objectiveIds }), (v) => `Saved: ${v.changed.join(", ")}.`);
  };
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));

  return (
    <>
      <CardSection title="Case details">
        <form onSubmit={save} className="space-y-3" data-testid="case-details-form" noValidate>
          {!editable && <Locked action="case.edit" what="edit cases">{c.status === "Closed" ? <p className="rounded-lg bg-ivory-2 px-3 py-2 text-xs text-ink-2">Closed cases are read-only. Reopen the case to edit it.</p> : null}</Locked>}
          <TextField label="Title" value={title} onChange={setTitle} disabled={!editable} required testId="edit-title" />
          <TextArea label="Investigation question" value={question} onChange={setQuestion} rows={2} disabled={!editable} testId="edit-question" />
          <TextArea label="Summary" value={summary} onChange={setSummary} rows={2} disabled={!editable} testId="edit-summary" />
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField label="Priority" value={priority} onChange={(v) => setPriority(v as Priority)} options={PRIORITIES.map((p) => ({ value: p, label: p }))} disabled={!editable} testId="edit-priority" />
            <SelectField label="Owner" value={ownerId} onChange={setOwnerId} options={analysts.map((p) => ({ value: p.id, label: `${p.name} — ${p.title}` }))} disabled={!editable} testId="edit-owner" />
            <TextField label="Due date" type="date" value={dueDate} onChange={setDueDate} disabled={!editable} testId="edit-due" />
          </div>
          <fieldset disabled={!editable}>
            <legend className="mb-1 text-sm font-medium">Mandate objectives</legend>
            <div className="space-y-1">{OBJECTIVES.filter((o) => o.sectorId === c.sectorId).map((o) => (
              <label key={o.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={objectiveIds.includes(o.id)} onChange={(e) => setObjectiveIds(toggle(objectiveIds, o.id, e.target.checked))} className="mt-1" />{o.text}</label>
            ))}</div>
          </fieldset>
          <fieldset disabled={!editable}>
            <legend className="mb-1 text-sm font-medium">Affected entities</legend>
            <div className="grid gap-1 sm:grid-cols-2">{sector.entities.map((e) => (
              <label key={e.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={entityIds.includes(e.id)} onChange={(ev) => setEntityIds(toggle(entityIds, e.id, ev.target.checked))} className="mt-1" /><span>{e.name} <IdTag id={e.id} /></span></label>
            ))}</div>
          </fieldset>
          <ErrorList errors={errors} />
          {notice && <Notice>{notice}</Notice>}
          {editable && <Btn type="submit" testId="save-case">Save changes</Btn>}
        </form>
      </CardSection>

      <CardSection title={`Linked signals (${c.signalIds.length})`}>
        {c.signalIds.length === 0 ? <p className="text-sm text-muted">No signal is linked. This is a standalone case.</p> : (
          <ul className="divide-y divide-line-2">{c.signalIds.map((id) => { const s = SIGNAL_BY_ID[id]; return (
            <li key={id} className="flex flex-wrap items-center gap-3 py-2" data-testid={`linked-signal-${id}`}>
              {s && <SeverityBadge severity={s.severity} />}
              <button onClick={() => openRecord(id)} className="min-w-0 flex-1 text-left text-sm font-medium text-em-700 hover:underline">{s?.title ?? id}</button>
              <IdTag id={id} />
              {editable && <Btn kind="secondary" onClick={() => run((w, ctx) => unlinkSignal(w, ctx, c.id, id), `Unlinked ${id}.`)}>Unlink</Btn>}
            </li>); })}</ul>
        )}
        {editable && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1"><SelectField label="Link another signal" value={sig} onChange={setSig} placeholder="Choose a signal without an active case" options={candidateSignals.map((s) => ({ value: s.id, label: `${s.id} — ${s.title}` }))} testId="link-signal-select" hint="Signals that already have an active case are not offered." /></div>
            <Btn kind="secondary" disabled={!sig} onClick={() => { const r = run((w, ctx) => linkSignal(w, ctx, c.id, sig), `Linked ${sig}.`); if (r.ok) setSig(""); }} testId="link-signal">Link signal</Btn>
          </div>
        )}
      </CardSection>

      <CardSection title={`Decision proposals (${c.decisionIds.length})`}>
        <p className="mb-2 text-xs text-muted">Stage 1 decision records are proposals. No approval or execution is recorded in this stage.</p>
        {c.decisionIds.length === 0 ? <p className="text-sm text-muted">No decision proposal is linked to this case. A brief would offer “Prepare a decision proposal” as an option.</p> : (
          <ul className="space-y-2">{c.decisionIds.map((id) => { const d = DECISION_BY_ID[id]; return (
            <li key={id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3 text-sm"><button onClick={() => openRecord(id)} className="flex-1 text-left font-medium text-em-700 hover:underline">{d?.title ?? id}</button><IdTag id={id} /><span className="text-xs text-muted">Pending proposal{d?.amountSARm != null ? ` · SAR ${d.amountSARm.toLocaleString("en-US")} m (${d.amountKind})` : ""}</span></li>); })}</ul>
        )}
        <p className="mt-3 text-xs text-muted">Affected entities: {c.entityIds.map((id) => ENTITY_BY_ID[id]?.name ?? id).join(", ") || "none"}.</p>
      </CardSection>

      <div className="grid gap-5 lg:grid-cols-3">
        <NoteList c={c} kind="assumption" title="Assumptions" list={c.assumptions} editable={editable} />
        <NoteList c={c} kind="missing" title="Missing information" list={c.missing} editable={editable} />
        <NoteList c={c} kind="question" title="Unresolved questions" list={c.questions} editable={editable} />
      </div>
    </>
  );
}

function NoteList({ c, kind, title, list, editable }: { c: CaseAggregate; kind: NoteKind; title: string; list: CaseAggregate["assumptions"]; editable: boolean }) {
  const { run, errors } = useAction();
  const [text, setText] = useState("");
  return (
    <CardSection title={`${title} (${list.length})`}>
      {list.length === 0 ? <p className="text-sm text-muted">None recorded.</p> : (
        <ul className="space-y-2">{list.map((n) => (
          <li key={n.id} className="rounded-lg border border-line p-2.5 text-sm" data-testid={`note-${n.id}`}>
            <p className={n.resolved ? "text-muted line-through" : ""}>{n.text}</p>
            {editable && kind !== "assumption" && <div className="mt-1.5 flex gap-3 text-xs"><button className="font-medium text-em-700 underline" onClick={() => run((w, ctx) => updateNote(w, ctx, c.id, kind, n.id, { resolved: !n.resolved }))}>{n.resolved ? "Reopen" : "Mark resolved"}</button><button className="font-medium text-rd-800 underline" onClick={() => run((w, ctx) => updateNote(w, ctx, c.id, kind, n.id, { remove: true }))}>Remove</button></div>}
            {editable && kind === "assumption" && <button className="mt-1.5 text-xs font-medium text-rd-800 underline" onClick={() => run((w, ctx) => updateNote(w, ctx, c.id, kind, n.id, { remove: true }))}>Remove</button>}
          </li>))}</ul>
      )}
      {editable && (
        <div className="mt-3 space-y-2">
          <TextArea label={`Add to ${title.toLowerCase()}`} value={text} onChange={setText} rows={2} testId={`note-input-${kind}`} />
          <ErrorList errors={errors} />
          <Btn kind="secondary" onClick={() => { const r = run((w, ctx) => addNote(w, ctx, c.id, kind, text)); if (r.ok) setText(""); }} testId={`note-add-${kind}`}>Add</Btn>
        </div>
      )}
    </CardSection>
  );
}
