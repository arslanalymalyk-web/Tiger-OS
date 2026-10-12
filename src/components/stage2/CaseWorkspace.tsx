"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { SECTOR_BY_ID } from "@/data";
import { CASE_STATUSES, CLOSURE_REASONS, type CaseAggregate, type CaseStatus } from "@/lib/stage2/types";
import { NEXT_STATUS, checkTransition, openReviews } from "@/lib/stage2/rules";
import { isBriefStale } from "@/lib/stage2/brief";
import { transitionCase } from "@/lib/stage2/mutations";
import { personLabel } from "@/lib/stage2/catalog";
import { useDemo } from "@/state/DemoProvider";
import { DemoTag, IdTag } from "../ui";
import { Btn, CaseStatusBadge, ErrorList, Notice, PriorityBadge, RoleNotice, SelectField, Skeleton, StaleBadge, TextArea, fmtDate, useAction } from "./common";
import { OverviewTab } from "./OverviewTab";
import { EvidenceTab } from "./EvidenceTab";
import { TasksTab } from "./TasksTab";
import { ReviewTab } from "./ReviewTab";
import { BriefTab } from "./BriefTab";
import { ActivityTab } from "./ActivityTab";
import { AssistPanel } from "../stage3/AssistPanel";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "evidence", label: "Hypotheses & evidence" },
  { id: "tasks", label: "Tasks" },
  { id: "review", label: "Expert review" },
  { id: "brief", label: "Decision brief" },
  { id: "ai", label: "AI assistance" },
  { id: "activity", label: "Activity" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function CaseWorkspace({ caseId }: { caseId: string }) {
  return <Suspense fallback={<Skeleton />}><Inner caseId={caseId} /></Suspense>;
}

function Inner({ caseId }: { caseId: string }) {
  const { world, hydrated, setSector } = useDemo();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const c = world.caseById.get(caseId);
  const tab = (TABS.find((t) => t.id === sp.get("tab"))?.id ?? "overview") as TabId;
  const focus = sp.get("focus");
  useEffect(() => { if (c) setSector(c.sectorId); }, [c, setSector]);
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(`focus-${focus}`);
    el?.scrollIntoView({ block: "center" });
    el?.classList.add("ring-2", "ring-em-600");
  }, [focus, tab, c?.revision]);

  if (!hydrated) return <Skeleton />;
  if (!c) {
    return (
      <div className="card p-8 text-center" data-testid="case-not-found">
        <h1 className="font-serif text-2xl">Case not found</h1>
        <p className="mt-2 text-sm text-ink-2">No case has the ID <code>{caseId}</code> in this browser&apos;s demonstration state. It may have been removed by Reset.</p>
        <p className="mt-4"><Link href="/cases" className="font-semibold text-em-700 underline">Back to cases</Link></p>
      </div>
    );
  }
  const setTab = (t: TabId) => router.replace(`${pathname}?tab=${t}`, { scroll: false });
  const sector = SECTOR_BY_ID[c.sectorId].sector;
  const stale = isBriefStale(c);
  const open = openReviews(c).length;

  return (
    <div className="space-y-5" data-testid={`case-workspace-${c.id}`}>
      <header className="card p-5 sm:p-6">
        <nav aria-label="Breadcrumb" className="mb-2 text-xs text-muted"><Link href="/cases" className="underline">Intelligence cases</Link> / {sector.short}</nav>
        <div className="flex flex-wrap items-center gap-2"><CaseStatusBadge status={c.status} /><PriorityBadge priority={c.priority} /><IdTag id={c.id} /><DemoTag />{stale && <StaleBadge />}</div>
        <h1 className="mt-2 font-serif text-2xl sm:text-3xl" data-testid="case-title">{c.title}</h1>
        <p className="mt-2 max-w-3xl text-[15px] text-ink-2"><b className="text-ink">Investigation question:</b> {c.question || <em>Not yet written</em>}</p>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Entity</dt><dd>{sector.entityName}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Owner</dt><dd>{personLabel(c.ownerId)}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Due</dt><dd>{fmtDate(c.dueDate)}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Signals</dt><dd>{c.signalIds.length ? c.signalIds.join(", ") : "None (standalone)"}</dd></div>
        </dl>
        <Stepper status={c.status} />
      </header>
      <RoleNotice />
      <StatusPanel c={c} />

      <div role="tablist" aria-label="Case sections" className="flex gap-1 overflow-x-auto border-b border-line" data-testid="case-tabs">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}
            className={`whitespace-nowrap rounded-t-lg px-3.5 py-2 text-sm font-medium ${tab === t.id ? "border-b-2 border-em-700 bg-white text-em-900" : "text-ink-2 hover:bg-ivory-2"}`}>
            {t.label}{t.id === "review" && open ? <span className="ml-1.5 rounded-full bg-gd-100 px-1.5 text-[11px] text-gd-700">{open}</span> : null}{t.id === "brief" && stale ? <span className="ml-1.5 rounded-full bg-am-100 px-1.5 text-[11px] text-am-800">!</span> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-5">
        {tab === "overview" && <OverviewTab c={c} />}
        {tab === "evidence" && <EvidenceTab c={c} />}
        {tab === "tasks" && <TasksTab c={c} />}
        {tab === "review" && <ReviewTab c={c} />}
        {tab === "brief" && <BriefTab c={c} />}
        {tab === "ai" && <AssistPanel c={c} />}
        {tab === "activity" && <ActivityTab c={c} />}
      </div>
    </div>
  );
}

