"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import { PEOPLE, PEOPLE_BY_ID, OBJECTIVES, SECTORS, SECTOR_BY_ID } from "@/data";
import type { SectorId } from "@/lib/types";
import { CASE_STATUSES, PRIORITIES, type CaseAggregate, type Priority } from "@/lib/stage2/types";
import { createCase } from "@/lib/stage2/mutations";
import { isBriefStale, latestBrief } from "@/lib/stage2/brief";
import { openReviews, reviewState } from "@/lib/stage2/rules";
import { activeCaseForSignal, signalsWithoutActiveCase } from "@/lib/stage2/world";
import { personName } from "@/lib/stage2/catalog";
import { useDemo } from "@/state/DemoProvider";
import { DemoTag, IdTag, SeverityBadge } from "../ui";
import { ModalDialog } from "../ModalDialog";
import { Btn, CaseStatusBadge, ErrorList, Locked, PriorityBadge, ReviewBadge, RoleNotice, SelectField, Skeleton, StaleBadge, TextArea, TextField, fmtDate, useAction } from "./common";
import { useId } from "react";

const PRIO_RANK: Record<Priority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export function CasesView() {
  const { world, hydrated, role } = useDemo();
  const sp = useSearchParams();
  const router = useRouter();
  const [sector, setSector] = useState<string>(sp.get("sector") ?? "");
  const [status, setStatus] = useState<string>("");
  const [priority, setPriority] = useState<string>("");
  const [owner, setOwner] = useState<string>("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState<{ signalId?: string } | null>(sp.get("new") ? { signalId: sp.get("signal") ?? undefined } : null);

  const owners = useMemo(() => [...new Set(world.cases.map((c) => c.ownerId))].map((id) => ({ value: id, label: personName(id) })).sort((a, b) => a.label.localeCompare(b.label)), [world]);
  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return world.cases
      .filter((c) => (!sector || c.sectorId === sector) && (!status || c.status === status) && (!priority || c.priority === priority) && (!owner || c.ownerId === owner))
      .filter((c) => { const t = `${c.id} ${c.title} ${c.question} ${c.summary} ${personName(c.ownerId)}`.toLowerCase(); return terms.every((x) => t.includes(x)); })
      .sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  }, [world, sector, status, priority, owner, q]);
  const untriaged = useMemo(() => signalsWithoutActiveCase(world).filter((s) => !sector || s.sectorId === sector), [world, sector]);
  const anyFilter = !!(sector || status || priority || owner || q);
  const clear = () => { setSector(""); setStatus(""); setPriority(""); setOwner(""); setQ(""); };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Investigation</p>
          <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Intelligence cases</h1>
          <p className="mt-2 max-w-3xl text-[15px] text-ink-2">Investigate a signal, link inspectable evidence, request expert review and compile a decision brief. Cases here are local demonstration records; no decision is approved or executed. <DemoTag className="ml-1 align-middle" /></p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {hydrated && role === "Analyst" ? <Btn onClick={() => setCreating({})} testId="new-case-button"><Plus size={16} aria-hidden />New case</Btn> : null}
          <Locked action="case.create" what="create cases"><span /></Locked>
        </div>
      </header>
      <RoleNotice />

      <section className="card p-4" aria-label="Filters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label htmlFor="case-search" className="mb-1 block text-sm font-medium">Search cases</label>
            <div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><input id="case-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, question, ID or owner" className="w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm" data-testid="case-search" /></div>
          </div>
          <SelectField label="Sector" value={sector} onChange={setSector} placeholder="All sectors" options={SECTORS.map((s) => ({ value: s.id, label: s.short }))} testId="filter-sector" />
          <SelectField label="Status" value={status} onChange={setStatus} placeholder="All statuses" options={CASE_STATUSES.map((s) => ({ value: s, label: s }))} testId="filter-status" />
          <SelectField label="Priority" value={priority} onChange={setPriority} placeholder="All priorities" options={PRIORITIES.map((s) => ({ value: s, label: s }))} testId="filter-priority" />
          <SelectField label="Owner" value={owner} onChange={setOwner} placeholder="All owners" options={owners} testId="filter-owner" />
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-ink-2">
          <p aria-live="polite" data-testid="case-count">{hydrated ? `${filtered.length} of ${world.cases.length} cases` : "Loading…"}</p>
          {anyFilter && <button onClick={clear} className="inline-flex items-center gap-1 font-medium text-em-700 underline underline-offset-2" data-testid="clear-filters"><X size={14} aria-hidden />Clear filters</button>}
        </div>
      </section>

      {!hydrated ? <Skeleton /> : filtered.length === 0 ? (
        <div className="card p-8 text-center" data-testid="cases-empty">
          <p className="font-serif text-xl">No cases match these filters</p>
          <p className="mt-1 text-sm text-ink-2">Try a different search, or clear the filters to see all {world.cases.length} cases.</p>
          <div className="mt-4"><Btn onClick={clear} kind="secondary">Clear filters</Btn></div>
        </div>
      ) : (
        <>
          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Cases table (scrollable)">
              <table className="w-full min-w-[900px] text-left text-sm" data-testid="cases-table">
                <thead className="bg-ivory-2 text-xs text-muted"><tr><th className="p-3 font-semibold">Case</th><th className="p-3 font-semibold">Sector</th><th className="p-3 font-semibold">Status</th><th className="p-3 font-semibold">Priority</th><th className="p-3 font-semibold">Owner</th><th className="p-3 font-semibold">Due</th><th className="p-3 font-semibold">Review · Brief</th></tr></thead>
                <tbody>{filtered.map((c) => <CaseRow key={c.id} c={c} />)}</tbody>
              </table>
            </div>
          </div>
          <ul className="space-y-3 md:hidden">{filtered.map((c) => <li key={c.id}><CaseCard c={c} /></li>)}</ul>
        </>
      )}

      <section className="card p-4 sm:p-5" aria-label="Signals without an active case">
        <h2 className="text-sm font-semibold">Signals without an active case <span className="ml-1 rounded-full bg-ivory-2 px-2 text-xs text-muted">{hydrated ? untriaged.length : "…"}</span></h2>
        <p className="mb-3 mt-1 text-xs text-muted">Every other signal already has an active case. Creating a second case for a signal is blocked; you are offered the existing case instead.</p>
        {hydrated && untriaged.length === 0 ? <p className="text-sm text-muted">Every signal in this view has an active case.</p> : (
          <ul className="divide-y divide-line-2">{untriaged.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5" data-testid={`untriaged-${s.id}`}>
              <SeverityBadge severity={s.severity} />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{s.title}</span><span className="text-[11px] text-muted">{SECTOR_BY_ID[s.sectorId].sector.short} · <IdTag id={s.id} /></span></span>
              {hydrated && role === "Analyst" ? <Btn kind="secondary" onClick={() => setCreating({ signalId: s.id })} testId={`create-from-${s.id}`}>Create case</Btn> : <span className="text-xs text-muted">Analyst action</span>}
            </li>
          ))}</ul>
        )}
      </section>

      {creating && <CreateCaseDialog initialSignalId={creating.signalId} onClose={() => setCreating(null)} onCreated={(id) => { setCreating(null); router.push(`/cases/${id}`); }} />}
    </div>
  );
}

