/** Builds the exact, bounded scope the assistant may see for a case, and the fingerprint used to detect changed inputs. */
import { EVIDENCE_BY_ID } from "../stage2/catalog";
import { evidenceRefs, versionOf } from "@/data/stage2/blocks";
import { activeLinks } from "../stage2/brief";
import type { CaseAggregate } from "../stage2/types";
import { LIMITS, type CaseContext, type Scope, type ScopeEvidence, type Snapshot } from "./types";
import { personName } from "../stage2/catalog";

/** Small deterministic string hash (FNV-1a, two seeds → 16 hex chars). Not cryptographic; it only detects change. */
export function hash(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
    b = ((b << 13) | (b >>> 19)) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/** Numeric tokens in text, ignoring record identifiers and reference labels (EVD-LOG-01, H1, P2, T1R3, v2). */
export function numberTokens(text: string): string[] {
  const t = text
    .replace(/\b[A-Z]{2,5}(?:-[A-Z0-9]{1,5})+\b/g, " ")
    .replace(/\b(?:H|P|R|v|V)\d+\b/g, " ")
    .replace(/\bT\d+R\d+\b/g, " ");
  return (t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "").replace(/\.0+$/, "")).filter((n) => n !== "");
}

export function buildContext(c: CaseAggregate): CaseContext {
  const links = activeLinks(c);
  return {
    caseId: c.id, sectorId: c.sectorId, title: c.title, question: c.question, summary: c.summary, ownerId: c.ownerId,
    hypotheses: c.hypotheses.map((h) => ({ id: h.id, kind: h.kind, status: h.status, statement: h.statement, rationale: h.rationale })),
    links: links.map((l) => ({ id: l.id, evidenceId: l.evidenceId, version: l.version, stance: l.stance, hypothesisId: l.hypothesisId, note: l.note, refs: l.refs })),
    tasks: c.tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, assigneeId: t.assigneeId, findings: t.findings, completionNote: t.completionNote })),
    findings: c.reviews.flatMap((r) => r.rounds.flatMap((rd) => (rd.submission?.findings ?? []).map((f) => ({ id: f.id, type: f.type, text: f.text, citations: f.citations, by: personName(rd.submission!.submittedBy), outcome: rd.submission!.outcome })))),
    notes: [
      ...c.assumptions.map((n) => ({ id: n.id, kind: "assumption" as const, text: n.text, resolved: n.resolved })),
      ...c.missing.map((n) => ({ id: n.id, kind: "missing" as const, text: n.text, resolved: n.resolved })),
      ...c.questions.map((n) => ({ id: n.id, kind: "question" as const, text: n.text, resolved: n.resolved })),
    ],
  };
}

const caseText = (x: CaseContext) => JSON.stringify([x.title, x.question, x.summary]);
const caseRecordText = (x: CaseContext) =>
  [x.title, x.question, x.summary, ...x.hypotheses.flatMap((h) => [h.statement, h.rationale]), ...x.links.map((l) => l.note), ...x.tasks.flatMap((t) => [t.title, t.findings, t.completionNote]), ...x.findings.map((f) => f.text), ...x.notes.map((n) => n.text)].join("\n");

/** The evidence versions and case records the assistant may use. Evidence content always comes from the catalog, never from the caller. */
export function scopeOf(x: CaseContext): Scope {
  const problems: string[] = [];
  const seen = new Set<string>();
  const evidence: ScopeEvidence[] = [];
  for (const l of x.links) {
    const key = `${l.evidenceId}@${l.version}`;
    const e = EVIDENCE_BY_ID[l.evidenceId];
    const v = e ? versionOf(e, l.version) : undefined;
    if (!e || !v) { problems.push(`Evidence ${l.evidenceId} v${l.version} is not readable.`); continue; }
    if (e.sectorId !== x.sectorId) { problems.push(`Evidence ${l.evidenceId} belongs to another sector and is excluded.`); continue; }
    const existing = evidence.find((s) => s.evidenceId === l.evidenceId && s.version === l.version);
    if (seen.has(key) && existing) { if (!existing.stances.includes(l.stance)) existing.stances.push(l.stance); continue; }
    seen.add(key);
    evidence.push({
      evidenceId: e.id, version: v.version, title: e.title, source: e.source, sourceDate: v.sourceDate, limitations: v.limitations,
      blocks: evidenceRefs(v).map((r) => ({ ref: r.ref, kind: r.kind, text: r.text })), stances: [l.stance],
    });
  }
  const evidenceChars = evidence.reduce((a, e) => a + e.blocks.reduce((s, b) => s + b.text.length, 0) + e.limitations.join("").length, 0);
  const contextChars = caseRecordText(x).length;
  const totalChars = evidenceChars + contextChars;
  if (!evidence.length) problems.push("No readable evidence is linked to this case.");
  const tooLarge = totalChars > LIMITS.maxInputChars;
  if (tooLarge) problems.push(`The scope is ${totalChars.toLocaleString("en-US")} characters; the limit is ${LIMITS.maxInputChars.toLocaleString("en-US")}. Unlink evidence that is not needed.`);
  if (x.links.length > LIMITS.maxLinks) problems.push(`More than ${LIMITS.maxLinks} evidence links.`);
  return {
    caseId: x.caseId, evidence,
    recordIds: { hypotheses: x.hypotheses.map((h) => h.id), tasks: x.tasks.map((t) => t.id), findings: x.findings.map((f) => f.id), notes: x.notes.map((n) => n.id) },
    evidenceChars, contextChars, totalChars, tooLarge, problems, fingerprint: fingerprintOf(x),
    contextNumbers: [...new Set(numberTokens(caseRecordText(x)))].slice(0, 300),
  };
}

