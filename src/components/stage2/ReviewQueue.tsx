"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PEOPLE, SECTORS, SECTOR_BY_ID } from "@/data";
import { reviewState } from "@/lib/stage2/rules";
import { personName } from "@/lib/stage2/catalog";
import { useDemo } from "@/state/DemoProvider";
import { DemoTag, IdTag } from "../ui";
import { ReviewBadge, RoleNotice, SelectField, Skeleton, fmtDate } from "./common";

const STATES = ["Requested", "Reviewed", "Revision requested", "Withdrawn"] as const;

export function ReviewQueue() {
  const { world, hydrated, role } = useDemo();
  const [state, setState] = useState<string>("");
  const [sector, setSector] = useState("");
  const [expert, setExpert] = useState("");
  const rows = useMemo(() => world.cases.flatMap((c) => c.reviews.map((r) => ({ c, r, st: reviewState(r), round: r.rounds[r.rounds.length - 1], findings: r.rounds.reduce((a, x) => a + (x.submission?.findings.length ?? 0), 0) })))
    .filter((x) => (!state || x.st === state) && (!sector || x.c.sectorId === sector) && (!expert || x.r.assigneeId === expert))
    .sort((a, b) => (a.st === "Requested" ? 0 : 1) - (b.st === "Requested" ? 0 : 1) || a.round.dueDate.localeCompare(b.round.dueDate) || a.r.id.localeCompare(b.r.id)), [world, state, sector, expert]);
  const openCount = world.cases.reduce((a, c) => a + c.reviews.filter((r) => reviewState(r) === "Requested").length, 0);
  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Expert collaboration</p>
        <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Expert-review queue</h1>
        <p className="mt-2 max-w-3xl text-[15px] text-ink-2">Review requests across all sectors. Experts are named fictional people; no message is sent to anyone. “Reviewed” records findings and is not an approval. <DemoTag className="ml-1 align-middle" /></p>
      </header>
      <RoleNotice />
      {hydrated && role === "Expert" && <p className="rounded-lg border border-gd-500/40 bg-gd-100 p-3 text-sm text-gd-700" data-testid="expert-queue-hint">As the Expert demonstration role you can answer the <b>{openCount}</b> open request(s) below: open one and use the Expert panel on its Expert review tab.</p>}
      <section className="card p-4" aria-label="Filters"><div className="grid gap-3 sm:grid-cols-3">
        <SelectField label="State" value={state} onChange={setState} placeholder="All states" options={STATES.map((s) => ({ value: s, label: s }))} testId="rq-state" />
        <SelectField label="Sector" value={sector} onChange={setSector} placeholder="All sectors" options={SECTORS.map((s) => ({ value: s.id, label: s.short }))} testId="rq-sector" />
        <SelectField label="Expert" value={expert} onChange={setExpert} placeholder="All experts" options={PEOPLE.filter((p) => p.kind === "expert").map((p) => ({ value: p.id, label: p.name }))} testId="rq-expert" />
      </div>
      <p className="mt-2 text-sm text-ink-2" aria-live="polite" data-testid="rq-count">{hydrated ? `${rows.length} request(s)` : "Loading…"}{(state || sector || expert) && <button className="ml-3 font-medium text-em-700 underline" onClick={() => { setState(""); setSector(""); setExpert(""); }}>Clear filters</button>}</p></section>
      {!hydrated ? <Skeleton /> : rows.length === 0 ? <div className="card p-8 text-center" data-testid="rq-empty"><p className="font-serif text-xl">No review requests match</p><p className="mt-1 text-sm text-ink-2">Clear the filters, or request a review from a case that is being investigated.</p></div> : (
        <div className="card overflow-hidden"><div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Review requests (scrollable)">
          <table className="w-full min-w-[820px] text-left text-sm" data-testid="rq-table"><thead className="bg-ivory-2 text-xs text-muted"><tr><th className="p-3 font-semibold">Request</th><th className="p-3 font-semibold">Case</th><th className="p-3 font-semibold">Sector</th><th className="p-3 font-semibold">Expert</th><th className="p-3 font-semibold">State</th><th className="p-3 font-semibold">Round · due</th><th className="p-3 font-semibold">Findings</th></tr></thead>
            <tbody>{rows.map(({ c, r, st, round, findings }) => (
              <tr key={r.id} className="border-t border-line-2 align-top hover:bg-sg-50" data-testid={`rq-row-${r.id}`}>
                <td className="p-3"><IdTag id={r.id} /></td>
                <td className="p-3"><Link href={`/cases/${c.id}?tab=review`} className="font-medium text-em-700 hover:underline" data-testid={`rq-open-${r.id}`}>{c.title}</Link><div className="text-[11px] text-muted">{c.id} · {c.status}</div></td>
                <td className="p-3 text-xs">{SECTOR_BY_ID[c.sectorId].sector.short}</td>
                <td className="p-3 text-xs">{personName(r.assigneeId)}</td>
                <td className="p-3"><ReviewBadge state={st} /></td>
                <td className="p-3 text-xs tabular-nums">{round.round} · {fmtDate(round.dueDate)}</td>
                <td className="p-3 text-xs">{findings}</td>
              </tr>))}</tbody></table></div></div>
      )}
    </div>
  );
}
