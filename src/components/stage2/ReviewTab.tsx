"use client";

import { useState } from "react";
import { PEOPLE, PEOPLE_BY_ID } from "@/data";
import { evidenceRefs, versionOf } from "@/data/stage2/blocks";
import { FINDING_TYPES, REVIEW_OUTCOMES, type CaseAggregate, type Citation, type FindingType, type ReviewOutcome, type ReviewRequest } from "@/lib/stage2/types";
import { requestReview, submitReview, withdrawReview, type FindingInput } from "@/lib/stage2/mutations";
import { can, openReviews, reviewState } from "@/lib/stage2/rules";
import { activeLinks } from "@/lib/stage2/brief";
import { EVIDENCE_BY_ID, personLabel, personName } from "@/lib/stage2/catalog";
import { useDemo } from "@/state/DemoProvider";
import { Btn, CardSection, ErrorList, Locked, Notice, ReviewBadge, SelectField, TextArea, TextField, fmtDate, fmtDateTime, useAction } from "./common";
import { RefChips } from "./EvidenceTab";

export function ReviewTab({ c }: { c: CaseAggregate }) {
  const { role } = useDemo();
  const open = openReviews(c);
  return (
    <>
      <p className="rounded-lg border border-dashed border-gd-500/60 bg-gd-100/50 p-3 text-sm text-ink-2" role="note"><b>“Reviewed” does not mean approved.</b> An expert review adds findings, caveats and disagreements to the case. Approvals cannot be recorded in this stage. Requests are not sent to real people.</p>
      {c.reviews.length === 0 && <CardSection title="Review history"><p className="text-sm text-muted">No expert review has been requested for this case.</p></CardSection>}
      {c.reviews.map((r) => <ReviewCard key={r.id} c={c} r={r} />)}
      {role === "Expert" && open.length > 0 && c.status !== "Closed" && open.map((r) => <ExpertForm key={r.id} c={c} r={r} />)}
      {role === "Expert" && open.length === 0 && <p className="rounded-lg bg-ivory-2 px-3 py-2 text-sm text-ink-2" data-testid="no-open-review">No open review request on this case for the Expert demonstration role to answer.</p>}
      {role === "Approver" && <p className="rounded-lg bg-ivory-2 px-3 py-2 text-sm text-ink-2">The Approver demonstration role can read findings and briefs but cannot record approvals in Stage 2.</p>}
      {role === "Analyst" && <RequestForm c={c} />}
    </>
  );
}

