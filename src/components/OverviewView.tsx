"use client";

import Link from "next/link";
import type { ChartData, ChartDef } from "@/lib/types";
import {
  ALL_SIGNALS, CROSS_LINKS, SECTORS, SECTOR_BY_ID, computeMetric, fmtNum, fmtTime, groupCapital, recordTitle, sectorCapital, severityRank,
} from "@/data";
import { groupCounts, sectorCounts } from "@/lib/stage2/world";
import { useDemo } from "@/state/DemoProvider";
import { useRecordNav } from "@/lib/useRecordNav";
import { ChartCard } from "./Charts";
import { DemoTag, IdTag, SECTOR_ICONS, SeverityBadge } from "./ui";

const capChart: ChartDef = {
  id: "CHT-GRP-01", sectorId: "sovereign", title: "Capital employed by sector entity (additive)", subtitle: "As at 30 Sep 2026", kind: "bars", xLabel: "Sector entity", yLabel: "SAR m", unit: "SAR m", decimals: 0,
  formula: "Σ capital attribute of each sector's records, excluding memo records (Sovereign Capital stakes in Group entities).", build: () => ({ categories: [], series: [], sources: [] }),
};
const decChart: ChartDef = {
  id: "CHT-GRP-02", sectorId: "sovereign", title: "Pending decision amounts by sector", subtitle: "Reallocations are shown separately, never added", kind: "bars", xLabel: "Sector", yLabel: "SAR m", unit: "SAR m", decimals: 0,
  formula: "Σ decision amounts by amountKind. Commitment = new outlay; reallocation = movement of existing capital.", build: () => ({ categories: [], series: [], sources: [] }),
};