export function fingerprintOf(x: CaseContext): string {
  const canon = JSON.stringify({
    c: caseText(x), h: x.hypotheses, l: x.links.map((l) => [l.evidenceId, l.version, l.stance, l.hypothesisId, l.note, l.refs]).sort((a, b) => String(a).localeCompare(String(b))),
    t: x.tasks, f: x.findings, n: x.notes,
  });
  return hash(canon);
}

export function snapshotOf(x: CaseContext, scope: Scope): Snapshot {
  return {
    fingerprint: scope.fingerprint, chars: scope.totalChars,
    evidence: scope.evidence.map((e) => ({ evidenceId: e.evidenceId, version: e.version, refCount: e.blocks.length })),
    links: x.links.map((l) => ({ id: l.id, evidenceId: l.evidenceId, version: l.version, stance: l.stance, hypothesisId: l.hypothesisId, h: hash(JSON.stringify([l.note, l.refs])) })),
    hypotheses: x.hypotheses.map((h) => ({ id: h.id, h: hash(JSON.stringify(h)) })),
    tasks: x.tasks.map((t) => ({ id: t.id, h: hash(JSON.stringify(t)) })),
    findings: x.findings.map((f) => f.id), notes: x.notes.map((n) => ({ id: n.id, h: hash(JSON.stringify(n)) })),
    caseText: hash(caseText(x)), contextNumbers: scope.contextNumbers,
  };
}

/** Plain-language reasons the inputs differ from a run's snapshot. Empty when the run is current. */
export function staleReasons(snap: Snapshot, now: CaseContext): string[] {
  const cur = snapshotOf(now, scopeOf(now));
  if (cur.fingerprint === snap.fingerprint) return [];
  const out: string[] = [];
  if (cur.caseText !== snap.caseText) out.push("The case title, question or summary was edited.");
  const key = (l: { evidenceId: string; hypothesisId: string | null }) => `${l.evidenceId}|${l.hypothesisId}`;
  const oldL = new Map(snap.links.map((l) => [key(l), l]));
  const curL = new Map(cur.links.map((l) => [key(l), l]));
  for (const [k, l] of curL) {
    const o = oldL.get(k);
    if (!o) out.push(`Evidence ${l.evidenceId} (v${l.version}) was linked after this run started.`);
    else if (o.stance !== l.stance) out.push(`Evidence ${l.evidenceId} changed from “${o.stance}” to “${l.stance}”.`);
    else if (o.version !== l.version) out.push(`Evidence ${l.evidenceId} moved from v${o.version} to v${l.version}.`);
    else if (o.h !== l.h) out.push(`The link note or cited references for ${l.evidenceId} changed.`);
  }
  for (const [k, l] of oldL) if (!curL.has(k)) out.push(`The link to ${l.evidenceId} was removed.`);
  const diff = (label: string, a: { id: string; h: string }[], b: { id: string; h: string }[], name: (id: string) => string = (id) => id) => {
    const am = new Map(a.map((x) => [x.id, x.h])), bm = new Map(b.map((x) => [x.id, x.h]));
    for (const [id, h] of bm) { if (!am.has(id)) out.push(`${label} ${name(id)} was added.`); else if (am.get(id) !== h) out.push(`${label} ${name(id)} was edited.`); }
    for (const id of am.keys()) if (!bm.has(id)) out.push(`${label} ${name(id)} was removed.`);
  };
  diff("Hypothesis", snap.hypotheses, cur.hypotheses, (id) => `H${Number(id.split("-").pop())}`);
  diff("Task", snap.tasks, cur.tasks);
  diff("Note", snap.notes, cur.notes);
  const of = new Set(snap.findings);
  const newF = cur.findings.filter((f) => !of.has(f));
  if (newF.length) out.push(`${newF.length} expert finding(s) were added: ${newF.join(", ")}.`);
  if (!out.length) out.push("The case record changed.");
  return out;
}
