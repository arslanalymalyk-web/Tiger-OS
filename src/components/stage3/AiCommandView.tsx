"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot, ShieldCheck } from "lucide-react";
import { SECTORS } from "@/data";
import { useDemo } from "@/state/DemoProvider";
import { useProviderStatus } from "@/state/assist";
import { ASSISTANTS, MODE_LABEL, OPERATION_LABEL, RUN_STATUSES, LIMITS, type OutputMode } from "@/lib/stage3/types";
import { dispositionOf } from "@/lib/stage3/mutations";
import { DemoTag } from "../ui";
import { Skeleton, StaleBadge, SelectField, CardSection } from "../stage2/common";
import { ModeBadge, ProviderBanner, RunStatusBadge, runWhen } from "./common3";

export function AiCommandView() {
  const { world, hydrated } = useDemo();
  const status = useProviderStatus();
  const [sector, setSector] = useState(""), [st, setSt] = useState(""), [mode, setMode] = useState(""), [asst, setAsst] = useState("");
  const rows = useMemo(() => world.runs.filter((r) => (!sector || r.sectorId === sector) && (!st || r.status === st) && (!mode || r.mode === mode) && (!asst || r.assistantId === asst)), [world.runs, sector, st, mode, asst]);
  if (!hydrated) return <Skeleton />;
  const total = world.runs.length;
  const stale = world.runs.filter((r) => (world.runStale.get(r.id)?.length ?? 0) > 0).length;
  const active = world.runs.filter((r) => r.status === "queued" || r.status === "running").length;
  return (
    <div className="space-y-6" data-testid="ai-command">
      <header>
        <div className="flex flex-wrap items-center gap-2"><h1 className="font-serif text-3xl">AI command</h1><DemoTag /></div>
        <p className="mt-2 max-w-3xl text-ink-2">Four bounded analytical assistants. Each run is started by a person from a case, reads only that case&apos;s linked evidence and records, and produces cited output for human review. <b>There is no continuous monitoring, no background autonomy and no action execution.</b></p>
      </header>
      <ProviderBanner status={status} />

      <section aria-label="Assistants" className="grid gap-4 md:grid-cols-2" data-testid="assistants">
        {ASSISTANTS.map((a) => (
          <article key={a.id} className="card p-4" data-testid={`assistant-${a.id}`}>
            <h2 className="flex items-center gap-2 font-serif text-lg"><Bot size={18} className="text-em-700" aria-hidden />{a.name}</h2>
            <p className="mt-1 text-sm">{a.responsibility}</p>
            <dl className="mt-2 space-y-1 text-xs text-ink-2">
              <div><dt className="inline font-semibold">Operations: </dt><dd className="inline">{a.operations.map((o) => OPERATION_LABEL[o]).join("; ")}</dd></div>
              <div><dt className="inline font-semibold">Produces: </dt><dd className="inline">{a.produces}</dd></div>
              <div><dt className="inline font-semibold">Cannot: </dt><dd className="inline">{a.cannot}</dd></div>
            </dl>
          </article>
        ))}
      </section>

      <CardSection title="Approved capabilities and evidence scope">
        <ul className="grid gap-2 text-sm md:grid-cols-2" data-testid="capabilities">
          {[
            ["User-triggered only", "A run starts when an Analyst or Expert (demonstration roles) presses a run button on a case. Approver is read-only."],
            ["Scope = one case", "Evidence linked to that case (at the linked version), its hypotheses, tasks, recorded expert findings and notes. Shown before every run. Nothing else is retrieved."],
            ["Cited output", "Claims carry evidence ID, version and passage reference with a verbatim quote. Citations that do not check out are rejected and listed."],
            ["Human review", "Proposed tasks and briefs change a case only when an Analyst accepts them; every acceptance records its origin. Expert findings stay separate."],
            ["Limits", `Input up to ${LIMITS.maxInputChars.toLocaleString("en-US")} characters, question up to ${LIMITS.maxQuestionChars}, output up to ${LIMITS.maxOutputTokens.toLocaleString("en-US")} tokens; timeouts and cancellation are visible.`],
            ["Not available", "Financial impact calculation (Stage 4), approvals (Stage 5), execution (Stage 6), live data or integrations (Stage 8), continuous monitoring."],
          ].map(([t, d]) => <li key={t} className="flex gap-2 rounded-lg border border-line p-3"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-em-700" aria-hidden /><span><b>{t}.</b> {d}</span></li>)}
        </ul>
      </CardSection>

      <CardSection title={`Runs (${rows.length} of ${total})`}>
        <p className="text-sm text-ink-2" data-testid="run-counts">{total} run(s) · {active} in progress · {stale} Needs refresh. Local demonstration history stored in this browser — not an immutable audit log.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <SelectField label="Sector" value={sector} onChange={setSector} placeholder="All sectors" options={SECTORS.map((s) => ({ value: s.id, label: s.short }))} testId="runs-sector" />
          <SelectField label="Status" value={st} onChange={setSt} placeholder="All statuses" options={RUN_STATUSES.map((s) => ({ value: s, label: s }))} testId="runs-status" />
          <SelectField label="Output mode" value={mode} onChange={setMode} placeholder="All modes" options={(Object.keys(MODE_LABEL) as OutputMode[]).map((m) => ({ value: m, label: MODE_LABEL[m] }))} testId="runs-mode" />
          <SelectField label="Assistant" value={asst} onChange={setAsst} placeholder="All assistants" options={ASSISTANTS.map((a) => ({ value: a.id, label: a.name }))} testId="runs-assistant" />
        </div>
        {rows.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-line p-6 text-center text-sm text-ink-2" data-testid="runs-empty">
            <p className="font-serif text-lg text-ink">{total === 0 ? "No assistant runs yet" : "No runs match these filters"}</p>
            <p className="mt-1">{total === 0 ? "Open a case and use the AI assistance tab. For the primary walkthrough, start with CAS-LOG-01." : "Clear a filter to see more."}</p>
            {total === 0 && <p className="mt-3"><Link href="/cases/CAS-LOG-01?tab=ai" className="font-semibold text-em-700 underline" data-testid="start-log">Open CAS-LOG-01 · AI assistance</Link></p>}
          </div>
        ) : (
          <div role="region" aria-label="Assistant runs" tabIndex={0} className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm" data-testid="runs-table">
              <thead><tr className="border-b border-line text-xs text-muted"><th className="py-2 pr-3">Run</th><th className="pr-3">Operation / assistant</th><th className="pr-3">Case</th><th className="pr-3">Mode</th><th className="pr-3">Status</th><th className="pr-3">Requested by</th><th className="pr-3">Provider / model</th><th className="pr-3">Created</th><th>Disposition</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id} className="border-b border-line/60 align-top" data-testid={`run-${r.id}`}>
                  <td className="py-2 pr-3"><Link href={`/cases/${r.caseId}?tab=ai&run=${r.id}`} className="font-mono text-xs text-em-700 underline">{r.id}</Link></td>
                  <td className="pr-3">{OPERATION_LABEL[r.operation]}<span className="block text-xs text-muted">{ASSISTANTS.find((a) => a.id === r.assistantId)?.name}</span></td>
                  <td className="pr-3"><Link href={`/cases/${r.caseId}`} className="font-mono text-xs text-em-700 underline">{r.caseId}</Link></td>
                  <td className="pr-3"><ModeBadge mode={r.mode} /></td>
                  <td className="pr-3"><RunStatusBadge status={r.status} />{(world.runStale.get(r.id)?.length ?? 0) > 0 && <span className="mt-1 block"><StaleBadge /></span>}{r.error && <span className="block text-xs text-rd-800">{r.error.code.replace(/_/g, " ")}</span>}</td>
                  <td className="pr-3 text-xs">{r.role} (demo role)</td>
                  <td className="pr-3 text-xs">{r.mode === "deterministic" ? "No model" : r.provider ? `${r.provider} · ${r.model}` : "—"}</td>
                  <td className="pr-3 whitespace-nowrap text-xs">{runWhen(r)}</td>
                  <td className="text-xs capitalize">{dispositionOf(r).replace("-", " ")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </CardSection>
    </div>
  );
}
