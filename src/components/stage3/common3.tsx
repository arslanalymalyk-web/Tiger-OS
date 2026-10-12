"use client";

import Link from "next/link";
import { Bot, Cpu, FlaskConical, ShieldAlert } from "lucide-react";
import { refHref } from "../stage2/EvidenceTab";
import { MODE_LABEL, type AiRun, type OutputMode, type ProviderStatus, type RunStatus, type VCitation } from "@/lib/stage3/types";

export function ModeBadge({ mode }: { mode: OutputMode }) {
  const cls = mode === "ai" ? "border-em-700/40 bg-em-100 text-em-900" : mode === "deterministic" ? "border-gd-500/50 bg-gd-100 text-gd-700" : "border-am-600/30 bg-am-100 text-am-800";
  const Icon = mode === "ai" ? Bot : mode === "deterministic" ? Cpu : FlaskConical;
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`} data-testid="mode-badge" data-mode={mode}><Icon size={12} aria-hidden />{MODE_LABEL[mode]}</span>;
}
const STATUS_CLS: Record<RunStatus, string> = {
  queued: "border-line bg-ivory-2 text-ink-2", running: "border-gd-500/40 bg-gd-100 text-gd-700", completed: "border-sg-500/40 bg-sg-100 text-sg-700",
  failed: "border-rd-600/30 bg-rd-100 text-rd-800", cancelled: "border-line bg-white text-muted",
};
export const RunStatusBadge = ({ status }: { status: RunStatus }) => <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_CLS[status]}`} data-testid="run-status">{status}</span>;

export function CitationChip({ c }: { c: VCitation }) {
  return <Link href={refHref(c.evidenceId, c.version, c.ref)} className="rounded bg-ivory-2 px-1.5 py-0.5 font-mono text-[11px] text-em-800 hover:underline" data-testid={`cite-${c.evidenceId}-${c.ref}`} title={`Open ${c.evidenceId} v${c.version} at ${c.ref}`}>{c.evidenceId} v{c.version} {c.ref}</Link>;
}

/** Provider availability. Never shows a credential; says plainly when no provider is configured. */
export function ProviderBanner({ status }: { status: ProviderStatus | null | undefined }) {
  if (status === undefined) return <div className="min-h-[3rem] animate-pulse rounded-lg bg-ivory-2 motion-reduce:animate-none" role="status" aria-busy="true" aria-label="Checking provider status" />;
  if (status === null) return <div className="flex gap-2 rounded-lg border border-am-600/30 bg-am-100 p-3 text-sm text-am-800" role="status" data-testid="provider-banner" data-state="unreadable"><ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden /><p><b>Provider status could not be read.</b> AI runs are unavailable. The deterministic demonstration remains available and is labelled as such.</p></div>;
  if (!status.configured) return (
    <div className="flex gap-2 rounded-lg border border-gd-500/50 bg-gd-100/60 p-3 text-sm text-ink-2" role="status" data-testid="provider-banner" data-state="not-configured">
      <ShieldAlert size={16} className="mt-0.5 shrink-0 text-gd-700" aria-hidden />
      <div><p><b className="text-ink">AI provider not configured.</b> No AI run can be made, and nothing is sent anywhere. The Stage 2 deterministic Compile brief and the deterministic demonstration outputs below remain available; they are labelled “not AI”.</p>
        <p className="mt-1 text-xs">An operator enables AI runs by setting server environment variables ({(status.missing ?? []).map((m) => <code key={m} className="mx-0.5">{m}</code>)}) — see the README. Credentials are never entered in this app.</p></div>
    </div>
  );
  return (
    <div className={`flex gap-2 rounded-lg border p-3 text-sm ${status.mock ? "border-am-600/30 bg-am-100 text-am-800" : "border-sg-500/40 bg-sg-100 text-sg-700"}`} role="status" data-testid="provider-banner" data-state={status.mock ? "mock" : "configured"}>
      {status.mock ? <FlaskConical size={16} className="mt-0.5 shrink-0" aria-hidden /> : <Bot size={16} className="mt-0.5 shrink-0" aria-hidden />}
      <p>{status.mock
        ? <><b>Mocked provider (automated-test fixture).</b> This server was started with a test fixture standing in for a model. Its outputs are labelled “Mocked provider” and are not AI.</>
        : <><b>AI provider configured:</b> {status.provider} · model <code>{status.model}</code>. Runs are user-triggered, sent from this app&apos;s server, and limited to the scope shown before each run. Timeout {Math.round(status.timeoutMs / 1000)} s.</>}</p>
    </div>
  );
}

export const shortId = (id: string) => id.split("-").slice(-1)[0];
export const runWhen = (r: AiRun) => `${r.createdAt.slice(0, 10)} ${r.createdAt.slice(11, 16)} AST`;
