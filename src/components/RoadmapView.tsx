"use client";

import { Check, Circle } from "lucide-react";
import { STAGES } from "@/data/roadmap";

export function RoadmapView() {
  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Stage boundaries</p>
        <h1 className="mt-1 font-serif text-3xl sm:text-4xl">What is in Stages 1–2, and what is not</h1>
        <p className="mt-2 max-w-3xl text-[15px] text-ink-2">Stages 1 and 2 are working software on fictional seeded data that run in your browser. Later capabilities are described here so that boundaries in the interface are explicit rather than unexplained inactive controls.</p>
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
        <h2 className="mb-2 text-sm font-semibold text-ink">Not claimed in Stages 1–2</h2>
        <ul className="list-disc space-y-1 pl-5"><li>Live data feeds, integration health, or connection to any real system.</li><li>Continuous monitoring, background autonomy or any AI action on a case: assistance runs only when a person starts it and cannot change anything itself. This build ships with no AI provider configured, and no real model call has been verified here.</li><li>Production authentication, access control, audit logging or MFA.</li><li>Production readiness, sovereign hosting, or compliance certification.</li><li>Arabic / right-to-left interface.</li><li>Messages to real experts or any notification outside this browser.</li><li>Recording an approval or execution of any decision; “Reviewed” and “Closed” never mean approved.</li><li>A hosted database or shared state between users: Stage 2 and Stage 3 data live in this browser only.</li><li>Resolution of the Stage 1 accessibility findings or any WCAG conformance claim.</li></ul>
      </section>
    </div>
  );
}