function ReviewCard({ c, r }: { c: CaseAggregate; r: ReviewRequest }) {
  const { role } = useDemo();
  const { run, errors, notice } = useAction();
  const state = reviewState(r);
  return (
    <CardSection title={`Review request ${r.id}`} id={`focus-${r.id}`} actions={<ReviewBadge state={state} />}>
      <p className="text-sm">Expert: <b>{personLabel(r.assigneeId)}</b></p>
      <ol className="mt-3 space-y-4" data-testid={`review-rounds-${r.id}`}>
        {r.rounds.map((rd) => (
          <li key={rd.round} className="rounded-lg border border-line p-3" data-testid={`round-${r.id}-${rd.round}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Round {rd.round} · requested {fmtDateTime(rd.requestedAt)} · due {fmtDate(rd.dueDate)}</p>
            <p className="mt-1 text-sm"><b>Scope:</b> {rd.scope}</p>
            {rd.submission ? (
              <div className="mt-2 rounded-lg bg-ivory p-3" data-testid={`submission-${r.id}-${rd.round}`}>
                <p className="text-sm"><b>{personName(rd.submission.submittedBy)}</b> returned <b>{rd.submission.outcome}</b> on {fmtDateTime(rd.submission.submittedAt)}{rd.submission.outcome === "Reviewed" ? " (this is not an approval)" : ""}.</p>
                {rd.submission.note && <p className="mt-1 text-sm"><b>Note:</b> {rd.submission.note}</p>}
                <ul className="mt-2 space-y-2">{rd.submission.findings.map((f) => (
                  <li key={f.id} className="rounded border border-line bg-white p-2 text-sm" id={`focus-${f.id}`} data-testid={`finding-${f.id}`}>
                    <span className={`mr-2 rounded-full border px-2 py-0.5 text-xs font-semibold ${f.type === "Disagreement" ? "border-rd-600/30 bg-rd-100 text-rd-800" : f.type === "Caveat" ? "border-am-600/30 bg-am-100 text-am-800" : "border-sg-500/40 bg-sg-100 text-sg-700"}`}>{f.type}</span>{f.text}
                    <p className="mt-1 text-xs text-muted">Cites: {f.citations.map((ct) => <span key={`${ct.evidenceId}${ct.ref}`} className="mr-2"><code>{ct.evidenceId} v{ct.version}</code> <RefChips evidenceId={ct.evidenceId} version={ct.version} refs={[ct.ref]} /></span>)}</p>
                  </li>))}</ul>
              </div>
            ) : state === "Requested" && rd.round === r.rounds.length ? <p className="mt-2 text-sm text-gd-700" data-testid="awaiting-expert">Awaiting the expert&apos;s findings.</p> : null}
          </li>
        ))}
      </ol>
      {state === "Requested" && role === "Analyst" && c.status !== "Closed" && (
        <div className="mt-3"><Btn kind="secondary" onClick={() => run((w, ctx) => withdrawReview(w, ctx, c.id, r.id), "Request withdrawn.")} testId={`withdraw-${r.id}`}>Withdraw this request</Btn><div className="mt-2 space-y-2"><ErrorList errors={errors} />{notice && <Notice>{notice}</Notice>}</div></div>
      )}
    </CardSection>
  );
}

function RequestForm({ c }: { c: CaseAggregate }) {
  const { run, errors, notice, clear } = useAction();
  const experts = PEOPLE.filter((p) => p.sectorId === c.sectorId && p.kind === "expert");
  const [assigneeId, setAssigneeId] = useState(experts[0]?.id ?? "");
  const [scope, setScope] = useState("");
  const [dueDate, setDueDate] = useState("2026-10-30");
  const gated = c.status !== "Investigating";
  return (
    <CardSection title="Request expert review">
      <Locked action="review.request" what="request expert review">
        {gated ? (
          <p className="rounded-lg bg-ivory-2 px-3 py-2 text-sm text-ink-2" data-testid="request-blocked">{c.status === "Expert review" ? "A review is already in progress. Wait for the expert's findings or withdraw the request." : c.status === "Closed" ? "Closed cases are read-only. Reopen the case to request review." : `Expert review can be requested while the case is Investigating (it is ${c.status}).`}</p>
        ) : (
          <form className="space-y-3" noValidate data-testid="review-request-form" onSubmit={(e) => { e.preventDefault(); const r = run((w, ctx) => requestReview(w, ctx, c.id, { assigneeId, scope, dueDate }), (v) => `Review requested (round ${v.round}). The case is now in Expert review.`); if (r.ok) setScope(""); }}>
            <p className="text-xs text-muted">Requires a question, at least one hypothesis and at least one linked evidence item. If an expert previously asked for revision, a new round is added and earlier findings are kept.</p>
            <SelectField label="Expert (named, fictional)" value={assigneeId} onChange={(v) => { clear(); setAssigneeId(v); }} options={experts.map((p) => ({ value: p.id, label: `${p.name} — ${p.title}` }))} testId="review-assignee" />
            <TextArea label="What should the expert review?" value={scope} onChange={setScope} rows={3} required testId="review-scope" />
            <TextField label="Due date" type="date" value={dueDate} onChange={setDueDate} testId="review-due" />
            <ErrorList errors={errors} />
            {notice && <Notice>{notice}</Notice>}
            <Btn type="submit" testId="review-request-submit">Request expert review</Btn>
          </form>
        )}
      </Locked>
    </CardSection>
  );
}

interface DraftFinding { type: FindingType; text: string; citations: Citation[] }
function ExpertForm({ c, r }: { c: CaseAggregate; r: ReviewRequest }) {
  const { run, errors, notice } = useAction();
  const [outcome, setOutcome] = useState<ReviewOutcome>("Reviewed");
  const [note, setNote] = useState("");
  const [findings, setFindings] = useState<DraftFinding[]>([]);
  const [type, setType] = useState<FindingType>("Finding");
  const [text, setText] = useState("");
  const [citeKey, setCiteKey] = useState("");
  const [ref, setRef] = useState("");
  const [cites, setCites] = useState<Citation[]>([]);
  const links = activeLinks(c);
  const linkOptions = [...new Map(links.map((l) => [`${l.evidenceId}@${l.version}`, l])).values()];
  const chosen = linkOptions.find((l) => `${l.evidenceId}@${l.version}` === citeKey);
  const refs = chosen ? evidenceRefs(versionOf(EVIDENCE_BY_ID[chosen.evidenceId], chosen.version)!) : [];
  const [localErr, setLocalErr] = useState<string[]>([]);
  void PEOPLE_BY_ID;
  const addCite = () => { if (!chosen || !ref) { setLocalErr(["Choose an evidence item and a reference to cite."]); return; } if (cites.some((x) => x.evidenceId === chosen.evidenceId && x.version === chosen.version && x.ref === ref)) { setLocalErr(["That citation is already added."]); return; } setLocalErr([]); setCites([...cites, { evidenceId: chosen.evidenceId, version: chosen.version, ref }]); };
  const addFinding = () => { if (text.trim().length < 10) { setLocalErr(["Write the finding (at least 10 characters)."]); return; } if (!cites.length) { setLocalErr(["Cite at least one evidence reference for this finding."]); return; } setLocalErr([]); setFindings([...findings, { type, text, citations: cites }]); setText(""); setCites([]); setRef(""); };
  const submit = () => {
    const input: FindingInput[] = findings;
    const res = run((w, ctx) => submitReview(w, ctx, c.id, { requestId: r.id, outcome, note, findings: input }), (v) => `Returned “${v.outcome}” with ${v.findingIds.length} finding(s). “Reviewed” is not an approval.`);
    if (res.ok) { setFindings([]); setNote(""); }
  };
  return (
    <CardSection title={`Expert panel — ${personName(r.assigneeId)}`} id="expert-panel">
      <p className="mb-3 text-xs text-muted" data-testid="expert-acting-as">Demonstration role: you are acting as the assigned expert for {r.id}. This is not production identity.</p>
      <div className="space-y-4" data-testid="expert-form">
        <fieldset><legend className="mb-1 text-sm font-medium">Outcome</legend>
          <div className="flex flex-wrap gap-3">{REVIEW_OUTCOMES.map((o) => <label key={o} className="flex items-center gap-2 text-sm"><input type="radio" name={`outcome-${r.id}`} checked={outcome === o} onChange={() => setOutcome(o)} data-testid={`outcome-${o.replace(/\s/g, "-")}`} />{o}</label>)}</div>
          <p className="mt-1 text-xs text-muted">“Reviewed” means the expert has added findings. It does not approve anything. “Revision requested” returns the case to Investigating.</p>
        </fieldset>
        <TextArea label={outcome === "Revision requested" ? "What must be revised?" : "Review note (optional)"} value={note} onChange={setNote} rows={2} required={outcome === "Revision requested"} testId="review-note" />
        <div className="space-y-3 rounded-lg bg-ivory p-3">
          <p className="text-sm font-semibold">Add a finding, caveat or disagreement</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Type" value={type} onChange={(v) => setType(v as FindingType)} options={FINDING_TYPES.map((f) => ({ value: f, label: f }))} testId="finding-type" />
            <span />
          </div>
          <TextArea label="Text" value={text} onChange={setText} rows={2} required testId="finding-text" />
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <SelectField label="Cite evidence (linked to this case)" value={citeKey} onChange={(v) => { setCiteKey(v); setRef(""); }} placeholder="Choose linked evidence" options={linkOptions.map((l) => ({ value: `${l.evidenceId}@${l.version}`, label: `${l.evidenceId} v${l.version} — ${EVIDENCE_BY_ID[l.evidenceId]?.title}` }))} testId="cite-evidence" />
            <SelectField label="Reference" value={ref} onChange={setRef} placeholder="Choose a paragraph or row" disabled={!chosen} options={refs.map((x) => ({ value: x.ref, label: `${x.ref} — ${x.text.slice(0, 70)}${x.text.length > 70 ? "…" : ""}` }))} testId="cite-ref" />
            <Btn kind="secondary" onClick={addCite} testId="cite-add">Add citation</Btn>
          </div>
          {cites.length > 0 && <p className="text-xs" data-testid="draft-citations">Citations for this finding: {cites.map((x) => <span key={x.evidenceId + x.ref} className="mr-2 rounded bg-white px-1.5 py-0.5 font-mono">{x.evidenceId} v{x.version} §{x.ref} <button className="ml-1 text-rd-800" aria-label={`Remove citation ${x.ref}`} onClick={() => setCites(cites.filter((y) => y !== x))}>×</button></span>)}</p>}
          <Btn kind="secondary" onClick={addFinding} testId="finding-add">Add finding to review</Btn>
        </div>
        <div>
          <p className="text-sm font-semibold">Findings in this review ({findings.length})</p>
          {findings.length === 0 ? <p className="text-xs text-muted">A finding with at least one valid evidence reference is required before the review can be completed.</p> : (
            <ul className="mt-1 space-y-1.5" data-testid="draft-findings">{findings.map((f, i) => <li key={i} className="rounded border border-line bg-white p-2 text-sm"><b>{f.type}:</b> {f.text} <span className="text-xs text-muted">({f.citations.map((x) => `${x.evidenceId} §${x.ref}`).join(", ")})</span> <button className="ml-1 text-xs text-rd-800 underline" onClick={() => setFindings(findings.filter((_, j) => j !== i))}>Remove</button></li>)}</ul>
          )}
        </div>
        <ErrorList errors={[...localErr, ...errors]} />
        {notice && <Notice>{notice}</Notice>}
        <Btn onClick={submit} testId="submit-review">Complete review: {outcome}</Btn>
      </div>
    </CardSection>
  );
}
void can;
