"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building, Database, Lock, Mail, Shield, Sparkles, TrendingUp, Layers, Leaf, BarChart3, Landmark } from "lucide-react";
import type { Role, SectorId } from "@/lib/types";
import { INSTITUTION, fmtTime } from "@/data";
import { ROLES, useDemo } from "@/state/DemoProvider";
import { Mark, Skyline, Wordmark } from "./Brand";

function SimBadge() {
  return <span className="inline-flex items-center gap-1 rounded-full border border-gd-500/60 bg-gd-100 px-2 py-0.5 text-[11px] font-semibold text-gd-700"><Lock size={11} aria-hidden />Simulated access — nothing is verified</span>;
}

/** Simulated access form shared by all entry variants. Submitting never authenticates anything. */
function AccessForm({ variant, sectorId, identifierLabel, identifierValue, emailValue, tone = "plain" }: { variant: string; sectorId?: SectorId; identifierLabel: string; identifierValue: string; emailValue: string; tone?: "plain" | "serif" }) {
  const router = useRouter();
  const { enter, role: savedRole } = useDemo();
  const [role, setRole] = useState<Role>(savedRole);
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    enter(role, sectorId);
    router.push(sectorId ? `/sector/${sectorId}` : "/workspaces");
  };
  const input = "w-full rounded-lg border border-line bg-ivory/60 py-2.5 pl-10 pr-3 text-sm text-ink-2";
  return (
    <form onSubmit={go} className="space-y-4" aria-label={`Simulated access, ${variant}`}>
      <div>
        <label htmlFor={`${variant}-inst`} className="mb-1 flex items-center justify-between text-sm font-medium text-ink">{identifierLabel}<span className="text-[11px] font-normal text-muted">simulated</span></label>
        <div className="relative"><Building size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><input id={`${variant}-inst`} readOnly value={identifierValue} className={input} /></div>
      </div>
      <div>
        <label htmlFor={`${variant}-mail`} className="mb-1 flex items-center justify-between text-sm font-medium text-ink">Work email<span className="text-[11px] font-normal text-muted">simulated — not checked</span></label>
        <div className="relative"><Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><input id={`${variant}-mail`} readOnly value={emailValue} className={input} /></div>
      </div>
      <fieldset>
        <legend className="mb-1 w-full text-sm font-medium text-ink"><span className="flex items-center justify-between gap-2">Demonstration role<span className="text-[11px] font-normal text-muted">simulated — not a security control</span></span></legend>
        <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-ivory-2 p-1">
          {ROLES.map((r) => (
            <label key={r} className={`cursor-pointer rounded-md px-2 py-1.5 text-center text-sm font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-em-700 ${role === r ? "bg-em-800 text-white shadow-sm" : "text-ink-2 hover:bg-white"}`}>
              <input type="radio" name={`${variant}-role`} value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />{r}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className={`flex w-full items-center justify-center gap-2 rounded-lg bg-em-800 px-4 py-3 text-[15px] font-semibold text-white hover:bg-em-900 ${tone === "serif" ? "" : ""}`}>Enter demonstration <ArrowRight size={16} aria-hidden /></button>
      <p className="text-xs leading-relaxed text-muted">No credentials are collected or verified. The prototype runs in this browser with fictional data.</p>
    </form>
  );
}

const Foot = () => <>Illustrative data · Interface design | {fmtTime(INSTITUTION.asOf)}</>;

/* ---------------- Generic institutional entry (generic reference) ---------------- */
export function GenericEntry() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative isolate flex min-h-[420px] flex-col justify-between overflow-hidden bg-ivory-2 p-6 sm:p-10 lg:min-h-screen">
        <Skyline className="absolute inset-0 -z-10 h-full w-full opacity-90" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ivory via-ivory/80 to-transparent" aria-hidden />
        <div className="flex items-center gap-3"><Mark size={44} /><div><p className="font-serif text-xl font-semibold tracking-[0.2em] text-ink">TIGERIS <span className="text-gd-700">AI OS</span></p><p className="text-sm text-ink-2">Intelligence into Capability. Capital into Sovereign Advantage.</p></div></div>
        <div className="my-10 max-w-xl">
          <h1 className="font-serif text-4xl leading-[1.08] text-ink sm:text-5xl">Sovereign intelligence.<br />Institutional control.</h1>
          <div className="mt-4 h-0.5 w-14 bg-gd-500" aria-hidden />
          <p className="mt-4 text-lg text-ink-2">An AI-native operating layer for sovereign capital intelligence across eight sectors, shown here as a demonstration on fictional data.</p>
        </div>
        <p className="text-sm text-ink-2">Demonstration prototype · Stage 2</p>
      </section>
      <section className="flex flex-col justify-center bg-ivory p-4 sm:p-10">
        <div className="card mx-auto w-full max-w-lg p-6 shadow-card sm:p-8">
          <SimBadge />
          <h2 className="mt-3 font-serif text-3xl text-ink">Institutional demonstration</h2>
          <p className="mt-1 text-ink-2">Enter the TIGERIS demonstration for {INSTITUTION.name}.</p>
          <div className="mt-6"><AccessForm variant="generic" identifierLabel="Institution" identifierValue={`${INSTITUTION.name} (demonstration)`} emailValue="demo.user@alnoor-group.example" /></div>
          <div className="mt-7 border-t border-line pt-5">
            <h3 className="font-serif text-lg">Sector entries</h3>
            <p className="text-sm text-ink-2">Branded sign-in variants that converge on the same application.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/entry/energy" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-ivory-2 px-3 py-2 text-sm font-medium hover:border-em-600"><Leaf size={15} className="text-em-700" aria-hidden />Energy & Oil and Gas</Link>
              <Link href="/entry/banking" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-ivory-2 px-3 py-2 text-sm font-medium hover:border-em-600"><BarChart3 size={15} className="text-em-700" aria-hidden />Banking & Fintech</Link>
              <span className="inline-flex items-center gap-1.5 rounded-lg px-1 py-2 text-sm text-ink-2"><Layers size={15} className="text-em-700" aria-hidden />All eight sectors after entry</span>
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-muted"><Foot /></p>
      </section>
    </div>
  );
}

