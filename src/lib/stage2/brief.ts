/** Deterministic brief compilation, change basis and "Needs refresh" detection. No AI is involved. */
import type { BriefBasis, BriefContent, BriefFinding, BriefVersion, CaseAggregate, EvidenceLink } from "./types";
import { DECISION_BY_ID, ENTITY_BY_ID, EVIDENCE_BY_ID, objectiveText, personLabel, personName } from "./catalog";
import { PEOPLE_BY_ID } from "@/data";

export const activeLinks = (c: CaseAggregate): EvidenceLink[] => c.links.filter((l) => !l.unlinkedAt);
export const caseNumber = (id: string) => id.split("-")[2];
/** Short label for a hypothesis id: HYP-LOG-01-02 → H2. */
export const hypShort = (id: string) => `H${Number(id.split("-").pop())}`;

export function basisOf(c: CaseAggregate): BriefBasis {
  return {
    links: activeLinks(c).map((l) => ({ evidenceId: l.evidenceId, version: l.version, stance: l.stance, hypothesisId: l.hypothesisId }))
      .sort((a, b) => `${a.evidenceId}|${a.hypothesisId}`.localeCompare(`${b.evidenceId}|${b.hypothesisId}`)),
    hypotheses: c.hypotheses.map((h) => ({ id: h.id, rev: h.rev })).sort((a, b) => a.id.localeCompare(b.id)),
    findings: c.reviews.flatMap((r) => r.rounds.flatMap((x) => x.submission?.findings.map((f) => f.id) ?? [])).sort(),
    reviews: c.reviews.filter((r) => !r.withdrawnAt).map((r) => ({ requestId: r.id, round: r.rounds[r.rounds.length - 1].round, outcome: r.rounds[r.rounds.length - 1].submission?.outcome ?? ("Pending" as const) })),
  };
}
export const basisKey = (b: BriefBasis) => JSON.stringify(b);

export const latestBrief = (c: CaseAggregate): BriefVersion | undefined => c.briefs[c.briefs.length - 1];
export function isBriefStale(c: CaseAggregate): boolean {
  const b = latestBrief(c);
  return !!b && basisKey(b.basis) !== basisKey(basisOf(c));
}

/** Human-readable reasons a saved brief version differs from the current case records. */
export function staleReasons(c: CaseAggregate, brief: BriefVersion): string[] {
  const cur = basisOf(c), old = brief.basis, out: string[] = [];
  const lk = (l: { evidenceId: string; hypothesisId: string | null }) => `${l.evidenceId}|${l.hypothesisId}`;
  const oldL = new Map(old.links.map((l) => [lk(l), l])), curL = new Map(cur.links.map((l) => [lk(l), l]));
  for (const [k, l] of curL) {
    const o = oldL.get(k);
    if (!o) out.push(`Evidence ${l.evidenceId} (v${l.version}, ${l.stance}${l.hypothesisId ? `, ${hypShort(l.hypothesisId)}` : ""}) was linked after this version.`);
    else if (o.stance !== l.stance) out.push(`Evidence ${l.evidenceId} changed from “${o.stance}” to “${l.stance}”.`);
    else if (o.version !== l.version) out.push(`Evidence ${l.evidenceId} moved from v${o.version} to v${l.version}.`);
  }
  for (const [k, l] of oldL) if (!curL.has(k)) out.push(`Evidence ${l.evidenceId} link was removed after this version.`);
  const oh = new Map(old.hypotheses.map((h) => [h.id, h.rev]));
  for (const h of cur.hypotheses) {
    if (!oh.has(h.id)) out.push(`Hypothesis ${hypShort(h.id)} was added.`);
    else if (oh.get(h.id) !== h.rev) out.push(`Hypothesis ${hypShort(h.id)} was edited.`);
  }
  const of = new Set(old.findings);
  const newF = cur.findings.filter((f) => !of.has(f));
  if (newF.length) out.push(`${newF.length} expert finding(s) added: ${newF.join(", ")}.`);
  const reviewKey = (r: BriefBasis["reviews"][number]) => `${r.requestId}|${r.round}|${r.outcome}`;
  if (old.reviews.map(reviewKey).sort().join() !== cur.reviews.map(reviewKey).sort().join() && !newF.length) out.push("Expert review state changed.");
  return out;
}

