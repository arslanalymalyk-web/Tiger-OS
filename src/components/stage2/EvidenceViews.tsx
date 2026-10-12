"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { INSTITUTION, SECTORS, SECTOR_BY_ID } from "@/data";
import type { Evidence, EvidenceVersion } from "@/lib/types";
import { currentVersion, evidenceRefs, versionOf } from "@/data/stage2/blocks";
import { EVIDENCE_BY_ID, EVIDENCE_LIST, SIGNAL_LIST, latestVersion } from "@/lib/stage2/catalog";
import { casesForEvidence } from "@/lib/stage2/world";
import { activeLinks, hypShort } from "@/lib/stage2/brief";
import { linkEvidence } from "@/lib/stage2/mutations";
import { can } from "@/lib/stage2/rules";
import { STANCES, type Stance } from "@/lib/stage2/types";
import { useRecordNav } from "@/lib/useRecordNav";
import { useDemo } from "@/state/DemoProvider";
import { DemoTag, IdTag, SeverityBadge } from "../ui";
import { Btn, CardSection, ErrorList, IllustrativeBadge, Notice, SelectField, Skeleton, TextField, fmtDate, useAction } from "./common";
import { RefChips } from "./EvidenceTab";

export function freshness(sourceDate: string): { label: string; days: number; cls: string } {
  const days = Math.round((Date.parse(INSTITUTION.asOf.slice(0, 10)) - Date.parse(sourceDate)) / 86400000);
  const age = `${days} day${days === 1 ? "" : "s"} old`;
  if (days <= 30) return { label: `Recent · ${age}`, days, cls: "bg-sg-100 text-sg-700 border-sg-500/40" };
  if (days <= 90) return { label: `Ageing · ${age}`, days, cls: "bg-gd-100 text-gd-700 border-gd-500/40" };
  return { label: `Stale · ${age}`, days, cls: "bg-am-100 text-am-800 border-am-600/30" };
}

export function EvidenceLibrary() {
  return <Suspense fallback={<Skeleton />}><Library /></Suspense>;
}
function Library() {
  const { world, hydrated } = useDemo();
  const sp = useSearchParams();
  const [sector, setSector] = useState(sp.get("sector") ?? "");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return EVIDENCE_LIST.filter((e) => !sector || e.sectorId === sector).filter((e) => {
      const body = (e.versions ?? []).flatMap((v) => v.blocks.map((b) => (b.type === "p" ? b.text : `${b.caption} ${b.rows.flat().join(" ")}`))).join(" ");
      const t = `${e.id} ${e.title} ${e.source} ${e.kind} ${e.summary} ${body}`.toLowerCase();
      return terms.every((x) => t.includes(x));
    });
  }, [sector, q]);
  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Investigation</p>
        <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Evidence library</h1>
        <p className="mt-2 max-w-3xl text-[15px] text-ink-2">Readable fictional source content you can inspect, cite by paragraph or row, and link to cases. Every item is illustrative; none is a real document. <DemoTag className="ml-1 align-middle" /></p>
      </header>
      <section className="card p-4" aria-label="Filters">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2"><TextField label="Search evidence content" value={q} onChange={setQ} placeholder="Words in titles, sources or the evidence text" testId="evidence-search" /></div>
          <SelectField label="Sector" value={sector} onChange={setSector} placeholder="All sectors" options={SECTORS.map((s) => ({ value: s.id, label: s.short }))} testId="evidence-sector" />
        </div>
        <p className="mt-2 text-sm text-ink-2" aria-live="polite" data-testid="evidence-count">{list.length} of {EVIDENCE_LIST.length} evidence items{(q || sector) && <button className="ml-3 font-medium text-em-700 underline" onClick={() => { setQ(""); setSector(""); }}>Clear filters</button>}</p>
      </section>
      {list.length === 0 ? <div className="card p-8 text-center" data-testid="evidence-empty"><p className="font-serif text-xl">No evidence matches</p><p className="mt-1 text-sm text-ink-2">Try other words, or clear the filters.</p></div> : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map((e) => {
          const v = currentVersion(e)!;
          const fr = freshness(v.sourceDate);
          const n = hydrated ? casesForEvidence(world, e.id).length : null;
          return (
            <li key={e.id} className="card flex flex-col p-4" data-testid={`evidence-card-${e.id}`}>
              <div className="flex flex-wrap items-center gap-2"><IdTag id={e.id} /><IllustrativeBadge /></div>
              <Link href={`/evidence/${e.id}`} className="mt-2 font-serif text-lg text-em-900 hover:underline">{e.title}</Link>
              <p className="mt-1 text-xs text-muted">{SECTOR_BY_ID[e.sectorId].sector.short} · {e.kind} · v{v.version} of {e.versions!.length} · source date {v.sourceDate}</p>
              <p className="mt-2 flex-1 text-sm text-ink-2">{e.summary}</p>
              <p className="mt-3 flex flex-wrap gap-2 text-xs"><span className={`rounded-full border px-2 py-0.5 font-semibold ${fr.cls}`}>{fr.label}</span><span className="text-muted">{n === null ? "…" : `Linked in ${n} case${n === 1 ? "" : "s"}`}</span></p>
            </li>);
        })}</ul>
      )}
    </div>
  );
}

