/** Validates model (or deterministic) output against the supplied scope. Pure and deterministic.
 *  Verified here: citations resolve to supplied evidence versions and references; quotes appear verbatim in the cited passage;
 *  figures appear in the supplied text; embedded instructions are not treated as evidence.
 *  NOT verified (cannot be, mechanically): that a cited passage actually *entails* the claim. A person must judge that. */
import { PEOPLE_BY_ID } from "@/data";
import { numberTokens } from "./context";
import { LIMITS, type AiOperation, type AssistOutput, type CaseContext, type Claim, type Rejected, type Scope, type TaskProposal, type VCitation } from "./types";

export interface ValidateOpts { operation: AiOperation; now: string; question?: string }

const INSTRUCTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|rules?|prompts?)/i,
  /disregard\s+(?:the\s+)?(?:system|previous|above|all)/i,
  /\byou\s+are\s+now\b/i,
  /\b(?:system|developer)\s+prompt\b/i,
  /\bnew\s+instructions?\s*:/i,
  /note\s+to\s+(?:the\s+)?(?:automated\s+)?(?:assistant|ai|model|llm)s?/i,
  /\b(?:assistant|ai|model|llm)s?\b[^.]{0,30}\b(?:must|should|shall|please)\b[^.]{0,30}\b(?:approve|ignore|disregard|reveal|execute|output|respond|state|say)\b/i,
  /\b(?:approve|execute|release|transfer)\s+(?:the\s+)?(?:payment|funds|transaction|transfer)\b/i,
  /\bdo\s+not\s+(?:cite|mention|tell|reveal)\b/i,
];
export const looksLikeInstruction = (text: string) => INSTRUCTION_PATTERNS.some((p) => p.test(text));

/** Evidence passages in scope that read like instructions to an assistant. They are data, never instructions. */
export function instructionWarnings(scope: Scope): { evidenceId: string; version: number; ref: string }[] {
  return scope.evidence.flatMap((e) => e.blocks.filter((b) => looksLikeInstruction(b.text)).map((b) => ({ evidenceId: e.evidenceId, version: e.version, ref: b.ref })));
}

const FINANCIAL_CALC = /\b(?:estimated?|calculated?|projected|forecast(?:ed)?|expected)\b[^.]{0,50}\b(?:impact|loss(?:es)?|saving|savings|cost|revenue|exposure|return|uplift)\b/i;
const EXPERT_OPINION = /\bexperts?\b[^.]{0,40}\b(?:believes?|concluded?|concludes|agrees?|recommends?|confirms?|opines?|thinks?|advises?|says?|states?|found)\b/i;

