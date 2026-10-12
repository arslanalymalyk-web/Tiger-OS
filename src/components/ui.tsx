"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Eye, Info, Flame, Landmark, Shield, Factory, Truck, Building2, Route, Globe, type LucideIcon } from "lucide-react";
import type { MetricStatus, SectorId, Severity } from "@/lib/types";
import { KIND_LABEL, type RecordKind } from "@/data";

export const SECTOR_ICONS: Record<SectorId, LucideIcon> = {
  energy: Flame, banking: Landmark, insurance: Shield, manufacturing: Factory, logistics: Truck, realestate: Building2, infrastructure: Route, sovereign: Globe,
};

const SEV: Record<Severity, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "bg-rd-100 text-rd-800 border-rd-600/30" },
  high: { label: "High", cls: "bg-am-100 text-am-800 border-am-600/30" },
  moderate: { label: "Moderate", cls: "bg-gd-100 text-gd-700 border-gd-500/40" },
  low: { label: "Low", cls: "bg-sg-100 text-sg-700 border-sg-500/40" },
};
export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEV[severity];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${s.cls}`}>
      {severity === "critical" || severity === "high" ? <AlertTriangle size={12} aria-hidden /> : <Info size={12} aria-hidden />}
      {s.label}
    </span>
  );
}

const ST: Record<MetricStatus, { label: string; cls: string; Icon: LucideIcon }> = {
  ok: { label: "Within tolerance", cls: "bg-sg-100 text-sg-700 border-sg-500/40", Icon: CheckCircle2 },
  watch: { label: "Watch", cls: "bg-am-100 text-am-800 border-am-600/30", Icon: Eye },
  alert: { label: "Alert", cls: "bg-rd-100 text-rd-800 border-rd-600/30", Icon: AlertTriangle },
  info: { label: "Indicator", cls: "bg-ivory-2 text-ink-2 border-line", Icon: Info },
};
export function StatusPill({ status }: { status: MetricStatus }) {
  const { label, cls, Icon } = ST[status];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      <Icon size={12} aria-hidden />
      {label}
    </span>
  );
}

export function DemoTag({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-gd-500/50 bg-gd-100 px-2 py-0.5 text-[11px] font-semibold text-gd-700 ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-gd-500" aria-hidden />
      Demonstration data
    </span>
  );
}

export function KindChip({ kind }: { kind: RecordKind }) {
  return <span className="rounded bg-ivory-2 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2">{KIND_LABEL[kind]}</span>;
}

export function IdTag({ id }: { id: string }) {
  return <code className="rounded bg-ivory-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{id}</code>;
}

export function StageBoundary({ stage, capability, children }: { stage: number; capability: string; children?: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-dashed border-gd-500/60 bg-gd-100/50 p-3 text-sm text-ink-2" role="note">
      <Info size={16} className="mt-0.5 shrink-0 text-gd-700" aria-hidden />
      <p>
        <span className="font-semibold text-ink">Stage {stage} · {capability}.</span> {children ?? "Not part of this stage."}{" "}
        <Link href="/roadmap" className="font-medium text-em-700 underline underline-offset-2">Roadmap</Link>
      </p>
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
