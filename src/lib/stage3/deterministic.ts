/** Deterministic demonstration output. Rule-based text assembly from the supplied scope — it is NOT an AI run and is always labelled so.
 *  It produces the same raw shape as the provider path and goes through the same validation. */
import { looksLikeInstruction } from "./validate";
import type { AiOperation, CaseContext, Scope } from "./types";

type RawCitation = { evidenceId: string; version: number; ref: string; quote: string };
const hShort = (id: string) => `H${Number(id.split("-").pop())}`;

function excerpt(t: string): string {
  const s = t.trim();
  const end = s.search(/[.;](\s|$)/);
  const cut = end >= 40 && end <= 240 ? s.slice(0, end + 1) : s.slice(0, 200);
  return cut.trim();
}
function cite(scope: Scope, evidenceId: string, preferred: string[]): RawCitation | null {
  const ev = scope.evidence.find((e) => e.evidenceId === evidenceId);
  if (!ev) return null;
  const usable = ev.blocks.filter((b) => !looksLikeInstruction(b.text));
  const block = preferred.map((r) => usable.find((b) => b.ref === r)).find(Boolean) ?? usable[0];
  return block ? { evidenceId, version: ev.version, ref: block.ref, quote: excerpt(block.text) } : null;
}

const STOP = new Set("a an and are as at be been by can could did do does for from had has have how if in into is it its of on or our should than that the their there these this those to was were what when where which who why will with would about between not".split(" "));
const terms = (q: string) => [...new Set((q.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? []).filter((w) => !STOP.has(w)))];