function CaseRow({ c }: { c: CaseAggregate }) {
  const rv = c.reviews.map(reviewState);
  const open = openReviews(c).length;
  return (
    <tr className="border-t border-line-2 align-top hover:bg-sg-50" data-testid={`case-row-${c.id}`}>
      <td className="p-3"><Link href={`/cases/${c.id}`} className="font-medium text-em-700 hover:underline">{c.title}</Link><div className="mt-0.5"><IdTag id={c.id} /></div></td>
      <td className="p-3 text-xs">{SECTOR_BY_ID[c.sectorId].sector.short}</td>
      <td className="p-3"><CaseStatusBadge status={c.status} /></td>
      <td className="p-3"><PriorityBadge priority={c.priority} /></td>
      <td className="p-3 text-xs">{personName(c.ownerId)}</td>
      <td className="p-3 text-xs tabular-nums">{fmtDate(c.dueDate)}</td>
      <td className="space-y-1 p-3 text-xs">{rv.length ? <ReviewBadge state={open ? "Requested" : rv[rv.length - 1]} /> : <span className="text-muted">No review</span>}<div>{latestBrief(c) ? (isBriefStale(c) ? <StaleBadge /> : <span className="text-ink-2">Brief v{latestBrief(c)!.version}</span>) : <span className="text-muted">No brief</span>}</div></td>
    </tr>
  );
}
function CaseCard({ c }: { c: CaseAggregate }) {
  const open = openReviews(c).length;
  return (
    <Link href={`/cases/${c.id}`} className="card block p-4 hover:border-em-600" data-testid={`case-card-${c.id}`}>
      <div className="flex flex-wrap items-center gap-2"><CaseStatusBadge status={c.status} /><PriorityBadge priority={c.priority} /><IdTag id={c.id} /></div>
      <p className="mt-2 font-medium text-ink">{c.title}</p>
      <p className="mt-1 text-xs text-muted">{SECTOR_BY_ID[c.sectorId].sector.short} · {personName(c.ownerId)} · due {fmtDate(c.dueDate)}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">{open ? <ReviewBadge state="Requested" /> : null}{latestBrief(c) && isBriefStale(c) ? <StaleBadge /> : null}</div>
    </Link>
  );
}

