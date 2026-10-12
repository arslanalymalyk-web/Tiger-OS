"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SECTORS, SECTOR_BY_ID, computeMetric, fmtNum } from "@/data";
import { sectorCounts } from "@/lib/stage2/world";
import { useDemo } from "@/state/DemoProvider";
import { DemoTag, SECTOR_ICONS } from "./ui";

export function WorkspacesView() {
  const { sectorId: savedSector, role: savedRole, hydrated, world } = useDemo();
  const sectorId = hydrated ? savedSector : null;
  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Workspace and sector selection</p>
        <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Choose a command centre</h1>
        <p className="mt-2 max-w-3xl text-[15px] text-ink-2">All eight sectors are available in this demonstration. In the full product, workspaces would follow institutional permissions; here, the simulated role{hydrated ? <> (<b>{savedRole}</b>)</> : null} changes the focus panel only. <DemoTag className="ml-1 align-middle" /></p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SECTORS.map((s) => {
          const seed = SECTOR_BY_ID[s.id];
          const m = seed.metrics[0];
          const r = computeMetric(m);
          const c = sectorCounts(world, s.id);
          const I = SECTOR_ICONS[s.id];
          const branded = s.id === "energy" || s.id === "banking";
          return (
            <article key={s.id} className={`card flex flex-col p-5 ${sectorId === s.id ? "ring-2 ring-em-600/40" : ""}`} data-testid={`workspace-${s.id}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-sg-100 text-em-800"><I size={20} aria-hidden /></span>
                <div className="flex flex-col items-end gap-1.5 text-right">
                  {sectorId === s.id && <span className="rounded-full bg-sg-100 px-2 py-0.5 text-[11px] font-semibold text-sg-700">Last selected</span>}
                  {branded && <Link href={`/entry/${s.id}`} className="text-xs font-medium text-em-700 underline underline-offset-2">Branded sector entry</Link>}
                </div>
              </div>
              <h2 className="mt-3 font-serif text-xl">{s.name}</h2>
              <p className="text-xs text-muted">{s.entityName}</p>
              <ul className="mt-3 flex flex-1 flex-wrap content-start gap-1.5" aria-label="Analytical focus">{s.analyticalFocus.map((f) => <li key={f} className="rounded-full border border-sg-300 bg-white px-2 py-0.5 text-xs text-em-800">{f}</li>)}</ul>
              <div className="mt-4 rounded-lg bg-ivory-2 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{m.name}</p>
                <p className="font-serif text-2xl tabular-nums text-em-900">{fmtNum(r.value, m.decimals)} <span className="font-sans text-xs text-ink-2">{m.unit}</span></p>
                <p className="text-[11px] text-muted">{m.period}</p>
              </div>
              <p className="mt-3 text-xs text-ink-2">{c.signals} signals{c.bySev.critical ? <> · <b className="text-rd-800">{c.bySev.critical} critical</b></> : null} · {hydrated ? c.cases : "…"} active cases · {c.decisions} decisions</p>
              <Link href={`/sector/${s.id}`} className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-em-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-em-900">Open command centre <ArrowRight size={14} aria-hidden /></Link>
            </article>
          );
        })}
      </div>
      <p className="text-xs text-muted">Branded sector entries (Energy, Banking) are alternative sign-in screens that converge on this same application. Their fields are simulated.</p>
    </div>
  );
}