export function EvidenceViewer({ evidenceId }: { evidenceId: string }) {
  return <Suspense fallback={<Skeleton />}><Viewer evidenceId={evidenceId} /></Suspense>;
}
function Viewer({ evidenceId }: { evidenceId: string }) {
  const e = EVIDENCE_BY_ID[evidenceId];
  const { world, hydrated, role } = useDemo();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { openRecord } = useRecordNav();
  // Client-side navigation does not apply :target, so highlight and scroll to the referenced paragraph explicitly.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    document.querySelectorAll("[data-hl]").forEach((n) => n.removeAttribute("data-hl"));
    if (!id.startsWith("ref-")) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute("data-hl", "true");
    el.scrollIntoView({ block: "center" });
  }, [pathname, sp, e?.id]);
  if (!e) return <div className="card p-8 text-center" data-testid="evidence-not-found"><h1 className="font-serif text-2xl">Evidence not found</h1><p className="mt-3"><Link href="/evidence" className="font-semibold text-em-700 underline">Back to the evidence library</Link></p></div>;
  const latest = latestVersion(e.id);
  const wanted = Number(sp.get("v")) || latest;
  const v = versionOf(e, wanted) ?? versionOf(e, latest)!;
  const fr = freshness(v.sourceDate);
  const sector = SECTOR_BY_ID[e.sectorId];
  const linkedCases = hydrated ? casesForEvidence(world, e.id) : [];
  const signals = SIGNAL_LIST.filter((s) => s.evidenceIds.includes(e.id));
  const refs = evidenceRefs(v);
  const citations = hydrated ? world.cases.flatMap((c) => c.reviews.flatMap((r) => r.rounds.flatMap((rd) => (rd.submission?.findings ?? []).filter((f) => f.citations.some((x) => x.evidenceId === e.id)).map((f) => ({ c, f }))))) : [];
  let para = 0, tab = 0;

  return (
    <div className="space-y-5" data-testid={`evidence-viewer-${e.id}`}>
      <header className="card p-5 sm:p-6">
        <nav aria-label="Breadcrumb" className="mb-2 text-xs text-muted"><Link href="/evidence" className="underline">Evidence library</Link> / {sector.sector.short}</nav>
        <div className="flex flex-wrap items-center gap-2"><IdTag id={e.id} /><IllustrativeBadge /><DemoTag /></div>
        <h1 className="mt-2 font-serif text-2xl sm:text-3xl" data-testid="evidence-title">{e.title}</h1>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Fictional source</dt><dd>{e.source}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Source date</dt><dd data-testid="evidence-date">{fmtDate(v.sourceDate)}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Version</dt><dd data-testid="evidence-version">v{v.version} of {e.versions!.length}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Freshness</dt><dd><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${fr.cls}`}>{fr.label}</span></dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Type</dt><dd>{e.kind}</dd></div>
          <div className="sm:col-span-2 lg:col-span-3"><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Associated entities</dt><dd className="flex flex-wrap gap-1.5">{(e.entityIds ?? []).map((id) => <button key={id} onClick={() => openRecord(id)} className="rounded bg-ivory-2 px-1.5 py-0.5 text-xs font-medium text-em-700 hover:underline">{id}</button>)}</dd></div>
        </dl>
        {e.versions!.length > 1 && (
          <div className="mt-4" role="group" aria-label="Versions">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Versions</p>
            <div className="flex flex-wrap gap-2">{e.versions!.map((x) => <button key={x.version} aria-pressed={x.version === v.version} onClick={() => router.replace(`${pathname}?v=${x.version}`, { scroll: false })} data-testid={`evidence-v${x.version}`} className={`rounded-full border px-3 py-1 text-xs font-semibold ${x.version === v.version ? "border-em-800 bg-em-800 text-white" : "border-line bg-white text-ink-2 hover:border-em-600"}`}>v{x.version} · {x.sourceDate}</button>)}</div>
            <p className="mt-2 text-xs text-ink-2">v{v.version}: {v.changeNote}</p>
            {v.version < latest && <p className="mt-1 rounded-lg bg-am-100 p-2 text-xs text-am-800" data-testid="older-version-banner">You are viewing an older version. v{latest} is the current version.</p>}
          </div>
        )}
      </header>

      <CardSection title="Limitations of this source">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2" data-testid="limitations">{v.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        <p className="mt-3 text-xs text-muted">Illustrative evidence: fictional content created for this demonstration. It describes no real organisation, and there is no file behind it beyond the text shown here.</p>
      </CardSection>

      <CardSection title={`Content (${refs.length} citable references)`}>
        <div className="space-y-4" data-testid="evidence-content">{v.blocks.map((b, i) => b.type === "p" ? (() => { para++; const ref = `P${para}`; return (
          <p key={i} id={`ref-${ref}`} className="scroll-mt-28 rounded-lg p-2 text-[15px] leading-relaxed text-ink-2" data-testid={`ref-${ref}`}><a href={`#ref-${ref}`} className="mr-2 rounded bg-ivory-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-em-800 no-underline" aria-label={`Reference ${ref}`}>{ref}</a>{b.text}</p>); })() : (() => { tab++; const t = tab; return (
          <div key={i}><p className="mb-1 text-sm font-semibold text-ink">Table {t}: {b.caption}</p>
            <div className="overflow-x-auto rounded-lg border border-line" tabIndex={0} role="region" aria-label={`Table ${t}: ${b.caption} (scrollable)`}>
              <table className="w-full min-w-[480px] text-left text-sm"><thead className="bg-ivory-2 text-xs text-muted"><tr><th className="p-2 font-semibold">Ref</th>{b.columns.map((c) => <th key={c} className="p-2 font-semibold">{c}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, ri) => { const ref = `T${t}R${ri + 1}`; return <tr key={ri} id={`ref-${ref}`} className="scroll-mt-28 border-t border-line-2" data-testid={`ref-${ref}`}><td className="p-2"><a href={`#ref-${ref}`} className="rounded bg-ivory-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-em-800 no-underline" aria-label={`Reference ${ref}`}>{ref}</a></td>{r.map((cell, ci) => { const dec = Math.max(0, ...b.rows.map((x) => (typeof x[ci] === "number" && !Number.isInteger(x[ci]) ? 1 : 0))); return <td key={ci} className={`p-2 ${typeof cell === "number" ? "tabular-nums" : ""}`}>{typeof cell === "number" ? cell.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: 2 }) : cell}</td>; })}</tr>; })}</tbody></table>
            </div>
          </div>); })())}</div>
      </CardSection>

      <CardSection title="Related cases, signals and findings">
        <div className="space-y-4 text-sm">
          <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Cases using this evidence ({linkedCases.length})</h3>
            {!hydrated ? <Skeleton label="Loading…" /> : linkedCases.length === 0 ? <p className="text-muted">Not linked to any case.</p> : <ul className="space-y-1.5">{linkedCases.map((c) => <li key={c.id} className="rounded-lg border border-line p-2.5"><Link href={`/cases/${c.id}?tab=evidence`} className="font-medium text-em-700 hover:underline">{c.title}</Link> <IdTag id={c.id} /> <span className="text-xs text-muted">{c.status}</span>
              <div className="mt-1 text-xs text-ink-2">{activeLinks(c).filter((l) => l.evidenceId === e.id).map((l) => <span key={l.id} className="mr-3">{l.stance} · v{l.version} <RefChips evidenceId={e.id} version={l.version} refs={l.refs} /></span>)}</div></li>)}</ul>}
          </div>
          <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Signals referencing this evidence ({signals.length})</h3>
            {signals.length === 0 ? <p className="text-muted">None.</p> : <ul className="space-y-1.5">{signals.map((s) => <li key={s.id} className="flex flex-wrap items-center gap-2"><SeverityBadge severity={s.severity} /><button onClick={() => openRecord(s.id)} className="font-medium text-em-700 hover:underline">{s.title}</button><IdTag id={s.id} /></li>)}</ul>}</div>
          <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Expert findings citing this evidence ({citations.length})</h3>
            {citations.length === 0 ? <p className="text-muted">None yet.</p> : <ul className="space-y-1.5">{citations.map(({ c, f }) => <li key={f.id}><Link href={`/cases/${c.id}?tab=review&focus=${f.id}`} className="text-em-700 underline">{f.id}</Link> ({f.type}): {f.text}</li>)}</ul>}</div>
        </div>
      </CardSection>
      {hydrated && role === "Analyst" && <QuickLink e={e} version={v} />}
    </div>
  );
}