const SENT = (s: string) => s.trim();
export function compileBrief(c: CaseAggregate, meta: { now: string; createdBy: string; note: string }): BriefVersion {
  const links = activeLinks(c);
  const ref = (l: EvidenceLink) => ({ linkId: l.id, evidenceId: l.evidenceId, version: l.version, refs: l.refs, note: l.note, hypothesisId: l.hypothesisId });
  const hypLabel = (id: string | null) => (id ? c.hypotheses.find((h) => h.id === id) : undefined);
  const findings: BriefFinding[] = c.reviews.flatMap((r) => r.rounds.flatMap((rd) => (rd.submission ? rd.submission.findings.map((f) => ({
    findingId: f.id, type: f.type, text: f.text, citations: f.citations, by: personName(rd.submission!.submittedBy), round: rd.round, outcome: rd.submission!.outcome,
  })) : [])));
  const decisions = c.decisionIds.map((id) => DECISION_BY_ID[id]).filter(Boolean);
  const open = c.reviews.filter((r) => !r.withdrawnAt && !r.rounds[r.rounds.length - 1].submission);
  const lastSub = c.reviews.flatMap((r) => r.rounds).filter((x) => x.submission).sort((a, b) => a.submission!.submittedAt.localeCompare(b.submission!.submittedAt)).pop()?.submission;
  const openTasks = c.tasks.filter((t) => t.status !== "Done").length;
  const owner = PEOPLE_BY_ID[c.ownerId];

  const currentFindings = [
    ...c.hypotheses.map((h) => {
      const hl = links.filter((l) => l.hypothesisId === h.id);
      return `Hypothesis ${hypShort(h.id)} (${h.kind}, ${h.status}): ${SENT(h.statement)} Evidence: ${hl.filter((l) => l.stance === "supports").length} supporting, ${hl.filter((l) => l.stance === "contradicts").length} contradicting.`;
    }),
    ...c.tasks.filter((t) => t.status === "Done" && t.findings).map((t) => `Task ${t.id}: ${SENT(t.findings)}`),
  ];
  const uncertainties = [
    ...c.missing.filter((n) => !n.resolved).map((n) => `Missing information: ${n.text}`),
    ...c.questions.filter((n) => !n.resolved).map((n) => `Unresolved question: ${n.text}`),
    ...findings.filter((f) => f.type === "Caveat").map((f) => `Expert caveat (${f.findingId}): ${f.text}`),
    ...links.filter((l) => l.stance === "contradicts").map((l) => `Contradicted by ${l.evidenceId} (v${l.version})${hypLabel(l.hypothesisId) ? ` against ${hypShort(l.hypothesisId!)}` : ""}: ${l.note}`),
  ];
  const options = [
    { label: "Monitor", description: "Continue monitoring the relevant metrics and signals without committing capital; review at the next reporting period." },
    { label: "No action", description: "Take no action. The residual risk and the contradictory evidence listed in this brief remain unaddressed." },
    ...decisions.map((d) => ({ label: `Proceed with proposal ${d.id}`, description: `${d.title}. Proposal amount ${d.amountSARm === null ? "none" : `SAR ${d.amountSARm.toLocaleString("en-US")} m`} (${d.amountKind}; illustrative figure carried from the Stage 1 proposal record; no impact calculation is made in this brief).` })),
    ...decisions.flatMap((d) => d.options.map((o) => ({ label: `${d.id} option: ${o.label}`, description: o.effect }))),
    ...(decisions.length === 0 ? [{ label: "Prepare a decision proposal", description: "No decision proposal is linked to this case yet; one would be drafted for the Approver." }] : []),
  ];
  let nextStep: string;
  if (open.length) { const r = open[0], rd = r.rounds[r.rounds.length - 1]; nextStep = `Await expert review by ${personName(r.assigneeId)} (due ${rd.dueDate}). ${openTasks} investigation task(s) remain open.`; }
  else if (lastSub?.outcome === "Revision requested") nextStep = `Address the revision requested by the expert (“${lastSub.note}”), then request a new review.`;
  else if (lastSub?.outcome === "Reviewed") nextStep = "Present this brief to the Approver for a decision. Approvals are not recorded in Stage 2.";
  else nextStep = `Complete the ${openTasks} open investigation task(s) and request expert review.`;

  const content: BriefContent = {
    decisionQuestion: c.question.trim() || `What response is proportionate to: ${c.title}?`,
    mandateAlignment: c.objectiveIds.length ? c.objectiveIds.map((id) => `• ${objectiveText(id)}`).join("\n") : "No mandate objective has been linked to this case.",
    currentFindings,
    affectedEntities: c.entityIds.map((id) => `${ENTITY_BY_ID[id]?.name ?? id} (${id})`),
    supportingEvidence: links.filter((l) => l.stance === "supports").map(ref),
    contradictoryEvidence: links.filter((l) => l.stance === "contradicts").map(ref),
    contextEvidence: links.filter((l) => l.stance === "context").map(ref),
    assumptions: c.assumptions.map((n) => n.text),
    uncertainties,
    options,
    expertFindings: findings,
    nextStep,
    accountableOwner: owner ? personLabel(owner.id) : c.ownerId,
    financialImpactNote: "No financial impact is calculated in this brief. Amounts appear only where recorded on linked Stage 1 decision proposals; they are illustrative. Scenario calculations are not part of Stage 2.",
  };
  const version = (latestBrief(c)?.version ?? 0) + 1;
  return {
    id: `BRF-${c.id.split("-")[1]}-${caseNumber(c.id)}-v${version}`, version, createdAt: meta.now, createdBy: meta.createdBy, source: "compiled", note: meta.note, content, basis: basisOf(c),
  };
}
void EVIDENCE_BY_ID;