function Stepper({ status }: { status: CaseStatus }) {
  const idx = CASE_STATUSES.indexOf(status);
  return (
    <ol className="mt-4 flex flex-wrap items-center gap-1 text-xs" aria-label="Case status progression">
      {CASE_STATUSES.map((s, i) => (
        <li key={s} className="flex items-center gap-1" aria-current={s === status ? "step" : undefined}>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium ${s === status ? "border-em-800 bg-em-800 text-white" : i < idx ? "border-sg-300 bg-sg-100 text-sg-700" : "border-line bg-white text-muted"}`}>{i < idx && <Check size={11} aria-hidden />}{s}</span>
          {i < CASE_STATUSES.length - 1 && <ArrowRight size={12} className="text-muted" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

/** Central status transitions: every blocked move shows why. */
function StatusPanel({ c }: { c: CaseAggregate }) {
  const { role, hydrated } = useDemo();
  const { run, errors, notice, clear } = useAction();
  const router = useRouter();
  const pathname = usePathname();
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState<string>(CLOSURE_REASONS[0]);
  const [note, setNote] = useState("");
  const targets = NEXT_STATUS[c.status];
  const first = useRef<HTMLDivElement>(null);
  if (!hydrated) return <Skeleton label="Loading…" />;
  const go = (to: CaseStatus) => {
    clear();
    if (to === "Closed") { setClosing(true); return; }
    if (to === "Expert review") { router.replace(`${pathname}?tab=review`, { scroll: false }); return; }
    run((w, ctx) => transitionCase(w, ctx, c.id, to), `Status is now ${to}.`);
  };
  return (
    <section className="card p-4 sm:p-5" aria-label="Status" ref={first} data-testid="status-panel">
      <h2 className="text-sm font-semibold">Move this case</h2>
      <p className="mb-3 mt-1 text-xs text-muted">Transitions are validated centrally. Closing a case does not mean a decision was approved or executed.</p>
      <ul className="space-y-3">
        {targets.map((to) => {
          const chk = checkTransition(c, to, role);
          const label = c.status === "Closed" ? "Reopen (return to Investigating)" : to === "Expert review" ? "Request expert review →" : to === "Investigating" && c.status !== "Draft" ? `Return to Investigating` : `Move to ${to}`;
          return (
            <li key={to} className="rounded-lg border border-line p-3" data-testid={`transition-${to.replace(/\s/g, "-")}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{c.status} → {to}</span>
                <Btn kind={chk.allowed ? "primary" : "secondary"} onClick={() => go(to)} disabled={!chk.allowed && to !== "Expert review"} testId={`go-${to.replace(/\s/g, "-")}`}>{label}</Btn>
              </div>
              {!chk.allowed && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink-2" data-testid="blocked-reasons">{chk.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
              {chk.hint && <p className="mt-2 text-xs text-muted">{chk.hint}</p>}
            </li>
          );
        })}
      </ul>
      {closing && (
        <div className="mt-3 space-y-3 rounded-lg border border-line bg-ivory p-3" data-testid="close-form">
          <p className="text-sm font-semibold">Close this case</p>
          <p className="text-xs text-ink-2">Closing records that the investigation is finished. It does not record an approval or execution of any decision.</p>
          <SelectField label="Closure reason" value={reason} onChange={setReason} options={CLOSURE_REASONS.map((r) => ({ value: r, label: r }))} testId="close-reason" />
          <TextArea label="Closure note" value={note} onChange={setNote} rows={2} required testId="close-note" />
          <div className="flex gap-2"><Btn onClick={() => { const r = run((w, ctx) => transitionCase(w, ctx, c.id, "Closed", { reason, note }), "Case closed. No decision was approved or executed."); if (r.ok) setClosing(false); }} testId="confirm-close">Close case</Btn><Btn kind="secondary" onClick={() => { setClosing(false); clear(); }}>Cancel</Btn></div>
        </div>
      )}
      <div className="mt-3 space-y-2"><ErrorList errors={errors} />{notice && <Notice>{notice}</Notice>}</div>
      {c.closure && <p className="mt-3 rounded-lg bg-ivory-2 p-3 text-sm text-ink-2" data-testid="closure-info"><b>Closed</b> {c.closure.at.slice(0, 10)} — {c.closure.reason}. {c.closure.note} <span className="text-muted">(Closing does not mean a decision was approved or executed.)</span></p>}
    </section>
  );
}