function QuickLink({ e, version }: { e: Evidence; version: EvidenceVersion }) {
  const { world, role } = useDemo();
  const { run, errors, notice } = useAction();
  const cases = world.cases.filter((c) => c.sectorId === e.sectorId && c.status !== "Closed");
  const [caseId, setCaseId] = useState("");
  const [stance, setStance] = useState<Stance>("context");
  const [hypothesisId, setHypothesisId] = useState("");
  const [note, setNote] = useState("");
  const [ref, setRef] = useState("");
  const c = cases.find((x) => x.id === caseId);
  if (!can(role, "evidence.link")) return null;
  const refList = evidenceRefs(version);
  return (
    <CardSection title="Link this version to a case">
      <form className="grid gap-3 sm:grid-cols-2" noValidate data-testid="quick-link-form" onSubmit={(ev) => { ev.preventDefault(); const r = run((w, ctx) => linkEvidence(w, ctx, caseId, { evidenceId: e.id, version: version.version, stance, hypothesisId: hypothesisId || null, refs: ref ? [ref] : [], note }), `Linked ${e.id} v${version.version} to ${caseId}.`); if (r.ok) { setNote(""); setRef(""); } }}>
        <SelectField label="Case (same sector, not closed)" value={caseId} onChange={(v) => { setCaseId(v); setHypothesisId(""); }} placeholder="Choose a case" options={cases.map((x) => ({ value: x.id, label: `${x.id} — ${x.title}` }))} testId="quick-case" />
        <SelectField label="Relationship" value={stance} onChange={(v) => setStance(v as Stance)} options={STANCES.map((s) => ({ value: s, label: s }))} testId="quick-stance" />
        <SelectField label="Hypothesis" value={hypothesisId} onChange={setHypothesisId} placeholder="None — general context" disabled={!c} options={(c?.hypotheses ?? []).map((h) => ({ value: h.id, label: `${hypShort(h.id)} ${h.statement.slice(0, 60)}` }))} testId="quick-hypothesis" />
        <SelectField label="Reference (optional)" value={ref} onChange={setRef} placeholder="Whole document" options={refList.map((r) => ({ value: r.ref, label: `${r.ref} — ${r.text.slice(0, 60)}` }))} testId="quick-ref" />
        <div className="sm:col-span-2"><TextField label="Note" value={note} onChange={setNote} testId="quick-note" /></div>
        <div className="space-y-2 sm:col-span-2"><ErrorList errors={errors} />{notice && <Notice>{notice} <Link href={`/cases/${caseId}?tab=evidence`} className="font-semibold underline">Open the case</Link></Notice>}<Btn type="submit" disabled={!caseId} testId="quick-link-submit">Link to case</Btn></div>
      </form>
    </CardSection>
  );
}