export function deterministicRaw(operation: AiOperation, ctx: CaseContext, scope: Scope, question = ""): Record<string, unknown> {
  const links = ctx.links;
  const hyp = (id: string | null) => ctx.hypotheses.find((h) => h.id === id);
  const claimFor = (l: CaseContext["links"][number]) => {
    const c = cite(scope, l.evidenceId, l.refs);
    if (!c) return null;
    const h = hyp(l.hypothesisId);
    return { text: `${l.evidenceId} (${l.stance}${h ? `, ${hShort(h.id)}` : ""}) states: ${c.quote}`, citations: [c], records: h ? [h.id] : [] };
  };
  const sourceClaims = (filter: (l: CaseContext["links"][number]) => boolean, n: number) => links.filter(filter).map(claimFor).filter(Boolean).slice(0, n);
  const missing = () => [
    ...ctx.notes.filter((n) => n.kind === "missing" && !n.resolved).map((n) => ({ text: n.text })),
    ...ctx.notes.filter((n) => n.kind === "question" && !n.resolved).map((n) => ({ text: `Open question: ${n.text}` })),
    ...ctx.hypotheses.filter((h) => !links.some((l) => l.hypothesisId === h.id)).map((h) => ({ text: `Hypothesis ${hShort(h.id)} has no linked evidence yet.` })),
    ...scope.evidence.flatMap((e) => e.limitations.slice(0, 1).map((t) => ({ text: `Limitation of ${e.evidenceId} (v${e.version}): ${t}` }))),
  ].slice(0, 8);

  if (operation === "summarize") {
    return {
      sourceSupported: sourceClaims(() => true, 6),
      inferences: ctx.hypotheses.map((h) => {
        const sup = links.filter((l) => l.hypothesisId === h.id && l.stance === "supports").map((l) => l.evidenceId);
        const con = links.filter((l) => l.hypothesisId === h.id && l.stance === "contradicts").map((l) => l.evidenceId);
        return { text: `Hypothesis ${hShort(h.id)} (${h.kind}, ${h.status}) has ${sup.length ? `supporting evidence ${sup.join(", ")}` : "no supporting evidence linked"} and ${con.length ? `contradicting evidence ${con.join(", ")}` : "no contradicting evidence linked"}.`, basis: "Read from the case's evidence links and hypothesis status; no interpretation of the sources.", records: [h.id], citations: [] };
      }),
      missingInformation: missing(),
      nextSteps: [
        ...ctx.tasks.filter((t) => t.status !== "Done").slice(0, 3).map((t) => ({ text: `Complete task ${t.id}: ${t.title}.` })),
        ...(ctx.findings.length ? [] : [{ text: "No expert finding is recorded yet; an expert review is the next independent check." }]),
      ],
    };
  }
  if (operation === "conflicts") {
    const contradictions: unknown[] = [];
    for (const h of ctx.hypotheses) {
      const sup = links.find((l) => l.hypothesisId === h.id && l.stance === "supports");
      for (const con of links.filter((l) => l.hypothesisId === h.id && l.stance === "contradicts")) {
        if (!sup) continue;
        const a = cite(scope, sup.evidenceId, sup.refs), b = cite(scope, con.evidenceId, con.refs);
        if (a && b) contradictions.push({ text: `On ${hShort(h.id)}, ${sup.evidenceId} (supports) and ${con.evidenceId} (contradicts) point in different directions. The cited passages are shown; this tool does not decide which is right.`, citations: [a, b], records: [h.id] });
      }
    }
    return {
      contradictions: contradictions.slice(0, 8),
      sourceSupported: sourceClaims((l) => l.stance === "contradicts", 4),
      missingInformation: missing(),
    };
  }
  if (operation === "tasks") {
    const existing = ctx.tasks.map((t) => t.title.toLowerCase());
    const props: { title: string; description: string; rationale: string; citations: RawCitation[]; dueInDays: number }[] = [];
    for (const n of ctx.notes.filter((x) => x.kind === "missing" && !x.resolved).slice(0, 3)) props.push({ title: `Obtain: ${n.text.slice(0, 90)}`, description: `Close the recorded information gap: ${n.text}`, rationale: "Recorded as missing information on this case.", citations: [], dueInDays: 7 });
    for (const h of ctx.hypotheses.filter((x) => x.status === "Open" && !links.some((l) => l.hypothesisId === x.id && l.stance === "contradicts")).slice(0, 2)) props.push({ title: `Look for evidence that could disprove ${hShort(h.id)}`, description: `No linked evidence currently contradicts ${hShort(h.id)}. Seek a source that could.`, rationale: `${hShort(h.id)} is still open and untested by contradicting evidence.`, citations: [], dueInDays: 10 });
    for (const l of links.filter((x) => x.stance === "contradicts").slice(0, 2)) { const c = cite(scope, l.evidenceId, l.refs); props.push({ title: `Reconcile the contradiction raised by ${l.evidenceId}`, description: `Establish whether ${l.evidenceId} changes the working hypothesis.`, rationale: "Linked evidence is recorded as contradicting a hypothesis.", citations: c ? [c] : [], dueInDays: 5 }); }
    return { proposedTasks: props.filter((p) => !existing.some((e) => e.includes(p.title.toLowerCase()))).slice(0, 5), missingInformation: [], nextSteps: [] };
  }
  if (operation === "brief") {
    const findings = sourceClaims((l) => l.stance !== "context" || true, 5);
    return {
      proposedBrief: {
        decisionQuestion: ctx.question,
        findings,
        uncertainties: [...missing().map((m) => m.text), ...links.filter((l) => l.stance === "contradicts").map((l) => `Contradicted by ${l.evidenceId} (v${l.version}): ${l.note}`)].slice(0, 6),
        nextStep: ctx.findings.length ? "Review this draft against the recorded expert findings before it is relied on." : "Request an expert review of the cited evidence before this draft is relied on.",
      },
      missingInformation: [],
    };
  }
  // question
  const ts = terms(question);
  const scored: { evidenceId: string; ref: string; text: string; version: number; score: number }[] = [];
  for (const e of scope.evidence) for (const b of e.blocks) {
    if (looksLikeInstruction(b.text)) continue;
    const t = `${e.title} ${b.text}`.toLowerCase();
    const hit = ts.filter((w) => t.includes(w)).length;
    if (hit) scored.push({ evidenceId: e.evidenceId, ref: b.ref, text: b.text, version: e.version, score: hit });
  }
  scored.sort((a, b) => b.score - a.score);
  const need = ts.length <= 2 ? 1 : 2;
  const top = scored.filter((s) => s.score >= need).slice(0, 3);
  if (!top.length) return { insufficientEvidence: "The supplied evidence does not contain material that matches this question, so it cannot be answered from the case scope.", missingInformation: [{ text: "Evidence that addresses the question as asked." }] };
  return {
    sourceSupported: top.map((s) => ({ text: `${s.evidenceId} ${s.ref} states: ${excerpt(s.text)}`, citations: [{ evidenceId: s.evidenceId, version: s.version, ref: s.ref, quote: excerpt(s.text) }], records: [] })),
    inferences: [], missingInformation: [],
  };
}