/* ---------------- Energy & Oil and Gas entry (energy reference) ---------------- */
export function EnergyEntry() {
  const pillars = [{ I: TrendingUp, t: "Intelligence", d: "Deeper insight across energy markets" }, { I: Layers, t: "Foresight", d: "Sharper decisions for a changing world" }, { I: Leaf, t: "Enduring value", d: "Sustainable growth for future generations" }];
  return (
    <div className="min-h-screen bg-ivory">
      <header className="flex flex-wrap items-center gap-4 border-b border-line bg-white/70 px-5 py-3 sm:px-10">
        <Wordmark />
        <span className="hidden h-8 w-px bg-line sm:block" aria-hidden />
        <div><p className="font-semibold">Al Noor Energy Authority</p><p className="text-xs text-muted">Energy & Oil · Sovereign Capital Intelligence</p></div>
        <Link href="/" className="ml-auto text-sm font-medium text-em-700 underline underline-offset-2">Main entry</Link>
      </header>
      <div className="grid lg:grid-cols-[1.05fr_1fr]">
        <section className="relative isolate overflow-hidden p-6 sm:p-10 lg:min-h-[calc(100vh-65px)]">
          <Skyline className="absolute inset-0 -z-10 h-full w-full" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ivory via-ivory/85 to-ivory/10" aria-hidden />
          <p className="eyebrow max-w-xs leading-6">Sovereign intelligence<br />for a more secure<br />energy tomorrow</p>
          <h1 className="mt-6 font-sans text-5xl font-extrabold tracking-tight text-em-900 sm:text-6xl">TIGERIS <span className="text-gd-500">AI OS</span></h1>
          <p className="mt-1 text-2xl text-ink">Sovereign Capital Intelligence</p>
          <div className="mt-4 h-0.5 w-14 bg-gd-500" aria-hidden />
          <p className="mt-5 max-w-lg text-lg text-ink-2">A demonstration of an operating layer for energy and oil sovereign capital: production, dependencies, resilience and capital exposure.</p>
          <ul className="mt-8 grid max-w-xl gap-5 sm:grid-cols-3">{pillars.map(({ I, t, d }) => (
            <li key={t}><span className="grid h-10 w-10 place-items-center rounded-full border border-gd-500 text-gd-700"><I size={18} aria-hidden /></span><p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-em-900">{t}</p><p className="text-sm text-ink-2">{d}</p></li>
          ))}</ul>
        </section>
        <section className="p-4 sm:p-10">
          <div className="card mx-auto max-w-xl p-6 shadow-card sm:p-8">
            <p className="eyebrow">Welcome to</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-em-900">Al Noor Energy Authority</h2>
            <p className="text-lg text-ink-2">Energy & Oil <span className="px-1 text-muted">|</span> Sovereign Capital Intelligence</p>
            <div className="mt-3 h-0.5 w-12 bg-gd-500" aria-hidden />
            <h3 className="mt-5 font-semibold">Enter the Energy demonstration</h3>
            <div className="mb-4 mt-2"><SimBadge /></div>
            <AccessForm variant="energy" sectorId="energy" identifierLabel="Institution" identifierValue="Al Noor Energy Authority (demonstration)" emailValue="analyst@alnoor-energy.example" />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-ivory p-3 text-xs text-ink-2"><p className="mb-0.5 flex items-center gap-1.5 text-sm font-semibold text-ink"><Shield size={14} className="text-em-700" aria-hidden />Simulated access</p>Role selection is a demonstration feature. No MFA or SSO is implemented.</div>
              <div className="rounded-lg border border-line bg-ivory p-3 text-xs text-ink-2"><p className="mb-0.5 flex items-center gap-1.5 text-sm font-semibold text-ink"><Database size={14} className="text-em-700" aria-hidden />Demonstration data</p>Fictional records, SAR. Runs locally in your browser.</div>
            </div>
          </div>
          <p className="mt-4 text-center text-[11px] text-muted"><Foot /></p>
        </section>
      </div>
    </div>
  );
}