export function CreateCaseDialog({ initialSignalId, onClose, onCreated }: { initialSignalId?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { world } = useDemo();
  const { run, errors, clear } = useAction();
  const titleId = useId();
  const initSignal = initialSignalId ? world.signals.find((s) => s.id === initialSignalId) : undefined;
  const [signalId, setSignalId] = useState(initialSignalId ?? "");
  const [sectorId, setSectorId] = useState<SectorId>(initSignal?.sectorId ?? "logistics");
  const [title, setTitle] = useState(initSignal ? initSignal.title : "");
  const [question, setQuestion] = useState("");
  const [summary, setSummary] = useState(initSignal?.summary ?? "");
  const analysts = PEOPLE.filter((p) => p.kind === "analyst" && p.sectorId === sectorId);
  const [ownerId, setOwnerId] = useState(analysts[0]?.id ?? "");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [dueDate, setDueDate] = useState("2026-11-02");
  const [objectiveIds, setObjectiveIds] = useState<string[]>([]);
  const signal = signalId ? world.signals.find((s) => s.id === signalId) : undefined;
  const existing = signal ? activeCaseForSignal(world, signal.id) : undefined;

  const pickSignal = (id: string) => {
    clear(); setSignalId(id);
    const s = world.signals.find((x) => x.id === id);
    if (s) { setSectorId(s.sectorId); setOwnerId(PEOPLE.find((p) => p.kind === "analyst" && p.sectorId === s.sectorId)!.id); setObjectiveIds([]); if (!title) setTitle(s.title); if (!summary) setSummary(s.summary); }
  };
  const pickSector = (id: SectorId) => { setSectorId(id); setOwnerId(PEOPLE.find((p) => p.kind === "analyst" && p.sectorId === id)!.id); setObjectiveIds([]); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = run((w, ctx) => createCase(w, ctx, { sectorId, title, question, summary, ownerId, priority, dueDate, signalIds: signal ? [signal.id] : [], entityIds: signal?.entityIds ?? [], objectiveIds }));
    if (res.ok) onCreated(res.value.caseId);
  };
  const dupCaseId = !existing ? undefined : existing.id;
  void PEOPLE_BY_ID;

  return createPortal(
    <ModalDialog labelledBy={titleId} onClose={onClose} className="m-auto max-h-[92vh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl bg-ivory p-0 text-ink shadow-2xl outline-none backdrop:bg-em-950/50">
      <form onSubmit={submit} className="space-y-4 p-5 sm:p-6" data-testid="create-case-dialog" noValidate>
        <div className="flex items-start justify-between gap-3"><h2 id={titleId} className="font-serif text-xl">{signalId ? "Create case from signal" : "New case"}</h2><button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 hover:bg-ivory-2"><X size={18} /></button></div>
        <SelectField label="Linked signal (optional)" value={signalId} onChange={pickSignal} placeholder="No signal — standalone case" testId="create-signal"
          options={world.signals.map((s) => ({ value: s.id, label: `${s.id} — ${s.title}` }))} hint="Choose a signal to create the case from it. A signal can have only one active case." />
        {existing && (
          <div role="alert" className="rounded-lg border border-am-600/40 bg-am-100 p-3 text-sm text-am-800" data-testid="duplicate-warning">
            <p className="font-semibold">{signal!.id} already has an active case.</p>
            <p className="mt-1">{existing.id} “{existing.title}” is {existing.status}. Open it instead of creating a duplicate.</p>
            <p className="mt-2"><Link href={`/cases/${dupCaseId}`} className="font-semibold text-em-800 underline" data-testid="open-existing-case" onClick={onClose}>Open {existing.id}</Link></p>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Sector" value={sectorId} onChange={(v) => pickSector(v as SectorId)} disabled={!!signal} options={SECTORS.map((s) => ({ value: s.id, label: s.short }))} testId="create-sector" />
          <SelectField label="Owner (analyst)" value={ownerId} onChange={setOwnerId} options={analysts.map((p) => ({ value: p.id, label: `${p.name} — ${p.title}` }))} testId="create-owner" />
        </div>
        <TextField label="Title" value={title} onChange={setTitle} required testId="create-title" />
        <TextArea label="Investigation question" value={question} onChange={setQuestion} rows={2} hint="What must the investigation answer? Needed before moving to Investigating." testId="create-question" />
        <TextArea label="Summary" value={summary} onChange={setSummary} rows={2} testId="create-summary" />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Priority" value={priority} onChange={(v) => setPriority(v as Priority)} options={PRIORITIES.map((p) => ({ value: p, label: p }))} testId="create-priority" />
          <TextField label="Due date" type="date" value={dueDate} onChange={setDueDate} testId="create-due" />
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Mandate objectives</legend>
          <div className="space-y-1">{OBJECTIVES.filter((o) => o.sectorId === sectorId).map((o) => (
            <label key={o.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={objectiveIds.includes(o.id)} onChange={(e) => setObjectiveIds(e.target.checked ? [...objectiveIds, o.id] : objectiveIds.filter((x) => x !== o.id))} className="mt-1" />{o.text}</label>
          ))}</div>
        </fieldset>
        <ErrorList errors={errors} />
        <div className="flex flex-wrap justify-end gap-2">
          <Btn kind="secondary" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" disabled={!!existing} testId="create-submit">{existing ? "Blocked: signal already has a case" : "Create case"}</Btn>
        </div>
      </form>
    </ModalDialog>,
    document.body,
  );
}
