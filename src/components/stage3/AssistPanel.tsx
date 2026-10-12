"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDemo } from "@/state/DemoProvider";
import { useAssistant, useProviderStatus } from "@/state/assist";
import { can } from "@/lib/stage2/rules";
import type { CaseAggregate } from "@/lib/stage2/types";
import { buildContext, scopeOf } from "@/lib/stage3/context";
import { ASSISTANT_BY_OP, AI_OPERATIONS, LIMITS, OPERATION_LABEL, type AiOperation } from "@/lib/stage3/types";
import { Btn, CardSection, ErrorList, Locked, SelectField, TextArea } from "../stage2/common";
import { ModeBadge, ProviderBanner, RunStatusBadge, runWhen } from "./common3";
import { RunView } from "./RunView";
import { StaleBadge } from "../stage2/common";

const SCENARIOS = ["ok", "delay", "invalid-citation", "wrong-quote", "wrong-version", "unsupported-figure", "inject", "insufficient", "malformed", "toolong", "fail", "ratelimit", "auth", "refusal", "slow", "extra-tools"];

export function AssistPanel({ c }: { c: CaseAggregate }) {
  const { world, role, hydrated } = useDemo();
  const status = useProviderStatus();
  const { start } = useAssistant();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [op, setOp] = useState<AiOperation>("summarize");
  const [question, setQuestion] = useState("");
  const [scenario, setScenario] = useState("ok");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const ctx = useMemo(() => buildContext(c), [c]);
  const scope = useMemo(() => scopeOf(ctx), [ctx]);
  const runs = world.runs.filter((r) => r.caseId === c.id);
  const selectedId = sp.get("run") ?? runs[0]?.id;
  const selected = runs.find((r) => r.id === selectedId);
  const mayRun = hydrated && can(role, "ai.run");
  const select = (id: string) => router.replace(`${pathname}?tab=ai&run=${id}`, { scroll: false });

  const go = async (mode: "ai" | "deterministic") => {
    setErrors([]); setBusy(true);
    try {
      const r = await start({ caseId: c.id, operation: op, question, mode, status, mockScenario: scenario, onCreated: select });
      if (!r.ok) setErrors(r.errors);
      if (r.runId) select(r.runId);
    } finally { setBusy(false); }
  };
  const blocked = scope.problems.length > 0;
  const aiReady = !!status?.configured;

  return (
    <div className="space-y-5" data-testid="assist-panel">
      <div className="rounded-lg border border-dashed border-gd-500/60 bg-gd-100/50 p-3 text-sm text-ink-2" role="note" data-testid="assist-boundary">
        <b>Bounded analytical assistance, started by you.</b> It reads only the evidence and records shown below, returns cited text for review, and has no tools: it cannot change this case, create tasks, send messages, approve or execute anything. Nothing runs in the background. Generated content changes the case only when an Analyst accepts it.
      </div>
      <ProviderBanner status={status} />

      <CardSection title="1 · Choose what to ask">
        <fieldset className="space-y-2">
          <legend className="sr-only">Assistance operation</legend>
          {AI_OPERATIONS.map((o) => (
            <label key={o} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${op === o ? "border-em-700 bg-em-100/40" : "border-line"}`}>
              <input type="radio" name="op" value={o} checked={op === o} onChange={() => setOp(o)} className="mt-1" data-testid={`op-${o}`} />
              <span><b>{OPERATION_LABEL[o]}</b><span className="block text-xs text-ink-2">{ASSISTANT_BY_OP[o].name} — {ASSISTANT_BY_OP[o].responsibility}</span></span>
            </label>
          ))}
        </fieldset>
        {op === "question" && <div className="mt-3"><TextArea label="Your question about this case" value={question} onChange={setQuestion} rows={2} hint={`Answered only from the evidence scope below (${LIMITS.maxQuestionChars} characters at most). If the evidence does not answer it, the assistant must say so.`} testId="ai-question" /></div>}
      </CardSection>

      <CardSection title="2 · Exact evidence scope (what would be supplied)">
        <div data-testid="scope-panel" className="space-y-3 text-sm">
          {scope.evidence.length === 0 ? <p className="text-ink-2">No readable evidence is linked to this case.</p> : (
            <div role="region" aria-label="Evidence in scope" tabIndex={0} className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-xs">
                <thead><tr className="border-b border-line text-muted"><th className="py-1 pr-3">Evidence</th><th className="pr-3">Version</th><th className="pr-3">Stance(s)</th><th className="pr-3">Source date</th><th>Passages</th></tr></thead>
                <tbody>{scope.evidence.map((e) => <tr key={`${e.evidenceId}${e.version}`} className="border-b border-line/60" data-testid={`scope-${e.evidenceId}`}><td className="py-1 pr-3"><Link href={`/evidence/${e.evidenceId}?v=${e.version}`} className="font-mono text-em-700 underline">{e.evidenceId}</Link> <span className="text-ink-2">{e.title}</span></td><td className="pr-3">v{e.version}</td><td className="pr-3">{e.stances.join(", ")}</td><td className="pr-3">{e.sourceDate}</td><td>{e.blocks.length}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-ink-2" data-testid="scope-records">Case records supplied: {ctx.hypotheses.length} hypotheses, {ctx.tasks.length} tasks, {ctx.findings.length} recorded expert findings, {ctx.notes.length} notes · {scope.totalChars.toLocaleString("en-US")} of {LIMITS.maxInputChars.toLocaleString("en-US")} characters.</p>
          <p className="text-xs text-ink-2">Only evidence <b>linked to this case</b> is supplied. Unlinked evidence and records from this or any other sector are not retrieved. Link more evidence on the Hypotheses &amp; evidence tab if the scope is too narrow. Evidence text is treated as untrusted data.</p>
          {blocked && <ul className="list-disc pl-5 text-xs text-rd-800" role="alert" data-testid="scope-problems">{scope.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
      </CardSection>

      <CardSection title="3 · Run">
        <Locked action="ai.run" what="start assistant runs">
          <div className="space-y-3">
            {status?.mock && <div className="max-w-xs"><SelectField label="Mock scenario (automated-test fixture only)" value={scenario} onChange={setScenario} options={SCENARIOS.map((s) => ({ value: s, label: s }))} testId="mock-scenario" /></div>}
            <div className="flex flex-wrap items-start gap-3">
              <div className="max-w-sm space-y-1">
                <Btn onClick={() => go("ai")} disabled={!mayRun || busy || blocked || !aiReady} testId="run-ai">{aiReady ? (status?.mock ? "Run with mocked provider (test)" : "Run with AI provider") : "Run with AI provider"}</Btn>
                <p className="text-xs text-ink-2" data-testid="run-ai-note">{aiReady ? (status?.mock ? "Uses the test fixture, not a model." : "Sends the scope above to the configured provider. Usage may be billed by the provider.") : "AI provider not configured — this button stays off until an operator configures one."}</p>
              </div>
              <div className="max-w-sm space-y-1">
                <Btn kind="secondary" onClick={() => go("deterministic")} disabled={!mayRun || busy || blocked} testId="run-det">Run deterministic demonstration</Btn>
                <p className="text-xs text-ink-2">Rule-based text assembly from the same scope. <b>Not AI.</b> Output is labelled “Deterministic demonstration”.</p>
              </div>
            </div>
            <ErrorList errors={errors} />
          </div>
        </Locked>
      </CardSection>

      <CardSection title={`Runs for this case (${runs.length})`}>
        {runs.length === 0 ? <p className="text-sm text-ink-2" data-testid="no-runs">No assistant runs yet for this case.</p> : (
          <ul className="space-y-1" data-testid="run-list">{runs.map((r) => {
            const stale = (world.runStale.get(r.id)?.length ?? 0) > 0;
            return (
              <li key={r.id}><button type="button" onClick={() => select(r.id)} aria-current={r.id === selectedId ? "true" : undefined} data-testid={`run-row-${r.id}`}
                className={`flex w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${r.id === selectedId ? "border-em-700 bg-em-100/40" : "border-line hover:bg-ivory-2"}`}>
                <code className="font-mono text-xs">{r.id}</code><span>{OPERATION_LABEL[r.operation]}</span><ModeBadge mode={r.mode} /><RunStatusBadge status={r.status} />{stale && <StaleBadge />}<span className="ml-auto text-xs text-muted">{runWhen(r)}</span>
              </button></li>
            );
          })}</ul>
        )}
        <p className="mt-2 text-xs text-muted">Run history is local demonstration activity stored in this browser, not an immutable audit log.</p>
      </CardSection>
      {selected && <RunView run={selected} stale={world.runStale.get(selected.id) ?? []} />}
    </div>
  );
}
