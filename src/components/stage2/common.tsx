"use client";

import { useCallback, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, Lock } from "lucide-react";
import type { Action, CaseStatus, Ctx, Priority, Result, ReviewState, WorkState } from "@/lib/stage2/types";
import { can, DEMO_ROLE_DISCLAIMER, ROLE_NOTE } from "@/lib/stage2/rules";
import { useDemo } from "@/state/DemoProvider";

export const fmtDate = (iso: string) => iso.slice(0, 10);
export const fmtDateTime = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} AST`;

const STATUS_CLS: Record<CaseStatus, string> = {
  Draft: "bg-ivory-2 text-ink-2 border-line",
  Investigating: "bg-sg-100 text-sg-700 border-sg-500/40",
  "Expert review": "bg-gd-100 text-gd-700 border-gd-500/40",
  "Brief ready": "bg-em-800 text-white border-em-800",
  Closed: "bg-white text-muted border-line",
};
export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[status]}`} data-testid="case-status">{status}</span>;
}
const PRIO_CLS: Record<Priority, string> = {
  Critical: "bg-rd-100 text-rd-800 border-rd-600/30", High: "bg-am-100 text-am-800 border-am-600/30",
  Medium: "bg-gd-100 text-gd-700 border-gd-500/40", Low: "bg-sg-100 text-sg-700 border-sg-500/40",
};
export function PriorityBadge({ priority }: { priority: Priority }) {
  const Icon = priority === "Critical" || priority === "High" ? AlertTriangle : Info;
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${PRIO_CLS[priority]}`}><Icon size={12} aria-hidden />{priority}</span>;
}
export function ReviewBadge({ state }: { state: ReviewState }) {
  const cls = state === "Requested" ? "bg-gd-100 text-gd-700 border-gd-500/40" : state === "Reviewed" ? "bg-sg-100 text-sg-700 border-sg-500/40" : state === "Revision requested" ? "bg-am-100 text-am-800 border-am-600/30" : "bg-ivory-2 text-muted border-line";
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{state === "Reviewed" ? "Reviewed (not approved)" : state}</span>;
}
export function StaleBadge() {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-am-600/30 bg-am-100 px-2 py-0.5 text-xs font-semibold text-am-800" data-testid="needs-refresh"><AlertTriangle size={12} aria-hidden />Needs refresh</span>;
}
export const IllustrativeBadge = () => <span className="inline-flex items-center gap-1 rounded-full border border-gd-500/50 bg-gd-100 px-2 py-0.5 text-[11px] font-semibold text-gd-700" data-testid="illustrative-label">Illustrative evidence</span>;
export const LocalActivityNote = () => <p className="text-xs text-muted">Local demonstration activity stored in this browser. It is not an immutable or production audit log.</p>;

export function RoleNotice() {
  const { role, hydrated } = useDemo();
  if (!hydrated) return <div className="min-h-[2.75rem] rounded-lg bg-ivory-2" aria-busy="true" />;
  return (
    <div className="flex gap-2 rounded-lg border border-line bg-white p-3 text-xs text-ink-2" role="note" data-testid="role-notice">
      <Lock size={14} className="mt-0.5 shrink-0 text-gd-700" aria-hidden />
      <p><b className="text-ink">{ROLE_NOTE[role]}</b> {DEMO_ROLE_DISCLAIMER}</p>
    </div>
  );
}
/** Explains why a control is unavailable instead of leaving it silently inactive. */
export function Locked({ action, what, children }: { action: Action; what: string; children: ReactNode }) {
  const { role, hydrated } = useDemo();
  if (!hydrated) return null;
  if (can(role, action)) return <>{children}</>;
  return <p className="flex items-center gap-1.5 rounded-lg bg-ivory-2 px-3 py-2 text-xs text-ink-2" data-testid="locked-note"><Lock size={12} className="shrink-0" aria-hidden />The {role} demonstration role cannot {what}. Switch role (top bar) to try it.</p>;
}

export function ErrorList({ errors, id }: { errors: string[]; id?: string }) {
  if (!errors.length) return null;
  return (
    <div id={id} role="alert" className="rounded-lg border border-rd-600/40 bg-rd-100 p-3 text-sm text-rd-800" data-testid="form-errors">
      <p className="mb-1 font-semibold">{errors.length === 1 ? "This could not be saved:" : `${errors.length} things need attention:`}</p>
      <ul className="list-disc space-y-0.5 pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return <p role="status" className="flex items-center gap-1.5 rounded-lg border border-sg-500/40 bg-sg-100 px-3 py-2 text-sm text-sg-700" data-testid="notice"><CheckCircle2 size={14} aria-hidden />{children}</p>;
}

/** Run a mutation and keep its validation errors / success message for display. */
export function useAction() {
  const { act } = useDemo();
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const run = useCallback(<T,>(fn: (w: WorkState, c: Ctx) => Result<T>, success?: string | ((v: T) => string)): Result<T> => {
    const res = act(fn);
    if (res.ok) { setErrors([]); setNotice(success ? (typeof success === "function" ? success(res.value) : success) : null); }
    else { setErrors(res.errors); setNotice(null); }
    return res;
  }, [act]);
  const clear = useCallback(() => { setErrors([]); setNotice(null); }, []);
  return { run, errors, notice, clear, setErrors };
}

const FIELD = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-em-600 disabled:bg-ivory-2";
export function TextField({ label, value, onChange, hint, type = "text", placeholder, required, testId, disabled }: { label: string; value: string; onChange: (v: string) => void; hint?: string; type?: string; placeholder?: string; required?: boolean; testId?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">{label}{required && <span className="text-rd-800"> *</span>}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={FIELD} data-testid={testId} aria-describedby={hint ? `${id}-h` : undefined} disabled={disabled} />
      {hint && <p id={`${id}-h`} className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
export function TextArea({ label, value, onChange, hint, rows = 3, required, testId, disabled }: { label: string; value: string; onChange: (v: string) => void; hint?: string; rows?: number; required?: boolean; testId?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">{label}{required && <span className="text-rd-800"> *</span>}</label>
      <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} data-testid={testId} aria-describedby={hint ? `${id}-h` : undefined} disabled={disabled} />
      {hint && <p id={`${id}-h`} className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
export function SelectField({ label, value, onChange, options, hint, testId, disabled, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; hint?: string; testId?: string; disabled?: boolean; placeholder?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} data-testid={testId} aria-describedby={hint ? `${id}-h` : undefined} disabled={disabled}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p id={`${id}-h`} className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
export const Btn = ({ children, onClick, kind = "primary", type = "button", disabled, testId, title }: { children: ReactNode; onClick?: () => void; kind?: "primary" | "secondary" | "danger"; type?: "button" | "submit"; disabled?: boolean; testId?: string; title?: string }) => (
  <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} title={title}
    className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${kind === "primary" ? "bg-em-800 text-white hover:bg-em-900" : kind === "danger" ? "bg-rd-600 text-white hover:bg-rd-800" : "border border-line bg-white text-ink hover:border-em-600"}`}>{children}</button>
);
export const CardSection = ({ title, children, actions, id }: { title: string; children: ReactNode; actions?: ReactNode; id?: string }) => (
  <section id={id} className="card p-4 sm:p-5">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-ink">{title}</h2>{actions}</div>
    {children}
  </section>
);
export const RecordLink = ({ href, children, testId }: { href: string; children: ReactNode; testId?: string }) => <Link href={href} data-testid={testId} className="font-medium text-em-700 underline underline-offset-2 hover:text-em-900">{children}</Link>;
export const Skeleton = ({ label = "Loading saved demonstration state…" }: { label?: string }) => <div className="min-h-[8rem] animate-pulse rounded-xl bg-ivory-2 p-4 text-sm text-muted motion-reduce:animate-none" role="status" aria-busy="true">{label}</div>;
