"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SECTOR_BY_ID } from "@/data";
import { evidenceRefs, versionOf } from "@/data/stage2/blocks";
import { HYP_KINDS, HYP_STATUSES, STANCES, type CaseAggregate, type EvidenceLink, type HypKind, type HypStatus, type Stance } from "@/lib/stage2/types";
import { adoptEvidenceVersion, addHypothesis, changeStance, linkEvidence, unlinkEvidence, updateHypothesis } from "@/lib/stage2/mutations";
import { can } from "@/lib/stage2/rules";
import { hypShort, activeLinks } from "@/lib/stage2/brief";
import { EVIDENCE_BY_ID, latestVersion } from "@/lib/stage2/catalog";
import { useDemo } from "@/state/DemoProvider";
import { Btn, CardSection, ErrorList, IllustrativeBadge, Locked, Notice, SelectField, TextArea, useAction } from "./common";

const STANCE_LABEL: Record<Stance, string> = { supports: "Supports", contradicts: "Contradicts", context: "Context" };
const STANCE_CLS: Record<Stance, string> = { supports: "bg-sg-100 text-sg-700 border-sg-500/40", contradicts: "bg-rd-100 text-rd-800 border-rd-600/30", context: "bg-ivory-2 text-ink-2 border-line" };

export const refHref = (evidenceId: string, version: number, ref: string) => `/evidence/${evidenceId}?v=${version}#ref-${ref}`;
export function RefChips({ evidenceId, version, refs }: { evidenceId: string; version: number; refs: string[] }) {
  if (!refs.length) return <span className="text-xs text-muted">No specific reference</span>;
  return <span className="inline-flex flex-wrap gap-1">{refs.map((r) => <Link key={r} href={refHref(evidenceId, version, r)} className="rounded bg-ivory-2 px-1.5 py-0.5 font-mono text-[11px] text-em-800 hover:underline" data-testid={`ref-${evidenceId}-${r}`}>§{r}</Link>)}</span>;
}

export function EvidenceTab({ c }: { c: CaseAggregate }) {
  const { role } = useDemo();
  const editable = can(role, "case.edit") && c.status !== "Closed";
  const canLink = can(role, "evidence.link") && c.status !== "Closed";
  const links = activeLinks(c);
  const gone = c.links.filter((l) => l.unlinkedAt);
  return (
    <>
      <HypothesesPanel c={c} editable={editable} />
      <CardSection title={`Linked evidence (${links.length})`} id="linked-evidence">
        <Locked action="evidence.link" what="link or unlink evidence"><span /></Locked>
        {links.length === 0 ? <p className="text-sm text-muted">No evidence is linked yet.</p> : (
          <div className="space-y-4">
            {STANCES.map((st) => { const group = links.filter((l) => l.stance === st); if (!group.length) return null; return (
              <div key={st}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{st === "supports" ? "Supporting evidence" : st === "contradicts" ? "Contradictory evidence" : "Context"} ({group.length})</h3>
                <ul className="space-y-2">{group.map((l) => <LinkRow key={l.id} c={c} l={l} canEdit={canLink} />)}</ul>
              </div>
            ); })}
          </div>
        )}
        {gone.length > 0 && (
          <details className="mt-4 rounded-lg border border-line p-3 text-sm">
            <summary className="cursor-pointer font-medium">Unlinked evidence history ({gone.length})</summary>
            <ul className="mt-2 space-y-1 text-xs text-ink-2">{gone.map((l) => <li key={l.id}>{l.evidenceId} v{l.version} ({STANCE_LABEL[l.stance]}) — linked {l.linkedAt.slice(0, 10)}, unlinked {l.unlinkedAt!.slice(0, 10)} by {l.unlinkedBy}. Record retained.</li>)}</ul>
          </details>
        )}
      </CardSection>
      {canLink && <LinkForm c={c} />}
    </>
  );
}

