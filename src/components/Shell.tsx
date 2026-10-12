"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitBranch, LayoutGrid, LayoutDashboard, Map, X, BookOpen, FolderSearch, Library, UserCheck } from "lucide-react";
import { SECTORS } from "@/data";
import { useDemo } from "@/state/DemoProvider";
import { Wordmark } from "./Brand";
import { RecordDrawer } from "./RecordDrawer";
import { InstitutionSelector, TopBar } from "./TopBar";
import { Banners } from "./Banners";
import { SECTOR_ICONS } from "./ui";

function NavLink({ href, icon: Icon, children, onNav }: { href: string; icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode; onNav: () => void }) {
  const path = usePathname();
  const active = path === href || (href !== "/overview" && href !== "/workspaces" && path.startsWith(`${href}/`));
  return (
    <Link href={href} onClick={onNav} aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${active ? "bg-white/15 font-semibold text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
      <Icon size={16} className={active ? "text-gd-300" : "text-white/60"} />{children}
    </Link>
  );
}

function Sidebar({ onNav }: { onNav: () => void }) {
  const { role, hydrated } = useDemo();
  return (
    <div className="on-dark flex h-full flex-col bg-em-900 text-white">
      <div className="space-y-3 border-b border-white/10 px-4 py-4"><Wordmark dark href="/workspaces" /><InstitutionSelector /></div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Primary">
        <div className="space-y-0.5">
          <NavLink href="/workspaces" icon={LayoutGrid} onNav={onNav}>Workspaces</NavLink>
          <NavLink href="/overview" icon={LayoutDashboard} onNav={onNav}>Institutional overview</NavLink>
        </div>
        <div className="space-y-0.5">
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">Investigation</p>
          <NavLink href="/cases" icon={FolderSearch} onNav={onNav}>Intelligence cases</NavLink>
          <NavLink href="/evidence" icon={Library} onNav={onNav}>Evidence library</NavLink>
          <NavLink href="/reviews" icon={UserCheck} onNav={onNav}>Expert reviews</NavLink>
        </div>
        <div>
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">Command centres</p>
          <div className="space-y-0.5">{SECTORS.map((s) => <NavLink key={s.id} href={`/sector/${s.id}`} icon={SECTOR_ICONS[s.id]} onNav={onNav}>{s.name}</NavLink>)}</div>
        </div>
        <div className="space-y-0.5">
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">Reference</p>
          <NavLink href="/methodology" icon={BookOpen} onNav={onNav}>Methodology</NavLink>
          <NavLink href="/roadmap" icon={Map} onNav={onNav}>Stages and roadmap</NavLink>
        </div>
      </nav>
      <div className="border-t border-white/10 p-4 text-xs text-white/70">
        <p className="flex items-center gap-1.5"><GitBranch size={12} />Stage 2 prototype</p>
        <p className="mt-1">Simulated role: <b className="text-white">{hydrated ? role : "…"}</b></p>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
    <div id="app-root" className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-em-900 focus:px-4 focus:py-2 focus:text-white">Skip to main content</a>
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
        <Banners />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1280px] px-3 py-5 sm:px-5 sm:py-6">{children}</main>
        <footer className="border-t border-line px-5 py-4 text-xs text-muted">TIGERIS AI OS · Stage 2 demonstration · All data fictional and illustrative · Local browser state only · No production, hosting or compliance claims.</footer>
      </div>
    </div>
    {/* Outside #app-root: the modal drawer must not sit inside the subtree it makes inert. */}
    <Suspense fallback={null}><RecordDrawer /></Suspense>
    </>
  );
}
