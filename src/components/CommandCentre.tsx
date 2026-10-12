"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList, Gavel, Radar, UserCheck } from "lucide-react";
import type { SectorId } from "@/lib/types";
import { SECTOR_BY_ID, computeChart, computeMetric, fmtNum, fmtTime, severityRank, sectorCapital } from "@/data";
import { useRecordNav } from "@/lib/useRecordNav";
import { useDemo } from "@/state/DemoProvider";
import { ChartCard } from "./Charts";
import { DemoTag, IdTag, SECTOR_ICONS, SeverityBadge, StageBoundary, StatusPill } from "./ui";
import { CaseStatusBadge, PriorityBadge } from "./stage2/common";
import { activeCaseForSignal, casesForSector } from "@/lib/stage2/world";
import { isActive, openReviews } from "@/lib/stage2/rules";
import { personName } from "@/lib/stage2/catalog";

const Panel = ({ title, icon: Icon, children, count }: { title: string; icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode; count?: number }) => (
  <section className="card p-4 sm:p-5">
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink"><Icon size={16} className="text-em-700" />{title}{count !== undefined && <span className="rounded-full bg-ivory-2 px-2 text-xs text-muted">{count}</span>}</h2>
    {children}
  </section>
);

export function CommandCentre({ sectorId }: { sectorId: SectorId }) {
  const seed = SECTOR_BY_ID[sectorId];
  const { sector } = seed;
  const { role, setSector, hydrated, world } = useDemo();
  const { openRecord } = useRecordNav();
  useEffect(() => setSector(sectorId), [sectorId, setSector]);
  const Icon = SECTOR_ICONS[sectorId];
  const signals = [...seed.signals].sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.detectedAt.localeCompare(a.detectedAt));
  const pending = [...seed.decisions].sort((a, b) => a.dueBy.localeCompare(b.dueBy));
  const sectorCases = casesForSector(world, sectorId).filter(isActive);
  const expertCases = sectorCases.filter((c) => openReviews(c).length > 0);
  const untriaged = signals.filter((s) => !activeCaseForSignal(world, s.id));
  const cap = sectorCapital(sectorId);

  const focus =
    role === "Approver"
      ? { label: "Approver focus: decisions awaiting you", icon: Gavel, items: pending.map((d) => ({ id: d.id, t: d.title, s: `Due ${d.dueBy}` })) }
      : role === "Expert"
        ? { label: "Expert focus: cases awaiting your review", icon: UserCheck, items: expertCases.map((c) => ({ id: c.id, t: c.title, s: `${personName(c.reviews.find((r) => r.rounds[r.rounds.length - 1] && !r.rounds[r.rounds.length - 1].submission && !r.withdrawnAt)?.assigneeId)} · ${c.status}` })) }
        : { label: "Analyst focus: signals to triage first", icon: Radar, items: [...untriaged, ...signals.filter((s) => !untriaged.includes(s))].slice(0, 3).map((s) => ({ id: s.id, t: s.title, s: `${s.severity} · ${untriaged.includes(s) ? "no case yet" : "has a case"} · ${fmtTime(s.detectedAt)}` })) };

  return (
    <div className="space-y-5" data-testid={`command-centre-${sectorId}`}>
      <header className="card overflow-hidden">
        <div className="flex flex-col gap-4 bg-gradient-to-br from-white to-sg-50 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="eyebrow mb-1 flex items-center gap-2"><Icon size={14} aria-hidden />{sector.entityName} · {sector.descriptor}</p>
            <h1 className="font-serif text-3xl text-ink sm:text-4xl">{sector.name} command centre</h1>
            <div className="mt-1 h-0.5 w-12 bg-gd-500" aria-hidden />
            <h2 className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">Mandate summary</h2>
            <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{sector.mandate}</p>
            <ul className="mt-3 flex flex-wrap gap-2">{sector.analyticalFocus.map((f) => <li key={f} className="rounded-full border border-sg-300 bg-white px-2.5 py-0.5 text-xs font-medium text-em-800">{f}</li>)}</ul>
          </div>
          <dl className="grid min-w-[14rem] grid-cols-2 gap-x-6 gap-y-3 text-sm lg:grid-cols-1">
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Reporting period</dt><dd>{sector.reportingPeriod}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Capital employed</dt><dd className="tabular-nums">SAR {fmtNum(cap)} m</dd></div>
            <div className="col-span-2 lg:col-span-1"><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Data</dt><dd className="mt-0.5"><DemoTag /></dd></div>
          </dl>
        </div>
      </header>

      {!hydrated ? (
        <section className="min-h-[7.5rem] animate-pulse rounded-xl border border-em-700/30 bg-em-900/90 p-4 text-sm text-white/80 motion-reduce:animate-none" aria-label="Role focus" aria-busy="true">Loading your simulated role view…</section>
      ) : (
      <section className="on-dark rounded-xl border border-em-700/30 bg-em-900 p-4 text-white" aria-label="Role focus">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><focus.icon size={16} className="text-gd-300" aria-hidden />{focus.label} <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">simulated role</span></p>
        {focus.items.length === 0 ? <p className="text-sm text-white/80">Nothing in your queue for this sector.</p> : (
          <ul className="grid gap-2 md:grid-cols-3">{focus.items.map((i) => (
            <li key={i.id}><button onClick={() => openRecord(i.id)} className="h-full w-full rounded-lg bg-white/10 p-3 text-left hover:bg-white/20"><span className="block text-sm font-medium">{i.t}</span><span className="mt-1 block font-mono text-[11px] text-white/70">{i.id} · {i.s}</span></button></li>
          ))}</ul>
        )}
      </section>
      )}

      <section aria-label="Key metrics">
        <h2 className="mb-2 text-sm font-semibold">Key metrics</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {seed.metrics.map((m) => {
            const r = computeMetric(m);
            return (
              <button key={m.id} onClick={() => openRecord(m.id)} className="card group flex flex-col p-4 text-left transition hover:border-em-600 hover:shadow-card" data-testid={`metric-${m.id}`}>
                <p className="eyebrow">{m.theme}</p>
                <p className="mt-1 text-sm font-medium text-ink">{m.name}</p>
                <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5"><span className="font-serif text-3xl tabular-nums text-em-900">{fmtNum(r.value, m.decimals)}</span><span className="text-xs text-ink-2">{m.unit}</span></p>
                <p className="mt-1 text-xs text-muted">{m.period}</p>
                <div className="mt-auto flex items-center justify-between pt-3"><StatusPill status={r.status} /><span className="flex items-center gap-1 text-xs font-medium text-em-700 group-hover:underline">Details <ArrowRight size={12} aria-hidden /></span></div>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Analytical charts" className="grid gap-4 lg:grid-cols-2">
        {seed.charts.map((c) => <ChartCard key={c.id} def={c} data={computeChart(c)} />)}
      </section>

      <Panel title="Priority signals" icon={Radar} count={signals.length}>
        <ul className="divide-y divide-line-2">
          {signals.map((s) => (
            <li key={s.id}>
              <button onClick={() => openRecord(s.id)} className="flex w-full flex-col gap-1 py-3 text-left hover:bg-sg-50 sm:flex-row sm:items-start sm:gap-3 sm:px-2" data-testid={`signal-${s.id}`}>
                <span className="sm:w-24 sm:shrink-0"><SeverityBadge severity={s.severity} /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink">{s.title}</span><span className="block text-xs text-ink-2">{s.summary}</span></span>
                <span className="flex shrink-0 flex-col items-start gap-0.5 sm:items-end"><IdTag id={s.id} /><span className="text-[11px] text-muted">→ {hydrated ? (activeCaseForSignal(world, s.id)?.id ?? "no active case") : "…"} · {fmtTime(s.detectedAt)}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Active intelligence cases" icon={ClipboardList} count={hydrated ? sectorCases.length : undefined}>
          <ul className="space-y-2">{sectorCases.map((c) => (
            <li key={c.id} className="rounded-lg border border-line p-3 hover:border-em-600" data-testid={`case-${c.id}`}>
              <button onClick={() => openRecord(c.id)} className="w-full text-left">
                <span className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{c.title}</span><CaseStatusBadge status={c.status} /></span>
                <span className="mt-1 block text-xs text-ink-2">{c.summary}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted"><IdTag id={c.id} /><PriorityBadge priority={c.priority} />{personName(c.ownerId)} · {c.signalIds.length} signal(s) · {c.decisionIds.length} decision(s)</span>
              </button>
              <Link href={`/cases/${c.id}`} className="mt-2 inline-block text-xs font-semibold text-em-700 underline underline-offset-2" data-testid={`workspace-link-${c.id}`}>Open investigation workspace</Link>
            </li>
          ))}</ul>
          {hydrated && sectorCases.length === 0 && <p className="text-sm text-muted">No active case in this sector. Create one from a signal.</p>}
          <p className="mt-3 text-xs text-muted"><Link href={`/cases?sector=${sectorId}`} className="font-semibold text-em-700 underline">All cases for this sector</Link> · <Link href={`/evidence?sector=${sectorId}`} className="font-semibold text-em-700 underline">Evidence library</Link></p>
        </Panel>
        <Panel title="Pending decisions" icon={Gavel} count={pending.length}>
          <ul className="space-y-2">{pending.map((d) => (
            <li key={d.id}><button onClick={() => openRecord(d.id)} className="w-full rounded-lg border border-line p-3 text-left hover:border-em-600 hover:bg-sg-50" data-testid={`decision-${d.id}`}>
              <span className="flex items-start justify-between gap-2"><span className="text-sm font-medium">{d.title}</span><span className="shrink-0 text-xs font-semibold tabular-nums">{d.amountSARm === null ? "—" : `SAR ${fmtNum(d.amountSARm)} m`}</span></span>
              <span className="mt-1 block text-xs text-ink-2">{d.summary}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted"><IdTag id={d.id} />Due {d.dueBy} · {d.amountKind === "commitment" ? "new commitment" : d.amountKind === "reallocation" ? "reallocation" : "no amount"}</span>
            </button></li>
          ))}</ul>
          <div className="mt-3"><StageBoundary stage={5} capability="Approval workflow">Decisions can be inspected but not approved in Stage 2; they remain proposals.</StageBoundary></div>
        </Panel>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title="Recent activity" icon={Radar}>
          <ol className="space-y-3 border-l border-line pl-4">{[...seed.activity].sort((a, b) => b.at.localeCompare(a.at)).map((a) => (
            <li key={a.id} className="relative"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-gd-500" aria-hidden />
              <p className="text-sm text-ink">{a.recordId ? <button onClick={() => openRecord(a.recordId!)} className="text-left font-medium text-em-700 underline underline-offset-2">{a.text}</button> : a.text}</p>
              <p className="text-[11px] text-muted">{a.actor} · {fmtTime(a.at)}</p></li>
          ))}</ol>
        </Panel>
        <Panel title="Underlying records" icon={ClipboardList} count={seed.entities.length}>
          <p className="mb-2 text-xs text-muted">Metrics and charts above are calculated from these records. Select one for attributes, dependencies and linked records.</p>
          <div className="max-h-96 overflow-auto rounded-lg border border-line" tabIndex={0} role="region" aria-label={`Underlying records for ${sector.name} (scrollable)`}>
            <table className="w-full text-left text-sm"><thead className="sticky top-0 bg-ivory-2 text-xs text-muted"><tr><th className="p-2 font-semibold">Record</th><th className="p-2 font-semibold">Category</th><th className="p-2 text-right font-semibold">Capital (SAR m)</th></tr></thead>
              <tbody>{seed.entities.map((e) => (
                <tr key={e.id} className="border-t border-line-2 hover:bg-sg-50"><td className="p-2"><button onClick={() => openRecord(e.id)} className="text-left font-medium text-em-700 underline-offset-2 hover:underline">{e.name}</button><div className="font-mono text-[10px] text-muted">{e.id}</div></td>
                  <td className="p-2 text-xs text-ink-2">{e.category}</td><td className="p-2 text-right tabular-nums">{e.attrs.capital !== undefined ? fmtNum(e.attrs.capital) : "—"}{e.excludeFromGroupTotal && <span className="block text-[10px] text-gd-700">memo · not summed</span>}</td></tr>
              ))}</tbody></table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