function LinkRow({ c, l, canEdit }: { c: CaseAggregate; l: EvidenceLink; canEdit: boolean }) {
  const { run, errors, notice } = useAction();
  const ev = EVIDENCE_BY_ID[l.evidenceId];
  const latest = latestVersion(l.evidenceId);
  const hyp = c.hypotheses.find((h) => h.id === l.hypothesisId);
  return (
    <li className="rounded-lg border border-line p-3" data-testid={`link-${l.id}`} id={`focus-${l.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STANCE_CLS[l.stance]}`}>{STANCE_LABEL[l.stance]}</span>
        <Link href={`/evidence/${l.evidenceId}?v=${l.version}`} className="text-sm font-medium text-em-700 hover:underline">{ev?.title ?? l.evidenceId}</Link>
        <code className="rounded bg-ivory-2 px-1.5 py-0.5 font-mono text-[11px]">{l.evidenceId} v{l.version}</code>
        <IllustrativeBadge />
      </div>
      <p className="mt-1.5 text-xs text-ink-2">{hyp ? <>For hypothesis <b>{hypShort(hyp.id)}</b>: {hyp.statement}</> : "General context (no hypothesis)"}</p>
      {l.note && <p className="mt-1 text-sm">{l.note}</p>}
      <p className="mt-1 text-xs text-muted">References: <RefChips evidenceId={l.evidenceId} version={l.version} refs={l.refs} /></p>
      {latest > l.version && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-am-100 p-2 text-xs text-am-800" data-testid={`newer-${l.id}`}>
          Newer version v{latest} is available{versionOf(ev, latest)?.changeNote ? `: ${versionOf(ev, latest)!.changeNote}` : "."}
          {canEdit && <Btn kind="secondary" onClick={() => run((w, ctx) => adoptEvidenceVersion(w, ctx, c.id, l.id), `Now using v${latest}.`)} testId={`adopt-${l.id}`}>Use v{latest}</Btn>}
        </div>
      )}
      {canEdit && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="w-44"><SelectField label="Stance" value={l.stance} onChange={(v) => run((w, ctx) => changeStance(w, ctx, c.id, l.id, v as Stance), `Stance changed to ${v}.`)} options={STANCES.map((s) => ({ value: s, label: STANCE_LABEL[s] }))} testId={`stance-${l.id}`} /></div>
          <Btn kind="secondary" onClick={() => run((w, ctx) => unlinkEvidence(w, ctx, c.id, l.id), `Unlinked ${l.evidenceId}.`)} testId={`unlink-${l.id}`}>Unlink</Btn>
        </div>
      )}
      {l.history.length > 1 && <p className="mt-1 text-[11px] text-muted">Stance history: {l.history.map((h) => `${h.from ?? "linked"} → ${h.to} (${h.at.slice(0, 10)})`).join("; ")}</p>}
      <div className="mt-2 space-y-2"><ErrorList errors={errors} />{notice && <Notice>{notice}</Notice>}</div>
    </li>
  );
}

