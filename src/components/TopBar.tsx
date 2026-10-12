"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, Info, Landmark, LogOut, Menu, RotateCcw, Search, X } from "lucide-react";
import { INSTITUTION, SECTORS, SECTOR_BY_ID, fmtTime } from "@/data";
import { WORLD_KIND_LABEL, searchWorld } from "@/lib/stage2/world";
import type { Role, SectorId } from "@/lib/types";
import { useRecordNav } from "@/lib/useRecordNav";
import { ROLES, useDemo } from "@/state/DemoProvider";
import { STAGES } from "@/data/roadmap";
import { createPortal } from "react-dom";
import { ModalDialog } from "./ModalDialog";
import { DemoTag, SECTOR_ICONS } from "./ui";

function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOut();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onOut();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [active, onOut, ref]);
}

function Menu_({ label, icon, children, align = "left", width = "w-72", testId }: { label: React.ReactNode; icon?: React.ReactNode; children: (close: () => void) => React.ReactNode; align?: "left" | "right"; width?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useOutside(ref, () => setOpen(false), open);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") btn.current?.focus(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button ref={btn} data-testid={testId} onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open} className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink hover:border-em-600">
        {icon}<span className="max-w-[8rem] truncate">{label}</span><ChevronDown size={14} className="text-muted" aria-hidden />
      </button>
      {open && <div className={`absolute z-40 mt-1 ${width} ${align === "right" ? "right-0" : "left-0"} max-w-[calc(100vw-1.5rem)] rounded-xl border border-line bg-white p-1.5 shadow-card`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function InstitutionSelector() {
  const router = useRouter();
  return (
    <Menu_ label={INSTITUTION.short} icon={<span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Institution</span>} width="w-64">
      {(close) => (
        <div>
          <div className="rounded-lg bg-sg-50 p-2.5">
            <p className="text-sm font-semibold">{INSTITUTION.name}</p>
            <p className="text-xs text-muted">{INSTITUTION.note}</p>
            <p className="mt-1 text-xs text-ink-2">Only one demonstration institution exists in Stage 1. Multi-institution scope is outside Stage 1.</p>
          </div>
          <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Sector entities</p>
          {SECTORS.map((s) => (
            <button key={s.id} onClick={() => { close(); router.push(`/sector/${s.id}`); }} className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-ivory-2">{s.entityName}</button>
          ))}
        </div>
      )}
    </Menu_>
  );
}

function SectorSelector() {
  const router = useRouter();
  const { sectorId: saved, hydrated } = useDemo();
  const path = usePathname();
  // The route is authoritative on sector pages; elsewhere wait for the persisted value to avoid showing a stale default.
  const routeId = path.startsWith("/sector/") ? path.split("/")[2] : null;
  const sectorId = (routeId && routeId in SECTOR_BY_ID ? routeId : hydrated ? saved : null) as SectorId | null;
  const cur = sectorId ? SECTOR_BY_ID[sectorId].sector : null;
  const Icon = sectorId ? SECTOR_ICONS[sectorId] : Landmark;
  return (
    <Menu_ testId="sector-selector" label={cur?.short ?? "Select sector"} icon={<><span className="hidden text-[10px] font-semibold uppercase tracking-wider text-muted sm:inline">Sector</span><Icon size={14} className="text-em-700" aria-hidden /></>}>
      {(close) => SECTORS.map((s) => {
        const I = SECTOR_ICONS[s.id];
        return (
          <button key={s.id} onClick={() => { close(); router.push(`/sector/${s.id}`); }} aria-current={s.id === sectorId ? "true" : undefined}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-ivory-2 ${s.id === sectorId ? "bg-sg-100 font-semibold" : ""}`}>
            <I size={16} className="text-em-700" aria-hidden />{s.name}
          </button>
        );
      })}
    </Menu_>
  );
}

function RoleSelector() {
  const { role, setRole, hydrated } = useDemo();
  return (
    <label className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1 text-sm">
      <span className="hidden text-[10px] font-semibold uppercase leading-tight tracking-wider text-muted sm:block">Simulated<br />role</span><span className="text-[10px] font-semibold uppercase tracking-wider text-muted sm:hidden" aria-hidden>Role</span>
      <select value={hydrated ? role : ""} disabled={!hydrated} onChange={(e) => setRole(e.target.value as Role)} aria-label="Simulated demonstration role" className="min-w-[5.5rem] bg-transparent py-0.5 font-medium text-ink">
        {!hydrated && <option value="">Loading…</option>}
        {ROLES.map((r) => <option key={r}>{r}</option>)}
      </select>
    </label>
  );
}

function SearchBox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { openRecord } = useRecordNav();
  const { world } = useDemo();
  const router = useRouter();
  const hits = useMemo(() => searchWorld(world, q), [world, q]);
  useOutside(ref, () => setOpen(false), open);
  const choose = (h: (typeof hits)[number]) => { input.current?.focus(); setOpen(false); setQ(""); if (h.href) router.push(h.href); else openRecord(h.id); };
  return (
    <div ref={ref} className="relative w-full">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === "Enter" && hits[active]) choose(hits[active]);
        }}
        placeholder="Search records, cases and evidence (e.g. Sahil, LCR, SIG-LOG-01)" aria-label="Search seeded demonstration records" role="combobox" aria-expanded={open && q.length > 0} aria-controls="search-results" aria-autocomplete="list" aria-activedescendant={open && hits[active] ? `hit-${hits[active].id}` : undefined}
        className="w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm placeholder:text-muted focus:border-em-600" />
      {open && q.trim() && (
        <div id="search-results" role="listbox" className="absolute z-40 mt-1 max-h-[70vh] w-full min-w-[min(28rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-card">
          {hits.length === 0 ? <p className="p-3 text-sm text-muted">No seeded record matches “{q}”.</p> : hits.map((h, i) => (
            <button key={`${h.kind}-${h.id}`} id={`hit-${h.id}`} tabIndex={-1} role="option" aria-selected={i === active} onClick={() => choose(h)} onMouseEnter={() => setActive(i)}
              className={`block w-full rounded-lg p-2.5 text-left ${i === active ? "bg-sg-100" : ""}`}>
              <span className="flex flex-wrap items-center gap-2"><span className="rounded bg-ivory-2 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2">{WORLD_KIND_LABEL[h.kind]}</span><span className="font-mono text-[11px] text-muted">{h.id}</span><span className="text-[11px] text-muted">{SECTOR_BY_ID[h.sectorId].sector.short}</span></span>
              <span className="mt-0.5 block text-sm font-medium text-ink">{h.title}</span>
            </button>
          ))}
          <p className="border-t border-line-2 px-2.5 py-1.5 text-[11px] text-muted">Searches fictional records, current cases, tasks, findings, briefs and readable evidence in this browser.</p>
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { readIds, unreadCount, markRead, markUnread, markAllRead, hydrated, world } = useDemo();
  const { openRecord } = useRecordNav();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  useOutside(ref, () => setOpen(false), open);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") bell.current?.focus(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button ref={bell} onClick={() => setOpen((o) => !o)} aria-label={hydrated ? `Notifications, ${unreadCount} unread` : "Notifications"} aria-expanded={open} className="relative rounded-lg border border-line bg-white p-2 text-ink hover:border-em-600">
        <Bell size={18} aria-hidden />
        {hydrated && unreadCount > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-rd-600 px-1 text-[10px] font-bold leading-[18px] text-white" data-testid="unread-count">{unreadCount}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 max-h-[75vh] w-[26rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-line bg-white shadow-card">
          <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-3 py-2">
            <p className="text-sm font-semibold">Notifications <span className="font-normal text-muted">· seeded and local</span></p>
            <button onClick={markAllRead} disabled={unreadCount === 0} className="text-xs font-medium text-em-700 underline underline-offset-2 disabled:text-muted disabled:no-underline">Mark all read</button>
          </div>
          <ul>
            {world.notifications.map((n) => {
              const unread = !readIds.includes(n.id);
              return (
                <li key={n.id} className={`border-b border-line-2 p-3 ${unread ? "bg-sg-50" : ""}`} data-unread={unread}>
                  <button className="block w-full text-left" onClick={() => { markRead(n.id); if (n.recordId) { bell.current?.focus(); setOpen(false); openRecord(n.recordId); } else setExpanded(expanded === n.id ? null : n.id); }}>
                    <span className="flex items-start gap-2">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-em-600" : "bg-transparent border border-line"}`} aria-label={unread ? "Unread" : "Read"} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${unread ? "font-semibold" : "font-medium"} text-ink`}>{n.title}</span>
                        <span className="block text-xs text-ink-2">{n.body}</span>
                        <span className="mt-0.5 block text-[11px] text-muted">{SECTOR_BY_ID[n.sectorId].sector.short} · {fmtTime(n.at)}{n.recordId ? ` · opens ${n.recordId}` : " · informational"}</span>
                      </span>
                    </span>
                  </button>
                  {!n.recordId && expanded === n.id && <p className="ml-4 mt-1 text-xs text-ink-2">No linked record. This notice is informational.</p>}
                  <button onClick={() => (unread ? markRead(n.id) : markUnread(n.id))} className="ml-4 mt-1 text-[11px] font-medium text-em-700 underline underline-offset-2">{unread ? "Mark as read" : "Mark as unread"}</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const titleId = useId();
  // Rendered in a portal so that #app-root (which contains the top bar) can be made inert while the dialog is open.
  return createPortal(
    <ModalDialog labelledBy={titleId} onClose={onClose}
      className={`m-auto max-h-[90vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl bg-ivory p-0 text-ink shadow-2xl outline-none backdrop:bg-em-950/50 ${wide ? "max-w-2xl" : "max-w-md"}`}>
      <div className="p-5 sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3"><h2 id={titleId} className="font-serif text-xl">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded-md p-1 hover:bg-ivory-2"><X size={18} /></button></div>
        {children}
      </div>
    </ModalDialog>,
    document.body,
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="About this prototype" onClose={onClose} wide>
      <div className="space-y-3 text-sm leading-relaxed text-ink-2">
        <p><b className="text-ink">TIGERIS</b> is shown as an investor-demonstration prototype of an AI-native sovereign capital intelligence operating system. This is <b>Stage 3</b>: the Stage 1 command centres and Stage 2 case workflow plus an AI command page and bounded, evidence-grounded assistance (real model calls only if an operator configures a provider; otherwise clearly labelled deterministic demonstration outputs).</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>All institutions, people, figures and evidence are <b>fictional demonstration data</b>. Monetary values are in SAR.</li>
          <li>Everything runs in your browser from seeded records. There are <b>no live feeds, no integrations, and no AI execution</b>. Briefs are compiled by deterministic templates; no message is sent to any expert.</li>
          <li>Sign-in fields and the Analyst / Expert / Approver selector are <b>simulated access</b>. They are a demonstration feature, not a security control.</li>
          <li>The prototype makes no claim of production readiness, sovereign hosting or compliance certification.</li>
          <li>Your changes (cases, evidence links, tasks, reviews, briefs, activity, notification state) are stored in this browser only and described as local demonstration activity, not an audit log. “Reset demonstration” restores the seeded state.</li><li>“Reviewed” and “Closed” never mean a decision was approved or executed; approvals are not recorded in this stage.</li>
        </ul>
        <div className="rounded-lg bg-white p-3 ring-1 ring-line">
          <p className="mb-1 font-semibold text-ink">Stage boundaries</p>
          <ol className="space-y-0.5 text-xs">{STAGES.map((s) => <li key={s.stage}><b>Stage {s.stage}{s.status === "delivered" ? " (this build)" : ""}:</b> {s.title}</li>)}</ol>
        </div>
      </div>
    </Modal>
  );
}

function ResetModal({ onClose }: { onClose: () => void }) {
  const { reset } = useDemo();
  const router = useRouter();
  return (
    <Modal title="Reset demonstration?" onClose={onClose}>
      <p className="text-sm text-ink-2">This restores all seeded records and removes every Stage 2 and Stage 3 change made in this browser: cases you created, edits, evidence links, tasks, expert reviews, brief versions, assistant runs and proposals, activity and local notifications. Sector returns to Energy, role to Analyst, and all notifications become unread. The saved state is cleared. This cannot be undone.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-ivory-2">Cancel</button>
        <button onClick={() => { reset(); onClose(); router.replace("/workspaces"); }} className="rounded-lg bg-em-800 px-4 py-2 text-sm font-semibold text-white hover:bg-em-900">Reset demonstration</button>
      </div>
    </Modal>
  );
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const [about, setAbout] = useState(false);
  const [reset, setReset] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  void pathname;
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-ivory/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 sm:gap-2 sm:px-5">
          <button onClick={onMenu} className="rounded-lg border border-line bg-white p-2 lg:hidden" aria-label="Open navigation"><Menu size={18} /></button>
          <SectorSelector />
          <div className="order-last w-full md:order-none md:min-w-[14rem] md:max-w-md md:flex-1"><SearchBox /></div>
          <div className="ml-auto flex items-center gap-2">
            <RoleSelector />
            <Notifications />
            <button onClick={() => setAbout(true)} className="rounded-lg border border-line bg-white p-2 hover:border-em-600" aria-label="About this prototype"><Info size={18} /></button>
            <button onClick={() => setReset(true)} className="hidden items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-2 text-sm hover:border-em-600 2xl:flex"><RotateCcw size={14} aria-hidden />Reset demonstration</button>
            <button onClick={() => setReset(true)} className="rounded-lg border border-line bg-white p-2 hover:border-em-600 2xl:hidden" aria-label="Reset demonstration" title="Reset demonstration"><RotateCcw size={18} /></button>
            <button onClick={() => router.push("/")} className="hidden rounded-lg border border-line bg-white p-2 hover:border-em-600 md:block" aria-label="Exit to entry page" title="Exit to entry page"><LogOut size={18} /></button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-gd-500/30 bg-gd-100 px-3 py-1 text-xs text-gd-700 sm:px-5" role="status">
          <span className="flex items-center gap-2"><DemoTag /><span className="hidden sm:inline">Fictional institution and records · SAR · no live data · simulated roles</span></span>
          <span className="tabular-nums">Data as of {fmtTime(INSTITUTION.asOf)}</span>
        </div>
      </header>
      {about && <AboutModal onClose={() => setAbout(false)} />}
      {reset && <ResetModal onClose={() => setReset(false)} />}
    </>
  );
}
