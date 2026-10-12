"use client";

import { Check, Circle } from "lucide-react";
import { STAGES } from "@/data/roadmap";

export function RoadmapView() {
  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Stage boundaries</p>
        <h1 className="mt-1 font-serif text-3xl sm:text-4xl">What is in Stage 1, and what is not</h1>
        <p className="mt-2 max-w-3xl text-[15px] text-ink-2">Stage 1 is a working, read-only foundation on fictional seeded data. Later capabilities are described here so that boundaries in the interface are explicit rather than unexplained inactive controls.</p>
      </header>
      <ol className="space-y-3">{STAGES.map((s) => (
        <li key={s.stage} className={`card p-5 ${s.status === "delivered" ? "border-em-600/50" : ""}`}>
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${s.status === "delivered" ? "bg-em-800 text-white" : "bg-ivory-2 text-ink-2"}`}>{s.status === "delivered" ? <Check size={14} aria-hidden /> : s.stage}</span>
            <div><h2 className="text-base font-semibold">Stage {s.stage}: {s.title} {s.status === "delivered" && <span className="ml-1 rounded-full bg-sg-100 px-2 py-0.5 text-xs font-semibold text-sg-700">This build</span>}</h2>
              <p className="mt-1 text-sm text-ink-2">{s.summary}</p>
              <ul className="mt-2 flex flex-wrap gap-2">{s.capabilities.map((c) => <li key={c} className="inline-flex items-center gap-1 rounded-full border border-line bg-ivory px-2 py-0.5 text-xs"><Circle size={6} className="fill-gd-500 text-gd-500" aria-hidden />{c}</li>)}</ul></div>
          </div>
        </li>
      ))}</ol>
      <section className="card p-5 text-sm text-ink-2">
        <h2 className="mb-2 text-sm font-semibold text-ink">Not claimed in Stage 1</h2>
        <ul className="list-disc space-y-1 pl-5"><li>Live data feeds, integration health, or connection to any real system.</li><li>AI model execution or AI-generated analysis.</li><li>Production authentication, access control, audit logging or MFA.</li><li>Production readiness, sovereign hosting, or compliance certification.</li><li>Arabic / right-to-left interface.</li></ul>
      </section>
    </div>
  );
}
