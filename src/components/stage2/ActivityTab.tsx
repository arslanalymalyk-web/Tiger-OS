"use client";

import type { CaseAggregate } from "@/lib/stage2/types";
import { CardSection, LocalActivityNote, fmtDateTime } from "./common";

export function ActivityTab({ c }: { c: CaseAggregate }) {
  const events = [...c.events].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  return (
    <CardSection title={`Activity timeline (${events.length})`}>
      <LocalActivityNote />
      <ol className="mt-3 space-y-3 border-l border-line pl-4" data-testid="activity-list">{events.map((e) => (
        <li key={e.id} className="relative" data-testid={`event-${e.type}`}>
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-gd-500" aria-hidden />
          <p className="text-sm text-ink">{e.text}</p>
          <p className="text-[11px] text-muted">{e.actor} · {fmtDateTime(e.at)} · <code>{e.id}</code></p>
        </li>
      ))}</ol>
    </CardSection>
  );
}
