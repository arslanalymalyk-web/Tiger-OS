"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitBranch, LayoutGrid, LayoutDashboard, Map, X, BookOpen } from "lucide-react";
import { SECTORS } from "@/data";
import { useDemo } from "@/state/DemoProvider";
import { Wordmark } from "./Brand";
import { RecordDrawer } from "./RecordDrawer";
import { TopBar } from "./TopBar";
import { SECTOR_ICONS } from "./ui";

function NavLink({ href, icon: Icon, children, onNav }: { href: string; icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode; onNav: () => void }) {
  const path = usePathname();
  const active = path === href;
  return (
    <Link href={href} onClick={onNav} aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${active ? "bg-white/15 font-semibold text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
      <Icon size={16} className={active ? "text-gd-300" : "text-white/60"} />{children}
    </Link>
  );
}

function Sidebar({ onNav }: { onNav: () => void }) {
  const { role } = useDemo();
  return (
    <div className="flex h-full flex-col bg-em-900 text-white">
      <div className="border-b border-white/10 px-4 py-4"><Wordmark dark href="/workspaces" /></div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Primary">
        <div className="space-y-0.5">
          <NavLink href="/workspaces" icon={LayoutGrid} onNav={onNav}>Workspaces</NavLink>
          <NavLink href="/overview" icon={LayoutDashboard} onNav={onNav}>Institutional overview</NavLink>
        </div>
        <div>
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">Command centres</p>
          <div className="space-y-0.5">{SECTORS.map((s) => <NavLink key={s.id} href={`/sector/${s.id}`} icon={SECTOR_ICONS[s.id]} onNav={onNav}>{s.name}</NavLink>)}</div>
        </div>
        <div className="space-y-0.5">
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">Reference</p>
          <NavLink href="/methodology" icon={BookOpen} onNav={onNav}>Methodology</NavLink>
          <NavLink href="/roadmap" icon={Map} onNav={onNav}>Stages and roadmap</NavLink>
        </div>
      </nav>
      <div className="border-t border-white/10 p-4 text-xs text-white/70">
        <p className="flex items-center gap-1.5"><GitBranch size={12} />Stage 1 prototype</p>
        <p className="mt-1">Simulated role: <b className="text-white">{role}</b></p>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen lg:block"><Sidebar onNav={() => {}} /></aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-em-950/50" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[85vw]">
            <button onClick={() => setOpen(false)} aria-label="Close navigation" className="absolute right-2 top-3 z-10 rounded p-1 text-white"><X size={18} /></button>
            <Sidebar onNav={() => setOpen(false)} />
          </div>
        </div>
      )}
      <div className="min-w-0">
        <TopBar onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-[1280px] px-3 py-5 sm:px-5 sm:py-6">{children}</main>
        <footer className="border-t border-line px-5 py-4 text-xs text-muted">TIGERIS AI OS · Stage 1 demonstration · All data fictional and illustrative · No production, hosting or compliance claims.</footer>
      </div>
      <Suspense fallback={null}><RecordDrawer /></Suspense>
    </div>
  );
}