function LinkForm({ c }: { c: CaseAggregate }) {
  const { run, errors, notice, clear } = useAction();
  const sectorEvidence = SECTOR_BY_ID[c.sectorId].evidence.filter((e) => e.versions?.length);
  const [evidenceId, setEvidenceId] = useState("");
  const ev = evidenceId ? EVIDENCE_BY_ID[evidenceId] : undefined;
  const [version, setVersion] = useState(0);
  const [stance, setStance] = useState<Stance>("supports");
  const [hypothesisId, setHypothesisId] = useState("");
  const [refs, setRefs] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const v = ev ? versionOf(ev, version || latestVersion(ev.id)) : undefined;
  const refList = useMemo(() => (v ? evidenceRefs(v) : []), [v]);
  const linkedHere = (id: string) => activeLinks(c).some((l) => l.evidenceId === id);
  const pick = (id: string) => { clear(); setEvidenceId(id); setVersion(latestVersion(id)); setRefs([]); };

  return (
    <CardSection title="Link evidence to this case">
      <form className="space-y-3" noValidate data-testid="link-evidence-form" onSubmit={(e) => {
        e.preventDefault();
        const r = run((w, ctx) => linkEvidence(w, ctx, c.id, { evidenceId, version: version || undefined, stance, hypothesisId: hypothesisId || null, refs, note }), `Linked ${evidenceId} as ${stance}.`);
        if (r.ok) { setEvidenceId(""); setRefs([]); setNote(""); setHypothesisId(""); }
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Evidence" value={evidenceId} onChange={pick} placeholder="Choose readable evidence" testId="link-evidence-select"
            options={sectorEvidence.map((e) => ({ value: e.id, label: `${e.id} — ${e.title}${linkedHere(e.id) ? " (already linked)" : ""}` }))} hint="Only evidence with readable content can be linked. A source can be linked once per hypothesis." />
          <SelectField label="Version" value={String(version || "")} onChange={(x) => { setVersion(Number(x)); setRefs([]); }} disabled={!ev} options={(ev?.versions ?? []).map((x) => ({ value: String(x.version), label: `v${x.version} — ${x.sourceDate}` }))} testId="link-version-select" />
          <SelectField label="Relationship to the hypothesis" value={stance} onChange={(x) => setStance(x as Stance)} options={STANCES.map((s) => ({ value: s, label: STANCE_LABEL[s] }))} testId="link-stance-select" />
          <SelectField label="Hypothesis" value={hypothesisId} onChange={setHypothesisId} placeholder="None — general context" options={c.hypotheses.map((h) => ({ value: h.id, label: `${hypShort(h.id)} (${h.kind}) ${h.statement.slice(0, 60)}${h.statement.length > 60 ? "…" : ""}` }))} testId="link-hypothesis-select" hint="Required when the evidence supports or contradicts." />
        </div>
        {v && (
          <fieldset className="rounded-lg border border-line p-3">
            <legend className="px-1 text-sm font-medium">References to cite (optional)</legend>
            <div className="max-h-56 space-y-1.5 overflow-y-auto" tabIndex={0} role="group" aria-label="Evidence references">{refList.map((r) => (
              <label key={r.ref} className="flex items-start gap-2 text-xs"><input type="checkbox" checked={refs.includes(r.ref)} onChange={(e) => setRefs(e.target.checked ? [...refs, r.ref] : refs.filter((x) => x !== r.ref))} className="mt-0.5" data-testid={`link-ref-${r.ref}`} /><span><b className="font-mono">{r.ref}</b> {r.text.length > 140 ? `${r.text.slice(0, 140)}…` : r.text}</span></label>
            ))}</div>
          </fieldset>
        )}
        <TextArea label="Note" value={note} onChange={setNote} rows={2} testId="link-note" />
        <ErrorList errors={errors} />
        {notice && <Notice>{notice}</Notice>}
        <Btn type="submit" testId="link-evidence-submit" disabled={!evidenceId}>Link evidence</Btn>
      </form>
    </CardSection>
  );
}

function HypothesesPanel({ c, editable }: { c: CaseAggregate; editable: boolean }) {
  const { run, errors, notice, clear } = useAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [kind, setKind] = useState<HypKind>("primary");
  const [statement, setStatement] = useState("");
  const [status, setStatus] = useState<HypStatus>("Open");
  const [rationale, setRationale] = useState("");
  const links = activeLinks(c);
  const startEdit = (id: string) => { const h = c.hypotheses.find((x) => x.id === id)!; clear(); setEditing(id); setKind(h.kind); setStatement(h.statement); setStatus(h.status); setRationale(h.rationale); };
  const reset = () => { setEditing(null); setKind("primary"); setStatement(""); setStatus("Open"); setRationale(""); };
  return (
    <CardSection title={`Hypotheses and alternative explanations (${c.hypotheses.length})`} id="hypotheses">
      {c.hypotheses.length === 0 ? <p className="text-sm text-muted">No hypothesis recorded yet.</p> : (
        <ul className="space-y-2">{c.hypotheses.map((h) => {
          const mine = links.filter((l) => l.hypothesisId === h.id);
          return (
            <li key={h.id} className="rounded-lg border border-line p-3" data-testid={`hyp-${h.id}`} id={`focus-${h.id}`}>
              <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${h.kind === "primary" ? "border-em-700/30 bg-sg-100 text-em-800" : "border-gd-500/40 bg-gd-100 text-gd-700"}`}>{h.kind === "primary" ? "Primary hypothesis" : "Alternative explanation"}</span><span className="rounded-full border border-line bg-ivory-2 px-2 py-0.5 text-xs">{h.status}</span><code className="font-mono text-[11px] text-muted">{h.id} · rev {h.rev}</code></div>
              <p className="mt-1.5 text-sm font-medium">{h.statement}</p>
              {h.rationale && <p className="mt-1 text-xs text-ink-2">{h.rationale}</p>}
              <p className="mt-1 text-xs text-muted">{mine.filter((l) => l.stance === "supports").length} supporting · {mine.filter((l) => l.stance === "contradicts").length} contradicting · {mine.filter((l) => l.stance === "context").length} context</p>
              {editable && <button className="mt-1.5 text-xs font-medium text-em-700 underline" onClick={() => startEdit(h.id)} data-testid={`edit-${h.id}`}>Edit</button>}
            </li>);
        })}</ul>
      )}
      {editable ? (
        <form className="mt-4 space-y-3 rounded-lg bg-ivory p-3" noValidate data-testid="hypothesis-form" onSubmit={(e) => {
          e.preventDefault();
          const r = editing ? run((w, ctx) => updateHypothesis(w, ctx, c.id, editing, { kind, statement, status, rationale }), "Hypothesis updated.") : run((w, ctx) => addHypothesis(w, ctx, c.id, { kind, statement, status, rationale }), "Hypothesis added.");
          if (r.ok) reset();
        }}>
          <p className="text-sm font-semibold">{editing ? `Edit ${editing}` : "Add a hypothesis or alternative explanation"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Type" value={kind} onChange={(v) => setKind(v as HypKind)} options={HYP_KINDS.map((k) => ({ value: k, label: k === "primary" ? "Primary hypothesis" : "Alternative explanation" }))} testId="hyp-kind" />
            <SelectField label="Status" value={status} onChange={(v) => setStatus(v as HypStatus)} options={HYP_STATUSES.map((k) => ({ value: k, label: k }))} testId="hyp-status" />
          </div>
          <TextArea label="Statement" value={statement} onChange={setStatement} rows={2} required testId="hyp-statement" />
          <TextArea label="Rationale" value={rationale} onChange={setRationale} rows={2} testId="hyp-rationale" />
          <ErrorList errors={errors} />
          {notice && <Notice>{notice}</Notice>}
          <div className="flex gap-2"><Btn type="submit" testId="hyp-save">{editing ? "Save hypothesis" : "Add hypothesis"}</Btn>{editing && <Btn kind="secondary" onClick={() => { reset(); clear(); }}>Cancel</Btn>}</div>
        </form>
      ) : <div className="mt-3"><Locked action="case.edit" what="edit hypotheses"><span /></Locked></div>}
    </CardSection>
  );
}