export function OverviewView() {
  const { openRecord } = useRecordNav();
  const { world, hydrated } = useDemo();
  const g = groupCounts(world);
  const cap = groupCapital();
  const capData: ChartData = { categories: SECTORS.map((s) => s.short), series: [{ name: "Capital employed", values: SECTORS.map((s) => sectorCapital(s.id)) }], sources: SECTORS.map((s) => s.id) };
  const decData: ChartData = {
    categories: SECTORS.map((s) => s.short),
    series: [{ name: "New commitments (additive)", values: SECTORS.map((s) => sectorCounts(world, s.id).commitments) }, { name: "Reallocations (not additive)", values: SECTORS.map((s) => sectorCounts(world, s.id).reallocations) }],
    sources: SECTORS.map((s) => s.id),
  };
  const top = [...ALL_SIGNALS].sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.detectedAt.localeCompare(a.detectedAt)).slice(0, 8);
  const tile = (label: string, value: string, sub: string, testid?: string) => (
    <div className="card p-4" data-testid={testid}><p className="eyebrow">{label}</p><p className="mt-1 font-serif text-3xl tabular-nums text-em-900">{value}</p><p className="mt-1 text-xs text-muted">{sub}</p></div>
  );
  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Cross-sector institutional overview</p>
        <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Al Noor Sovereign Group</h1>
        <p className="mt-2 max-w-3xl text-[15px] text-ink-2">Eight fictional sector entities. Additive amounts are summed once; ratios and indicators are never summed. <DemoTag className="ml-1 align-middle" /></p>
      </header>

      <section aria-label="Additive group totals" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {tile("Capital employed", `SAR ${fmtNum(cap / 1000, 1)} bn`, `Σ of eight entities = SAR ${fmtNum(cap)} m; Sovereign memo stakes excluded`, "kpi-capital")}
        {tile("Open signals", String(g.signals), `${g.bySev.critical} critical · ${g.bySev.high} high · ${g.bySev.moderate} moderate · ${g.bySev.low} low`)}
        {tile("Active cases", hydrated ? String(g.cases) : "…", hydrated ? `${g.openReviews} open expert review(s) · ${g.staleBriefs} brief(s) need refresh · ${g.untriaged} signal(s) without a case` : "Loading saved state…", "kpi-cases")}
        {tile("Pending decisions", String(g.decisions), "Proposals only; approvals arrive in Stage 5")}
        {tile("New commitments", `SAR ${fmtNum(g.commitments)} m`, `Reallocations of SAR ${fmtNum(g.reallocations)} m shown separately, not added`)}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard def={capChart} data={capData} />
        <ChartCard def={decChart} data={decData} />
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-line p-4"><h2 className="text-sm font-semibold">Sector summary</h2><p className="text-xs text-muted">Capital is additive. The headline indicator is a non-additive ratio or level from each sector’s first metric and is never summed.</p></div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Sector summary table (scrollable)">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-ivory-2 text-xs text-muted"><tr><th className="p-3 font-semibold">Sector</th><th className="p-3 text-right font-semibold">Capital employed (SAR m, additive)</th><th className="p-3 font-semibold">Signals (C / H / M / L)</th><th className="p-3 text-right font-semibold">Cases</th><th className="p-3 text-right font-semibold">Decisions</th><th className="p-3 font-semibold">Headline indicator (non-additive)</th></tr></thead>
            <tbody>
              {SECTORS.map((s) => {
                const c = sectorCounts(world, s.id);
                const m = SECTOR_BY_ID[s.id].metrics[0];
                const r = computeMetric(m);
                const I = SECTOR_ICONS[s.id];
                return (
                  <tr key={s.id} className="border-t border-line-2 hover:bg-sg-50">
                    <td className="p-3"><Link href={`/sector/${s.id}`} className="flex items-center gap-2 font-medium text-em-700 hover:underline"><I size={16} aria-hidden />{s.name}</Link><div className="text-[11px] text-muted">{s.entityName}</div></td>
                    <td className="p-3 text-right tabular-nums">{fmtNum(sectorCapital(s.id))}</td>
                    <td className="p-3 tabular-nums">{c.signals} ({c.bySev.critical} / {c.bySev.high} / {c.bySev.moderate} / {c.bySev.low})</td>
                    <td className="p-3 text-right tabular-nums">{c.cases}</td><td className="p-3 text-right tabular-nums">{c.decisions}</td>
                    <td className="p-3"><button onClick={() => openRecord(m.id)} className="text-left"><span className="font-medium tabular-nums">{fmtNum(r.value, m.decimals)} {m.unit}</span><span className="block text-[11px] text-muted">{m.name} · {m.period}</span></button></td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-line bg-ivory-2 font-semibold"><td className="p-3">Group (additive columns only)</td><td className="p-3 text-right tabular-nums" data-testid="group-capital-total">{fmtNum(cap)}</td><td className="p-3 tabular-nums">{g.signals} ({g.bySev.critical} / {g.bySev.high} / {g.bySev.moderate} / {g.bySev.low})</td><td className="p-3 text-right tabular-nums">{g.cases}</td><td className="p-3 text-right tabular-nums">{g.decisions}</td><td className="p-3 text-xs font-normal text-muted">Not summed</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold">Priority signals across sectors</h2>
          <ul className="divide-y divide-line-2">{top.map((s) => (
            <li key={s.id}><button onClick={() => openRecord(s.id)} className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-sg-50"><span className="w-20 shrink-0"><SeverityBadge severity={s.severity} /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{s.title}</span><span className="text-[11px] text-muted">{SECTOR_BY_ID[s.sectorId].sector.short} · {fmtTime(s.detectedAt)}</span></span><IdTag id={s.id} /></button></li>
          ))}</ul>
        </section>
        <section className="card p-4 sm:p-5">
          <h2 className="mb-1 text-sm font-semibold">Cross-sector relationships</h2>
          <p className="mb-3 text-xs text-muted">Illustrative links between entities in different sectors. The exposures behind them are already counted in their own sector and are not added again.</p>
          <ul className="space-y-3">{CROSS_LINKS.map((l) => (
            <li key={l.id} className="rounded-lg border border-line p-3 text-sm"><p className="text-ink-2">{l.nature}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                <button onClick={() => openRecord(l.fromEntityId)} className="rounded bg-ivory-2 px-1.5 py-0.5 font-medium text-em-700 hover:underline">{recordTitle(l.fromEntityId)}</button>→
                <button onClick={() => openRecord(l.toEntityId)} className="rounded bg-ivory-2 px-1.5 py-0.5 font-medium text-em-700 hover:underline">{recordTitle(l.toEntityId)}</button></p></li>
          ))}</ul>
        </section>
      </div>
      <p className="text-xs text-muted">Method: see <Link href="/methodology" className="font-medium text-em-700 underline">Methodology</Link> for formulas, reporting periods and aggregation rules.</p>
    </div>
  );
}
