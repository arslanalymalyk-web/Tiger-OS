"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, X } from "lucide-react";
import type { Decision, Entity, Evidence, IntelligenceCase, MetricDef, Signal } from "@/lib/types";
import {
  CROSS_LINKS, SECTOR_BY_ID, computeMetric, fmtNum, fmtTime, getRecord, recordKind, recordTitle, referencedBy, type RecordKind, KIND_LABEL,
} from "@/data";
import { useRecordNav } from "@/lib/useRecordNav";
import { useDemo } from "@/state/DemoProvider";
import { DemoTag, IdTag, KindChip, Section, SeverityBadge, StageBoundary, StatusPill } from "./ui";

function RecLink({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const k = recordKind(id);
  return (
    <button onClick={() => onOpen(id)} className="group flex w-full items-start gap-2 rounded-lg border border-line bg-white p-2.5 text-left hover:border-em-600 hover:bg-sg-50">
      <span className="mt-0.5 shrink-0">{k && <KindChip kind={k} />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{recordTitle(id)}</span>
        <span className="font-mono text-[11px] text-muted">{id}</span>
      </span>
      <ArrowRight size={14} className="mt-1 shrink-0 text-muted group-hover:text-em-700" aria-hidden />
    </button>
  );
}
const RecList = ({ ids, onOpen, empty = "None" }: { ids: string[]; onOpen: (id: string) => void; empty?: string }) =>
  ids.length ? <div className="space-y-1.5">{ids.map((i) => <RecLink key={i} id={i} onOpen={onOpen} />)}</div> : <p className="text-sm text-muted">{empty}</p>;
const Assumptions = ({ items }: { items: string[] }) => (
  <Section title="Assumptions"><ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{items.map((a) => <li key={a}>{a}</li>)}</ul></Section>
);
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt><dd className="text-sm text-ink">{children}</dd></div>
);

/** Signal → case → decision path, each step clickable. */
function FlowPath({ current }: { current: string }) {
  const { openRecord } = useRecordNav();
  const r = getRecord(current);
  if (!r) return null;
  let sig: string[] = [], cas: string[] = [], dec: string[] = [];
  if (r.kind === "signal") { sig = [r.data.id]; cas = [r.data.caseId]; dec = (getRecord(r.data.caseId)?.data as IntelligenceCase | undefined)?.decisionIds ?? []; }
  else if (r.kind === "case") { sig = r.data.signalIds; cas = [r.data.id]; dec = r.data.decisionIds; }
  else if (r.kind === "decision") { sig = r.data.signalIds; cas = [r.data.caseId]; dec = [r.data.id]; }
  else return null;
  const col = (label: string, ids: string[]) => (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="space-y-1">
        {ids.length ? ids.map((i) => (
          <button key={i} onClick={() => i !== current && openRecord(i)} aria-current={i === current ? "true" : undefined}
            className={`block w-full truncate rounded border px-2 py-1 text-left font-mono text-[11px] ${i === current ? "border-em-700 bg-em-800 text-white" : "border-line bg-white text-ink-2 hover:border-em-600"}`}>{i}</button>
        )) : <span className="text-xs text-muted">—</span>}
      </div>
    </div>
  );
  return (
    <nav aria-label="Signal to case to decision path" className="flex items-start gap-1.5 rounded-lg bg-ivory-2 p-3">
      {col("Signal", sig)}<ArrowRight size={14} className="mt-6 shrink-0 text-muted" aria-hidden />{col("Case", cas)}<ArrowRight size={14} className="mt-6 shrink-0 text-muted" aria-hidden />{col("Decision", dec)}
    </nav>
  );
}

function MetricBody({ m, open }: { m: MetricDef; open: (id: string) => void }) {
  const c = computeMetric(m);
  const sigs = SECTOR_BY_ID[m.sectorId].signals.filter((s) => s.metricId === m.id).map((s) => s.id);
  return (
    <>
      <div className="rounded-xl bg-sg-50 p-4">
        <div className="flex flex-wrap items-baseline gap-2"><span className="font-serif text-4xl text-em-900 tabular-nums">{fmtNum(c.value, m.decimals)}</span><span className="text-sm text-ink-2">{m.unit}</span></div>
        <p className="mt-1 text-sm text-muted">{m.period}</p>
        <div className="mt-2"><StatusPill status={c.status} /></div>
        {m.thresholdNote && <p className="mt-2 text-xs text-muted">{m.thresholdNote}</p>}
      </div>
      <Section title="Formula"><p className="rounded-lg bg-ivory-2 p-3 font-mono text-xs leading-relaxed text-ink-2">{m.formula}</p></Section>
      <dl className="grid grid-cols-2 gap-3"><Field label="Theme">{m.theme}</Field><Field label="Aggregation">{m.additive ? "Additive (may be summed)" : "Non-additive indicator (never summed across entities or sectors)"}</Field></dl>
      <Section title={`Contributing records (${c.sources.length})`}><RecList ids={c.sources} onOpen={open} /></Section>
      <Section title="Related signals"><RecList ids={sigs} onOpen={open} empty="No signal currently linked to this metric." /></Section>
      <Assumptions items={m.assumptions} />
    </>
  );
}

function SignalBody({ s, open }: { s: Signal; open: (id: string) => void }) {
  return (
    <>
      <FlowPath current={s.id} />
      <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={s.severity} /><span className="text-xs text-muted">Detected {fmtTime(s.detectedAt)}</span></div>
      <p className="text-sm leading-relaxed text-ink-2">{s.summary}</p>
      <Section title="Linked case"><RecList ids={[s.caseId]} onOpen={open} /></Section>
      {s.metricId && <Section title="Metric"><RecList ids={[s.metricId]} onOpen={open} /></Section>}
      <Section title="Related entities"><RecList ids={s.entityIds} onOpen={open} /></Section>
      <Section title="Evidence references (illustrative)"><RecList ids={s.evidenceIds} onOpen={open} /></Section>
      <Assumptions items={s.assumptions} />
      <StageBoundary stage={2} capability="Signal triage and case creation">Signals are seeded. Triage, acknowledgement and case creation arrive with case management.</StageBoundary>
    </>
  );
}

function CaseBody({ c, open }: { c: IntelligenceCase; open: (id: string) => void }) {
  const { role } = useDemo();
  return (
    <>
      <FlowPath current={c.id} />
      <dl className="grid grid-cols-2 gap-3">
        <Field label="Status">{c.status}</Field><Field label="Owner">{c.owner}</Field><Field label="Opened">{fmtTime(c.openedAt)}</Field>
        <Field label="Expert input">{c.expertInputRequested ? (role === "Expert" ? "Requested — in your queue" : "Requested") : "Not requested"}</Field>
      </dl>
      <p className="text-sm leading-relaxed text-ink-2">{c.summary}</p>
      <Section title="Next step"><p className="text-sm text-ink-2">{c.nextStep}</p></Section>
      <Section title="Linked signals"><RecList ids={c.signalIds} onOpen={open} /></Section>
      <Section title="Linked decisions"><RecList ids={c.decisionIds} onOpen={open} /></Section>
      <Section title="Related entities"><RecList ids={c.entityIds} onOpen={open} /></Section>
      <Section title="Evidence references (illustrative)"><RecList ids={c.evidenceIds} onOpen={open} /></Section>
      <Assumptions items={c.assumptions} />
      <StageBoundary stage={2} capability="Case workspace">Notes, tasks, status changes and evidence review are not available in Stage 1; this view is read-only.</StageBoundary>
      {c.expertInputRequested && <StageBoundary stage={4} capability="Expert collaboration">Expert comments and attachments are not available in Stage 1.</StageBoundary>}
    </>
  );
}

function DecisionBody({ d, open }: { d: Decision; open: (id: string) => void }) {
  const { role } = useDemo();
  const kindText = { commitment: "New commitment (additive)", reallocation: "Reallocation of existing capital (not additive)", none: "No amount" }[d.amountKind];
  return (
    <>
      <FlowPath current={d.id} />
      <dl className="grid grid-cols-2 gap-3">
        <Field label="Status">Pending</Field><Field label="Decision type">{d.decisionType}</Field><Field label="Proposed by">{d.proposedBy}</Field><Field label="Due by">{d.dueBy}</Field>
        <Field label="Amount">{d.amountSARm === null ? "—" : `SAR ${fmtNum(d.amountSARm)} m`}</Field><Field label="Amount type">{kindText}</Field>
      </dl>
      <p className="text-xs text-muted">{d.amountNote}</p>
      <p className="text-sm leading-relaxed text-ink-2">{d.summary}</p>
      <Section title="Options">
        <ul className="space-y-1.5">{d.options.map((o) => <li key={o.label} className="rounded-lg border border-line bg-white p-2.5 text-sm"><span className="font-semibold">{o.label}.</span> <span className="text-ink-2">{o.effect}</span></li>)}</ul>
      </Section>
      <Section title="Proposed recommendation"><p className="text-sm text-ink-2">{d.recommendation}</p></Section>
      <Section title="Linked case"><RecList ids={[d.caseId]} onOpen={open} /></Section>
      <Section title="Linked signals"><RecList ids={d.signalIds} onOpen={open} /></Section>
      <Section title="Related entities"><RecList ids={d.entityIds} onOpen={open} /></Section>
      <Section title="Evidence references (illustrative)"><RecList ids={d.evidenceIds} onOpen={open} /></Section>
      <Assumptions items={d.assumptions} />
      <StageBoundary stage={6} capability="Approval workflow">
        {role === "Approver" ? "As the simulated Approver you would decide here. " : `The ${role} role cannot approve in the full product. `}
        Recording approvals, delegated authority and audit trail are not available in Stage 1; decisions stay pending.
      </StageBoundary>
    </>
  );
}

function EntityBody({ e, open }: { e: Entity; open: (id: string) => void }) {
  const sec = SECTOR_BY_ID[e.sectorId];
  const refs = referencedBy(e.id);
  const group = (k: RecordKind) => refs.filter((r) => r.kind === k).map((r) => r.id);
  const links = CROSS_LINKS.filter((l) => l.fromEntityId === e.id || l.toEntityId === e.id);
  return (
    <>
      <p className="text-sm text-ink-2">{e.description}</p>
      <dl className="grid grid-cols-2 gap-3"><Field label="Category">{e.category}</Field><Field label="Entity">{sec.sector.entityName}</Field></dl>
      {e.excludeFromGroupTotal && <div className="rounded-lg border border-gd-500/50 bg-gd-100 p-3 text-sm text-ink-2"><b>Excluded from Group totals.</b> {e.excludeFromGroupTotal}</div>}
      <Section title="Attributes (latest period)">
        <table className="w-full text-sm"><tbody>{Object.entries(e.attrs).map(([k, v]) => (
          <tr key={k} className="border-b border-line-2"><td className="py-1.5 pr-2 text-ink-2">{sec.sector.attrs[k]?.label ?? k}</td><td className="py-1.5 text-right font-medium tabular-nums">{fmtNum(v, v % 1 ? 1 : 0)} <span className="text-xs text-muted">{sec.sector.attrs[k]?.unit}</span></td></tr>
        ))}</tbody></table>
      </Section>
      {e.series && (
        <Section title={`History (${sec.sector.periods[0]} – ${sec.sector.periods.at(-1)})`}>
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-muted"><th className="p-1 text-left">Series</th>{sec.sector.periods.map((p) => <th key={p} className="p-1 text-right">{p}</th>)}</tr></thead>
            <tbody>{Object.entries(e.series).map(([k, arr]) => <tr key={k} className="border-t border-line-2"><td className="p-1">{sec.sector.attrs[k]?.label ?? k}</td>{arr.map((v, i) => <td key={i} className="p-1 text-right tabular-nums">{fmtNum(v, v % 1 ? 1 : 0)}</td>)}</tr>)}</tbody></table></div>
        </Section>
      )}
      {e.dependsOn && <Section title="Depends on"><RecList ids={e.dependsOn} onOpen={open} /></Section>}
      <Section title="Dependants"><RecList ids={group("entity")} onOpen={open} empty="No entity depends on this one." /></Section>
      <Section title="Signals"><RecList ids={group("signal")} onOpen={open} /></Section>
      <Section title="Cases"><RecList ids={group("case")} onOpen={open} /></Section>
      <Section title="Decisions"><RecList ids={group("decision")} onOpen={open} /></Section>
      <Section title="Metrics using this record"><RecList ids={group("metric")} onOpen={open} /></Section>
      {links.length > 0 && (
        <Section title="Cross-sector relationships (not summed)">
          <ul className="space-y-2">{links.map((l) => { const other = l.fromEntityId === e.id ? l.toEntityId : l.fromEntityId; return <li key={l.id} className="text-sm text-ink-2"><p className="mb-1">{l.nature}</p><RecLink id={other} onOpen={open} /></li>; })}</ul>
        </Section>
      )}
    </>
  );
}

function EvidenceBody({ ev, open }: { ev: Evidence; open: (id: string) => void }) {
  const refs = referencedBy(ev.id).map((r) => r.id);
  return (
    <>
      <div className="rounded-lg border border-gd-500/50 bg-gd-100 p-3 text-sm text-ink-2"><b>Illustrative evidence.</b> This record describes a fictional document. There is no underlying file to open in Stage 1.</div>
      <dl className="grid grid-cols-2 gap-3"><Field label="Type">{ev.kind}</Field><Field label="Source (fictional)">{ev.source}</Field><Field label="As of">{ev.asOf}</Field></dl>
      <p className="text-sm leading-relaxed text-ink-2">{ev.summary}</p>
      <Section title="Cited by"><RecList ids={refs} onOpen={open} /></Section>
      <StageBoundary stage={2} capability="Evidence inspection">Opening and annotating source documents is not available in Stage 1.</StageBoundary>
    </>
  );
}

export function RecordDrawer() {
  const sp = useSearchParams();
  const id = sp.get("r");
  const { openRecord, closeRecord } = useRecordNav();
  const rec = getRecord(id);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rec) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRecord();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [rec?.data.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (rec) panel.current?.scrollTo({ top: 0 }); }, [rec?.data.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!id) return null;
  const sector = rec ? SECTOR_BY_ID[rec.data.sectorId].sector : null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Record detail">
      <div className="absolute inset-0 bg-em-950/40" onClick={closeRecord} aria-hidden />
      <div ref={panel} tabIndex={-1} className="slide-in absolute right-0 top-0 flex h-full w-full flex-col overflow-y-auto bg-ivory shadow-2xl outline-none sm:w-[520px]">
        <header className="sticky top-0 z-10 border-b border-line bg-ivory/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {rec ? (
                <>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2"><KindChip kind={rec.kind} /><IdTag id={rec.data.id} /><DemoTag /></div>
                  <h2 className="font-serif text-xl leading-snug text-ink">{recordTitle(rec.data.id)}</h2>
                  <p className="mt-0.5 text-xs text-muted">{sector?.entityName} · {sector?.name}</p>
                </>
              ) : <h2 className="font-serif text-xl">Record not found</h2>}
            </div>
            <button onClick={closeRecord} aria-label="Close detail" className="rounded-md p-1.5 text-ink-2 hover:bg-ivory-2"><X size={20} /></button>
          </div>
        </header>
        <div className="space-y-5 px-5 py-5">
          {!rec && <p className="text-sm text-ink-2">No seeded record has the ID <code>{id}</code>. Use search to find a record.</p>}
          {rec?.kind === "metric" && <MetricBody m={rec.data} open={openRecord} />}
          {rec?.kind === "signal" && <SignalBody s={rec.data} open={openRecord} />}
          {rec?.kind === "case" && <CaseBody c={rec.data} open={openRecord} />}
          {rec?.kind === "decision" && <DecisionBody d={rec.data} open={openRecord} />}
          {rec?.kind === "entity" && <EntityBody e={rec.data} open={openRecord} />}
          {rec?.kind === "evidence" && <EvidenceBody ev={rec.data} open={openRecord} />}
          {rec && <p className="border-t border-line pt-3 text-[11px] text-muted">{KIND_LABEL[rec.kind]} record · seeded fictional data · SAR used for all monetary values</p>}
        </div>
      </div>
    </div>
  );
}
