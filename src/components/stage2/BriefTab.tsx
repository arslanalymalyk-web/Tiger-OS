"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { BriefContent, BriefEvidenceRef, BriefVersion, CaseAggregate } from "@/lib/stage2/types";
import { compileBriefMut, editBrief } from "@/lib/stage2/mutations";
import { can } from "@/lib/stage2/rules";
import { hypShort, isBriefStale, latestBrief, staleReasons } from "@/lib/stage2/brief";
import { EVIDENCE_BY_ID } from "@/lib/stage2/catalog";
import { useDemo } from "@/state/DemoProvider";
import { Btn, CardSection, ErrorList, Locked, Notice, StaleBadge, TextArea, TextField, fmtDateTime, useAction } from "./common";
import { RefChips } from "./EvidenceTab";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export function BriefTab({ c }: { c: CaseAggregate }) {
  const { role } = useDemo();
  const sp = useSearchParams();
  const { run, errors, notice, clear } = useAction();
  const latest = latestBrief(c);
  const wanted = Number(sp.get("version"));
  // `picked` is a version the user chose to look at; null follows the latest saved version.
  const [picked, setPicked] = useState<number | null>(wanted && c.briefs.some((b) => b.version === wanted) ? wanted : null);
  const [editing, setEditing] = useState(false);
  const shown = (picked !== null ? c.briefs.find((b) => b.version === picked) : undefined) ?? latest;
  const stale = isBriefStale(c);
  const canCompile = can(role, "brief.compile") && c.status !== "Closed";
  const isLatest = !!shown && !!latest && shown.version === latest.version;

  return (
    <>
      <p className="rounded-lg border border-dashed border-gd-500/60 bg-gd-100/50 p-3 text-sm text-ink-2" role="note">A brief is compiled from the current case records with a <b>deterministic template</b>. It is not AI-generated and contains no calculated financial impact. It does not record an approval; the Stage 1 decision records remain proposals.</p>
      <CardSection title="Decision brief" actions={
        <div className="flex flex-wrap items-center gap-2">
          {latest && stale && <StaleBadge />}
          {canCompile && <Btn onClick={() => { clear(); const r = run((w, ctx) => compileBriefMut(w, ctx, c.id), (v) => `Compiled brief v${v.version} from current records.`); if (r.ok) setPicked(null); }} testId="compile-brief">Compile brief</Btn>}
          {canCompile && latest && isLatest && !editing && <Btn kind="secondary" onClick={() => { clear(); setEditing(true); }} testId="edit-brief">Edit brief</Btn>}
        </div>}>
        {!canCompile && <Locked action="brief.compile" what="compile or edit briefs"><span /></Locked>}
        <div className="space-y-2"><ErrorList errors={errors} />{notice && <Notice>{notice}</Notice>}</div>
        {!latest ? <p className="mt-2 text-sm text-muted" data-testid="no-brief">No brief has been compiled for this case yet.{canCompile ? " Use “Compile brief”." : ""}</p> : (
          <>
            {stale && latest && (
              <div className="mt-3 rounded-lg border border-am-600/40 bg-am-100 p-3 text-sm text-am-800" role="status" data-testid="stale-banner">
                <p className="font-semibold">Needs refresh: records have changed since v{latest.version} was saved.</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{staleReasons(c, latest).map((r) => <li key={r}>{r}</li>)}</ul>
                <p className="mt-1 text-xs">The saved version is retained. Compile a new version to include the changes.</p>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Brief versions" data-testid="brief-versions">
              {[...c.briefs].reverse().map((b) => (
                <button key={b.id} onClick={() => { setPicked(b.version); setEditing(false); }} aria-pressed={shown?.version === b.version} data-testid={`brief-version-${b.version}`}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${shown?.version === b.version ? "border-em-800 bg-em-800 text-white" : "border-line bg-white text-ink-2 hover:border-em-600"}`}>v{b.version} · {b.source}</button>
              ))}
            </div>
            {shown && !editing && <BriefView b={shown} latest={isLatest} stale={isLatest && stale} />}
            {shown && editing && isLatest && <BriefEditor c={c} b={shown} onDone={() => { setEditing(false); setPicked(null); }} />}
          </>
        )}
      </CardSection>
    </>
  );
}

const EvList = ({ items }: { items: BriefEvidenceRef[] }) => items.length === 0 ? <p className="text-sm text-muted">None.</p> : (
  <ul className="space-y-1.5 text-sm">{items.map((x) => (
    <li key={x.linkId} className="rounded border border-line p-2"><Link href={`/evidence/${x.evidenceId}?v=${x.version}`} className="font-medium text-em-700 hover:underline">{EVIDENCE_BY_ID[x.evidenceId]?.title ?? x.evidenceId}</Link> <code className="text-[11px] text-muted">{x.evidenceId} v{x.version}</code>{x.hypothesisId ? <span className="text-xs text-muted"> · {hypShort(x.hypothesisId)}</span> : null}
      {x.note && <p className="text-xs text-ink-2">{x.note}</p>}<p className="text-xs"><RefChips evidenceId={x.evidenceId} version={x.version} refs={x.refs} /></p></li>))}</ul>
);
const Sec = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="mt-4"><h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{title}</h3>{children}</section>;
const Bullets = ({ items }: { items: string[] }) => items.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="text-sm text-muted">None.</p>;

function BriefView({ b, latest, stale }: { b: BriefVersion; latest: boolean; stale: boolean }) {
  const k = b.content;
  return (
    <article className="mt-4 rounded-xl border border-line bg-white p-4 sm:p-5" aria-label={`Decision brief version ${b.version}`} data-testid="brief-view">
      <p className="text-xs text-muted">Version {b.version} ({b.source}) · saved {fmtDateTime(b.createdAt)} by {b.createdBy}{!latest ? " · earlier version (read-only)" : stale ? " · latest version, needs refresh" : " · latest version"}</p>
      <p className="mt-1 text-xs text-muted">{b.note} <code>{b.id}</code></p>
      <Sec title="Decision question"><p className="text-[15px] font-medium text-ink" data-testid="brief-question">{k.decisionQuestion}</p></Sec>
      <Sec title="Mandate alignment"><p className="whitespace-pre-line text-sm text-ink-2">{k.mandateAlignment}</p></Sec>
      <Sec title="Current findings"><Bullets items={k.currentFindings} /></Sec>
      <Sec title="Affected entities"><Bullets items={k.affectedEntities} /></Sec>
      <Sec title="Supporting evidence"><EvList items={k.supportingEvidence} /></Sec>
      <Sec title="Contradictory evidence"><EvList items={k.contradictoryEvidence} /></Sec>
      <Sec title="Context evidence"><EvList items={k.contextEvidence} /></Sec>
      <Sec title="Assumptions"><Bullets items={k.assumptions} /></Sec>
      <Sec title="Unresolved uncertainties"><Bullets items={k.uncertainties} /></Sec>
      <Sec title="Response options (including monitoring and no action)">
        <ul className="space-y-1.5 text-sm">{k.options.map((o) => <li key={o.label} className="rounded border border-line p-2"><b>{o.label}.</b> <span className="text-ink-2">{o.description}</span></li>)}</ul>
      </Sec>
      <Sec title="Expert findings and disagreements">
        {k.expertFindings.length === 0 ? <p className="text-sm text-muted">No expert findings yet.</p> : <ul className="space-y-1.5 text-sm">{k.expertFindings.map((f) => <li key={f.findingId} className="rounded border border-line p-2"><b>{f.type}</b> (round {f.round}, {f.by}, “{f.outcome}”): {f.text} <span className="text-xs text-muted">{f.citations.map((x) => `${x.evidenceId} v${x.version} §${x.ref}`).join(", ")}</span></li>)}</ul>}
      </Sec>
      <Sec title="Suggested next step"><p className="text-sm text-ink-2">{k.nextStep}</p></Sec>
      <Sec title="Accountable owner"><p className="text-sm text-ink-2">{k.accountableOwner}</p></Sec>
      <Sec title="Financial impact"><p className="text-sm text-ink-2">{k.financialImpactNote}</p></Sec>
      <Sec title="Built from (saved with this version)">
        <p className="text-xs text-ink-2" data-testid="brief-basis">Evidence versions: {b.basis.links.map((l) => `${l.evidenceId} v${l.version} (${l.stance})`).join("; ") || "none"}. Expert findings: {b.basis.findings.join(", ") || "none"}. Hypothesis revisions: {b.basis.hypotheses.map((h) => `${hypShort(h.id)} r${h.rev}`).join(", ") || "none"}.</p>
      </Sec>
    </article>
  );
}

function BriefEditor({ c, b, onDone }: { c: CaseAggregate; b: BriefVersion; onDone: () => void }) {
  const { run, errors } = useAction();
  const k = b.content;
  const [question, setQuestion] = useState(k.decisionQuestion);
  const [mandate, setMandate] = useState(k.mandateAlignment);
  const [findings, setFindings] = useState(k.currentFindings.join("\n"));
  const [assumptions, setAssumptions] = useState(k.assumptions.join("\n"));
  const [uncertainties, setUncertainties] = useState(k.uncertainties.join("\n"));
  const [options, setOptions] = useState(k.options);
  const [nextStep, setNextStep] = useState(k.nextStep);
  const [owner, setOwner] = useState(k.accountableOwner);
  const [note, setNote] = useState("");
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const content: BriefContent = { ...k, decisionQuestion: question, mandateAlignment: mandate, currentFindings: lines(findings), assumptions: lines(assumptions), uncertainties: lines(uncertainties), options, nextStep, accountableOwner: owner };
    const r = run((w, ctx) => editBrief(w, ctx, c.id, content, note), (v) => `Saved edited brief v${v.version}. Earlier versions are retained.`);
    if (r.ok) onDone();
  };
  return (
    <form onSubmit={save} noValidate className="mt-4 space-y-3 rounded-xl border border-line bg-white p-4" data-testid="brief-editor">
      <p className="text-sm font-semibold">Edit brief (saves a new version; v{b.version} is kept)</p>
      <p className="text-xs text-muted">Evidence, expert findings and affected entities come from the case records and are not edited here. Edits keep the same “built from” basis, so the brief still shows Needs refresh if records changed.</p>
      <TextArea label="Decision question" value={question} onChange={setQuestion} rows={2} required testId="brief-edit-question" />
      <TextArea label="Mandate alignment" value={mandate} onChange={setMandate} rows={3} testId="brief-edit-mandate" />
      <TextArea label="Current findings (one per line)" value={findings} onChange={setFindings} rows={4} />
      <TextArea label="Assumptions (one per line)" value={assumptions} onChange={setAssumptions} rows={3} />
      <TextArea label="Unresolved uncertainties (one per line)" value={uncertainties} onChange={setUncertainties} rows={3} />
      <fieldset className="space-y-2 rounded-lg border border-line p-3"><legend className="px-1 text-sm font-medium">Response options (monitoring and no action are required)</legend>
        {options.map((o, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]"><TextField label={`Option ${i + 1} label`} value={o.label} onChange={(v) => setOptions(options.map((x, j) => (j === i ? { ...x, label: v } : x)))} testId={`brief-opt-label-${i}`} /><TextArea label="Description" value={o.description} onChange={(v) => setOptions(options.map((x, j) => (j === i ? { ...x, description: v } : x)))} rows={2} /><button type="button" className="self-end pb-2 text-xs text-rd-800 underline" onClick={() => setOptions(options.filter((_, j) => j !== i))}>Remove</button></div>
        ))}
        <Btn kind="secondary" onClick={() => setOptions([...options, { label: "", description: "" }])}>Add option</Btn>
      </fieldset>
      <TextArea label="Suggested next step" value={nextStep} onChange={setNextStep} rows={2} required testId="brief-edit-next" />
      <TextField label="Accountable owner" value={owner} onChange={setOwner} required testId="brief-edit-owner" />
      <TextField label="Version note" value={note} onChange={setNote} testId="brief-edit-note" />
      <ErrorList errors={errors} />
      <div className="flex gap-2"><Btn type="submit" testId="save-brief">Save as new version</Btn><Btn kind="secondary" onClick={onDone}>Cancel</Btn></div>
    </form>
  );
}