/* ---------------- Banking & Fintech entry (banking reference) ---------------- */
export function BankingEntry() {
  return (
    <div className="flex min-h-screen flex-col bg-ivory">
      <header className="flex flex-wrap items-center gap-4 border-b border-line bg-white/80 px-5 py-3 sm:px-10">
        <Wordmark />
        <span className="hidden h-8 w-px bg-line sm:block" aria-hidden />
        <div className="flex items-center gap-2"><Landmark size={22} className="text-gd-700" aria-hidden /><div><p className="font-serif text-base leading-tight">Al Noor Financial Authority</p><p className="font-serif text-xs text-muted">Banking & Fintech</p></div></div>
        <Link href="/" className="ml-auto text-sm font-medium text-em-700 underline underline-offset-2">Main entry</Link>
      </header>
      <main className="relative isolate flex-1 overflow-hidden">
        <Skyline className="absolute inset-0 -z-10 h-full w-full" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ivory/90 via-ivory/40 to-transparent" aria-hidden />
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-10 sm:px-10 lg:min-h-[calc(100vh-130px)] lg:grid-cols-[1.2fr_1fr]">
          <div className="max-w-2xl">
            <p className="eyebrow flex items-center gap-3"><span className="h-px w-10 bg-gd-500" aria-hidden />Sovereign capital intelligence</p>
            <h1 className="mt-4 font-serif text-4xl leading-[1.1] text-em-950 sm:text-5xl lg:text-6xl">Intelligence for a More Resilient Financial Future</h1>
            <p className="mt-5 max-w-xl text-lg text-ink-2">A demonstration of TIGERIS AI OS for banking and fintech: capital, liquidity, credit exposure and payment resilience, on fictional data.</p>
          </div>
          <div className="card w-full max-w-md justify-self-center p-6 shadow-card sm:p-7 lg:justify-self-end">
            <div className="border-b border-line pb-4 text-center"><Landmark size={34} className="mx-auto text-gd-700" aria-hidden /><p className="mt-1 font-serif text-lg">Al Noor Financial Authority</p><p className="font-serif text-sm text-muted">Banking & Fintech</p></div>
            <div className="py-4 text-center"><h2 className="font-serif text-2xl">Institutional sign-in</h2><p className="text-ink-2">Access the TIGERIS demonstration</p><div className="mt-2 flex justify-center"><SimBadge /></div></div>
            <AccessForm variant="banking" sectorId="banking" identifierLabel="Institution code" identifierValue="ANFA-DEMO" emailValue="name@alnoor-finance.example" />
            <div className="mt-4 flex gap-2 rounded-lg bg-ivory-2 p-3 text-xs text-ink-2"><Sparkles size={16} className="mt-0.5 shrink-0 text-em-700" aria-hidden /><p><b className="text-ink">Simulated access.</b> No MFA or single sign-on exists in this prototype; the role choice is a demonstration feature.</p></div>
          </div>
        </div>
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-white/80 px-5 py-3 text-xs text-muted sm:px-10"><span>TIGERIS AI OS · Demonstration prototype</span><span><Foot /></span></footer>
    </div>
  );
}
