/** Builds the seeded case aggregates from Stage 1 cases plus the Stage 2 investigation content. Deterministic. */
import type { Role, SectorId, Severity } from "../types";
import { OBJECTIVES, PEOPLE, SECTOR_BY_ID, SEEDS } from "@/data";
import { S2 } from "@/data/stage2/content";
import type { CaseAggregate, EvidenceLink, Priority } from "./types";
import { compileBrief, caseNumber } from "./brief";
import { latestVersion } from "./catalog";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const SEV_PRIORITY: Record<Severity, Priority> = { critical: "Critical", high: "High", moderate: "Medium", low: "Low" };
const SEV_ORDER: Severity[] = ["critical", "high", "moderate", "low"];

export const SEED_TIME = "2026-10-12T08:00";

function seedCase(sectorId: SectorId, c: (typeof SEEDS)[number]["cases"][number], seedIndex: number): CaseAggregate {
  const seed = SEEDS[seedIndex];
  const inv = S2[sectorId].investigation;
  const primary = inv.caseId === c.id;
  const code = SECTOR_BY_ID[sectorId].sector.code;
  const num = caseNumber(c.id);
  const sigs = c.signalIds.map((id) => seed.signals.find((s) => s.id === id)!).filter(Boolean);
  const worst = SEV_ORDER.find((sv) => sigs.some((s) => s.severity === sv)) ?? "moderate";
  const ownerName = c.owner.replace(/\s*\(.*\)$/, "");
  const ownerId = PEOPLE.find((p) => p.sectorId === sectorId && p.name === ownerName)?.id ?? PEOPLE.find((p) => p.sectorId === sectorId && p.kind === "analyst")!.id;
  const dueDate = c.decisionIds.map((id) => seed.decisions.find((d) => d.id === id)?.dueBy).filter(Boolean).sort()[0] ?? "2026-11-15";
  const themeObjectives = sigs.map((s) => seed.metrics.find((m) => m.id === s.metricId)?.theme).filter(Boolean)
    .map((t) => OBJECTIVES.find((o) => o.sectorId === sectorId && o.text.toLowerCase().startsWith(String(t).toLowerCase()))?.id).filter(Boolean) as string[];

  const base: CaseAggregate = {
    id: c.id, sectorId, origin: "seed", title: c.title, summary: c.summary,
    question: primary ? inv.question : `What is driving this, and what response is proportionate? (${c.title})`,
    status: primary ? "Expert review" : c.status === "Open" ? "Draft" : "Investigating",
    priority: primary ? inv.priority : SEV_PRIORITY[worst],
    ownerId: primary ? inv.ownerId : ownerId, dueDate: primary ? inv.dueDate : dueDate,
    signalIds: [...c.signalIds], entityIds: [...c.entityIds], objectiveIds: primary ? [...inv.objectiveIds] : [...new Set(themeObjectives)], decisionIds: [...c.decisionIds],
    hypotheses: [], links: [], assumptions: [], missing: [], questions: [], tasks: [], reviews: [], briefs: [],
    events: [{ id: `EVT-${code}-${num}-001`, at: c.openedAt, actor: `${ownerName} (Analyst)`, type: "created", text: "Case opened (Stage 1 record)." }],
    revision: 0, createdAt: c.openedAt, updatedAt: c.openedAt,
    seq: { hyp: 0, link: 0, task: 0, note: 0, review: 0, finding: 0, event: 1 },
  };
  const nextLink = (): number => ++base.seq.link;
  if (!primary) {
    // Stage 1 evidence references become context links to the current readable version.
    for (const evidenceId of c.evidenceIds) {
      const n = nextLink();
      base.links.push({ id: `LNK-${code}-${num}-${pad(n)}`, evidenceId, version: latestVersion(evidenceId) || 1, stance: "context", hypothesisId: null, note: "Referenced by the Stage 1 case record.", refs: [], linkedAt: c.openedAt, linkedBy: `${ownerName} (Analyst)`, history: [{ at: c.openedAt, from: null, to: "context", by: "Stage 1 seed" }] });
    }
    return base;
  }

  // ---- Seeded complete investigation
  const hypId = (h: string) => `HYP-${code}-${num}-${pad(Number(h.slice(1)))}`;
  inv.hypotheses.forEach((h) => { base.seq.hyp++; base.hypotheses.push({ id: hypId(h.id), kind: h.kind, statement: h.statement, status: h.status, rationale: h.rationale, rev: 1, createdAt: inv.events[2]?.at ?? c.openedAt, updatedAt: inv.events[2]?.at ?? c.openedAt }); });
  inv.links.forEach((l, i): void => {
    const n = nextLink();
    const at = inv.events[Math.min(i < 2 ? 1 : 2, inv.events.length - 1)].at;
    base.links.push({ id: `LNK-${code}-${num}-${pad(n)}`, evidenceId: l.evidenceId, version: l.version, stance: l.stance, hypothesisId: l.hypothesisId ? hypId(l.hypothesisId) : null, note: l.note, refs: l.refs, linkedAt: at, linkedBy: `${ownerName} (Analyst)`, history: [{ at, from: null, to: l.stance, by: `${ownerName} (Analyst)` }] } satisfies EvidenceLink);
  });
  const note = (text: string) => ({ id: `NTE-${code}-${num}-${pad(++base.seq.note)}`, text, resolved: false, createdAt: inv.events[0].at });
  base.assumptions = inv.assumptions.map(note); base.missing = inv.missing.map(note); base.questions = inv.questions.map(note);
  base.tasks = inv.tasks.map((t) => ({
    id: `TSK-${code}-${num}-${pad(++base.seq.task)}`, title: t.title, description: t.description, assigneeId: t.assigneeId, dueDate: t.dueDate, status: t.status,
    evidenceIds: t.evidenceIds, findings: t.findings, completionNote: t.completionNote, createdAt: inv.events[1].at, completedAt: t.status === "Done" ? inv.events[2].at : undefined,
  }));
  base.reviews = [{ id: `REV-${code}-${num}-${pad(++base.seq.review)}`, assigneeId: inv.review.assigneeId, rounds: [{ round: 1, requestedAt: inv.review.requestedAt, requestedBy: inv.ownerId, scope: inv.review.scope, dueDate: inv.review.dueDate }] }];
  base.events = inv.events.map((e, i) => ({ id: `EVT-${code}-${num}-${pad(i + 1, 3)}`, ...e }));
  base.seq.event = base.events.length;
  base.events.push({ id: `EVT-${code}-${num}-${pad(++base.seq.event, 3)}`, at: inv.review.requestedAt, actor: base.events[0].actor, type: "status-changed", text: "Status changed from Investigating to Expert review." });
  // Draft brief compiled before the expert review (deterministic template; not AI).
  const brief = compileBrief(base, { now: "2026-10-11T10:30", createdBy: `${ownerName} (Analyst)`, note: "Draft brief compiled before expert review (deterministic template)." });
  base.briefs = [brief];
  base.updatedAt = inv.review.requestedAt;
  return base;
}

function build(): Record<string, CaseAggregate> {
  const out: Record<string, CaseAggregate> = {};
  SEEDS.forEach((s, i) => s.cases.forEach((c) => { out[c.id] = seedCase(s.sector.id, c, i); }));
  return out;
}
export const SEED_CASES: Record<string, CaseAggregate> = build();
export const roleLabel = (r: Role) => r;