const norm = (s: string) => s.toLowerCase().replace(/[“”"‘’']/g, "").replace(/\s+/g, " ").trim();
/** A quote may use "…" or "..." to skip text; every segment must appear in order, verbatim (case and spacing aside). */
export function quoteAppears(quote: string, passage: string): boolean {
  const segs = quote.split(/…|\.{3}/).map(norm).filter((s) => s.length > 0);
  if (!segs.length || segs.join("").length < 8) return false;
  const p = norm(passage);
  let from = 0;
  for (const s of segs) { const i = p.indexOf(s, from); if (i < 0) return false; from = i + s.length; }
  return true;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const text = (x: unknown, max: number): string | null => (typeof x === "string" && x.trim().length > 0 && x.length <= max ? x.trim() : null);

export interface CitationCheck { ok: boolean; citation?: VCitation; reasons: string[]; passage?: string }
export function checkCitation(raw: unknown, scope: Scope): CitationCheck {
  if (!isObj(raw)) return { ok: false, reasons: ["Citation is not an object."] };
  const evidenceId = typeof raw.evidenceId === "string" ? raw.evidenceId : "", ref = typeof raw.ref === "string" ? raw.ref : "";
  const version = typeof raw.version === "number" ? raw.version : NaN;
  const quote = typeof raw.quote === "string" ? raw.quote : "";
  const label = `${evidenceId || "?"} v${Number.isFinite(version) ? version : "?"} ${ref || "?"}`;
  const ev = scope.evidence.find((e) => e.evidenceId === evidenceId);
  if (!ev) return { ok: false, reasons: [`${label}: evidence ${evidenceId || "(none)"} was not in the supplied scope.`] };
  if (ev.version !== version) return { ok: false, reasons: [`${label}: the supplied version of ${evidenceId} is v${ev.version}, not v${Number.isFinite(version) ? version : "?"}.`] };
  const block = ev.blocks.find((b) => b.ref === ref);
  if (!block) return { ok: false, reasons: [`${label}: ${evidenceId} v${version} has no reference ${ref || "(none)"}.`] };
  if (looksLikeInstruction(block.text)) return { ok: false, reasons: [`${label}: the passage contains instruction-like text addressed to an assistant. It is treated as untrusted data and cannot support a claim.`] };
  if (!quote.trim()) return { ok: false, reasons: [`${label}: no supporting quotation was given, so support cannot be checked.`] };
  if (!quoteAppears(quote, block.text)) return { ok: false, reasons: [`${label}: the quotation does not appear in that passage.`] };
  return { ok: true, citation: { evidenceId, version, ref, quote: quote.trim().slice(0, 400) }, reasons: [], passage: block.text };
}

const evidenceNumbers = (scope: Scope) => new Set(scope.evidence.flatMap((e) => [...e.blocks.flatMap((b) => numberTokens(b.text)), ...e.limitations.flatMap(numberTokens)]));

function textIssues(t: string, allowed: Set<string>, what = "claim"): string[] {
  const out: string[] = [];
  if (looksLikeInstruction(t)) out.push(`The ${what} contains instruction-like wording (for example an order to approve, execute or ignore rules). Text of that kind is never accepted from generated output.`);
  if (FINANCIAL_CALC.test(t)) out.push(`The ${what} states a calculated or estimated financial impact. Financial impact is not calculated in Stage 3.`);
  const bad = [...new Set(numberTokens(t))].filter((n) => !allowed.has(n));
  if (bad.length) out.push(`Figure(s) ${bad.map((b) => `“${b}”`).join(", ")} do not appear in the supplied material.`);
  return out;
}

function claimOf(raw: unknown, section: "sourceSupported" | "inferences" | "contradictions" | "briefFinding", scope: Scope, id: string): { claim?: Claim; rejected?: Rejected } {
  const label = { sourceSupported: "Source-supported finding", inferences: "Inference", contradictions: "Contradiction", briefFinding: "Brief finding" }[section];
  if (!isObj(raw)) return { rejected: { section: label, text: "(malformed entry)", reasons: ["The entry is not an object."] } };
  const t = text(raw.text, LIMITS.maxClaimChars);
  if (!t) return { rejected: { section: label, text: String(raw.text ?? "").slice(0, 160) || "(empty)", reasons: ["The statement is empty or longer than the limit."] } };
  const reasons: string[] = [];
  const cites: VCitation[] = [];
  const rawCites = Array.isArray(raw.citations) ? raw.citations.slice(0, LIMITS.maxCitationsPerClaim) : [];
  if (Array.isArray(raw.citations) && raw.citations.length > LIMITS.maxCitationsPerClaim) reasons.push(`More than ${LIMITS.maxCitationsPerClaim} citations.`);
  const passages: string[] = [];
  for (const rc of rawCites) { const r = checkCitation(rc, scope); if (r.ok) { cites.push(r.citation!); passages.push(r.passage!, r.citation!.quote); } else reasons.push(...r.reasons); }
  const records = Array.isArray(raw.records) ? raw.records.filter((x): x is string => typeof x === "string") : [];
  const known = new Set([...scope.recordIds.hypotheses, ...scope.recordIds.tasks, ...scope.recordIds.findings, ...scope.recordIds.notes]);
  for (const r of records) if (!known.has(r)) reasons.push(`Record ${r} is not part of this case's supplied scope.`);
  const needs = section === "contradictions" ? 2 : section === "inferences" ? 0 : 1;
  if (cites.length < needs && !reasons.length) reasons.push(section === "contradictions" ? "A contradiction needs at least two valid citations to different passages." : "A source-supported finding needs at least one valid citation.");
  if (section === "contradictions" && cites.length >= 2 && new Set(cites.map((c) => `${c.evidenceId}|${c.ref}`)).size < 2) reasons.push("The citations point to the same passage; that is not a contradiction.");
  if (section === "inferences") {
    const basis = text(raw.basis, 400);
    if (!basis) reasons.push("An inference must state its basis.");
  }
  const strict = section !== "inferences";
  const allowed = strict ? new Set(passages.flatMap(numberTokens)) : new Set([...scope.contextNumbers, ...evidenceNumbers(scope)]);
  if (!reasons.length) reasons.push(...textIssues(t, strict ? allowed : new Set([...allowed, ...cites.flatMap((c) => numberTokens(c.quote))])));
  if ((section === "sourceSupported" || section === "inferences") && EXPERT_OPINION.test(t) && !records.some((r) => r.startsWith("FND-"))) reasons.push("The statement attributes an opinion to an expert but does not reference a recorded expert finding.");
  if (reasons.length) return { rejected: { section: label, text: t.slice(0, 200), reasons } };
  return { claim: { id, text: t, citations: cites, records, basis: typeof raw.basis === "string" ? raw.basis.trim().slice(0, 400) : undefined } };
}

function plain(raw: unknown, section: string, id: string, scope: Scope, max = 400): { item?: { id: string; text: string }; rejected?: Rejected } {
  const t = isObj(raw) ? text(raw.text, max) : text(raw, max);
  if (!t) return { rejected: { section, text: String(isObj(raw) ? raw.text ?? "" : raw ?? "").slice(0, 160) || "(empty)", reasons: ["The entry is empty or longer than the limit."] } };
  const allowed = new Set([...scope.contextNumbers, ...evidenceNumbers(scope)]);
  const issues = textIssues(t, allowed, "statement");
  if (issues.length) return { rejected: { section, text: t.slice(0, 200), reasons: issues } };
  return { item: { id, text: t } };
}

const addDays = (iso: string, days: number) => { const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

export type ValidateResult = { ok: true; output: AssistOutput } | { ok: false; error: string };

export function validateRaw(raw: unknown, ctx: CaseContext, scope: Scope, opts: ValidateOpts): ValidateResult {
  if (!isObj(raw)) return { ok: false, error: "The response was not a JSON object." };
  const known = ["sourceSupported", "inferences", "contradictions", "missingInformation", "nextSteps", "proposedTasks", "proposedBrief", "insufficientEvidence"];
  if (!known.some((k) => k in raw)) return { ok: false, error: "The response did not contain any expected section." };
  const out: AssistOutput = { sourceSupported: [], inferences: [], contradictions: [], missing: [], nextSteps: [], taskProposals: [], rejected: [], warnings: [] };
  const op = opts.operation;
  const list = (k: string): unknown[] => (Array.isArray(raw[k]) ? (raw[k] as unknown[]) : []);
  const cap = (k: string, n: number) => { if (list(k).length > n) out.warnings.push(`Only the first ${n} entries of “${k}” were considered; the rest were ignored.`); return list(k).slice(0, n); };
  const allow: Record<AiOperation, string[]> = {
    summarize: ["sourceSupported", "inferences", "missingInformation", "nextSteps"],
    conflicts: ["sourceSupported", "contradictions", "missingInformation", "inferences"],
    tasks: ["missingInformation", "nextSteps", "proposedTasks"],
    brief: ["proposedBrief", "missingInformation"],
    question: ["sourceSupported", "inferences", "missingInformation"],
  };
  for (const k of known) if (k !== "insufficientEvidence" && !allow[op].includes(k) && (Array.isArray(raw[k]) ? (raw[k] as unknown[]).length : raw[k])) out.warnings.push(`The response included “${k}”, which this operation does not use. It was ignored.`);

  let n = 0;
  if (allow[op].includes("sourceSupported")) cap("sourceSupported", LIMITS.maxClaims).forEach((r) => { const x = claimOf(r, "sourceSupported", scope, `S${++n}`); if (x.claim) out.sourceSupported.push(x.claim); else out.rejected.push(x.rejected!); });
  n = 0;
  if (allow[op].includes("inferences")) cap("inferences", LIMITS.maxClaims).forEach((r) => { const x = claimOf(r, "inferences", scope, `I${++n}`); if (x.claim) out.inferences.push(x.claim); else out.rejected.push(x.rejected!); });
  n = 0;
  if (allow[op].includes("contradictions")) cap("contradictions", LIMITS.maxClaims).forEach((r) => { const x = claimOf(r, "contradictions", scope, `X${++n}`); if (x.claim) out.contradictions.push(x.claim); else out.rejected.push(x.rejected!); });
  n = 0;
  if (allow[op].includes("missingInformation")) cap("missingInformation", LIMITS.maxMissing).forEach((r) => { const x = plain(r, "Missing information", `M${++n}`, scope); if (x.item) out.missing.push(x.item); else out.rejected.push(x.rejected!); });
  n = 0;
  if (allow[op].includes("nextSteps")) cap("nextSteps", LIMITS.maxNextSteps).forEach((r) => { const x = plain(r, "Suggested next step", `N${++n}`, scope); if (x.item) out.nextSteps.push(x.item); else out.rejected.push(x.rejected!); });

  if (allow[op].includes("proposedTasks")) {
    n = 0;
    for (const r of cap("proposedTasks", LIMITS.maxTasks)) {
      const id = `T${++n}`;
      if (!isObj(r)) { out.rejected.push({ section: "Proposed task", text: "(malformed entry)", reasons: ["The entry is not an object."] }); continue; }
      const title = text(r.title, 120), rationale = text(r.rationale, 500);
      const reasons: string[] = [];
      if (!title || title.length < 5) reasons.push("The task title is missing, shorter than 5 characters or longer than 120.");
      if (!rationale) reasons.push("A rationale is required.");
      const description = typeof r.description === "string" ? r.description.trim().slice(0, 500) : "";
      let assigneeId = ctx.ownerId;
      if (r.assigneeId !== undefined && r.assigneeId !== null && r.assigneeId !== "") {
        const p = typeof r.assigneeId === "string" ? PEOPLE_BY_ID[r.assigneeId] : undefined;
        if (!p || p.sectorId !== ctx.sectorId) reasons.push(`Assignee ${String(r.assigneeId)} is not a named person in this sector.`); else assigneeId = p.id;
      }
      const days = typeof r.dueInDays === "number" && Number.isInteger(r.dueInDays) && r.dueInDays >= 1 && r.dueInDays <= 60 ? r.dueInDays : 7;
      const cites: VCitation[] = [];
      for (const rc of Array.isArray(r.citations) ? r.citations.slice(0, LIMITS.maxCitationsPerClaim) : []) { const c = checkCitation(rc, scope); if (c.ok) cites.push(c.citation!); else reasons.push(...c.reasons); }
      if (title) reasons.push(...textIssues(`${title} ${description} ${rationale ?? ""}`, new Set([...scope.contextNumbers, ...evidenceNumbers(scope)]), "task"));
      if (reasons.length) { out.rejected.push({ section: "Proposed task", text: (title ?? "(untitled)").slice(0, 200), reasons }); continue; }
      out.taskProposals.push({ id, title: title!, description, assigneeId, dueDate: addDays(opts.now, days), rationale: rationale!, citations: cites, status: "pending", edited: false } satisfies TaskProposal);
    }
  }

  if (allow[op].includes("proposedBrief") && raw.proposedBrief !== undefined && raw.proposedBrief !== null) {
    const b = raw.proposedBrief;
    if (!isObj(b)) out.rejected.push({ section: "Proposed brief", text: "(malformed)", reasons: ["The brief proposal is not an object."] });
    else {
      const reasons: string[] = [];
      const dq = text(b.decisionQuestion, 400), ns = text(b.nextStep, 400);
      if (!dq || dq.length < 10) reasons.push("The decision question is missing or shorter than 10 characters.");
      if (!ns) reasons.push("A suggested next step is required.");
      const findings: Claim[] = [];
      (Array.isArray(b.findings) ? b.findings.slice(0, LIMITS.maxClaims) : []).forEach((r, i) => { const x = claimOf(r, "briefFinding", scope, `B${i + 1}`); if (x.claim) findings.push(x.claim); else out.rejected.push(x.rejected!); });
      if (!findings.length) reasons.push("A brief draft needs at least one source-supported finding with a valid citation.");
      const unc: string[] = [];
      (Array.isArray(b.uncertainties) ? b.uncertainties.slice(0, LIMITS.maxMissing) : []).forEach((r) => { const x = plain(r, "Brief uncertainty", "U", scope, 300); if (x.item) unc.push(x.item.text); else out.rejected.push(x.rejected!); });
      const allowed = new Set([...scope.contextNumbers, ...evidenceNumbers(scope)]);
      if (ns) reasons.push(...textIssues(ns, allowed, "next step"));
      if (dq) reasons.push(...textIssues(dq, allowed, "decision question"));
      if (reasons.length) out.rejected.push({ section: "Proposed brief", text: (dq ?? "(no question)").slice(0, 200), reasons });
      else out.briefProposal = { id: "B1", content: { decisionQuestion: dq!, findings, uncertainties: unc, nextStep: ns! }, status: "pending", edited: false };
    }
  }

  const reason = typeof raw.insufficientEvidence === "string" ? raw.insufficientEvidence.trim() : raw.insufficientEvidence === true ? "The model reported that the supplied evidence is insufficient." : "";
  if (reason) out.insufficient = reason.slice(0, 500);
  const grounded = out.sourceSupported.length > 0 || out.contradictions.length > 0 || !!out.briefProposal;
  if (!out.insufficient && (op === "summarize" || op === "question" || op === "brief") && !grounded) out.insufficient = "No statement survived validation against the supplied evidence, so no grounded output is shown.";
  return { ok: true, output: out };
}
