import type {
  ChartData, ChartDef, CrossLink, Decision, Entity, Evidence, IntelligenceCase, MetricDef, MetricResult, MetricStatus, Notification,
  Sector, SectorId, SectorSeed, Severity, Signal,
} from "@/lib/types";
import { attr, makeEntity, sumAttr } from "./helpers";
import { banking } from "./banking";
import { energy } from "./energy";
import { infrastructure } from "./infrastructure";
import { insurance } from "./insurance";
import { logistics } from "./logistics";
import { manufacturing } from "./manufacturing";
import { realestate } from "./realestate";
import { sovereign } from "./sovereign";

export const DATA_VERSION = "stage1-seed-1";

export const INSTITUTION = {
  name: "Al Noor Sovereign Group",
  short: "Al Noor Group",
  note: "Fictional institution created for demonstration. Not a real organisation.",
  currency: "SAR",
  asOf: "2026-10-12T08:00",
};

/** Sector order as presented to users. */
const ordered: SectorSeed[] = [energy, banking, insurance, manufacturing, logistics, realestate, infrastructure, sovereign];

// ---------- Memo entity (Sovereign Capital): group stakes excluded from additive totals ----------
const groupCapitalExSov = ordered
  .filter((s) => s.sector.id !== "sovereign")
  .reduce((a, s) => a + sumAttr(s.entities, "capital"), 0);
const memo: Entity = makeEntity(
  "SOV", "sovereign", 6, "Stakes in Group sector entities (memo)", "Memo",
  "Carrying value of the Office's stakes in the seven Group sector entities. Equals the sum of their capital employed and is eliminated on consolidation.",
  { capital: groupCapitalExSov },
  { excludeFromGroupTotal: "Already counted within the seven sector entities' capital employed (eliminated on consolidation)." },
);

export const SEEDS: SectorSeed[] = ordered.map((s) =>
  s.sector.id === "sovereign" ? { ...s, entities: [...s.entities, memo] } : s,
);
export const SECTORS: Sector[] = SEEDS.map((s) => s.sector);
export const SECTOR_BY_ID = Object.fromEntries(SEEDS.map((s) => [s.sector.id, s])) as Record<SectorId, SectorSeed>;
export const SECTOR_IDS = SECTORS.map((s) => s.id);
export const isSectorId = (x: string): x is SectorId => x in SECTOR_BY_ID;

export const CROSS_LINKS: CrossLink[] = [
  { id: "XLK-01", fromEntityId: "ENT-BNK-01", toEntityId: "ENT-ENR-04", nature: "Banking lends to energy and utility borrowers, including facilities linked to Wadi Processing Hub expansion (illustrative)." },
  { id: "XLK-02", fromEntityId: "ENT-BNK-02", toEntityId: "ENT-REA-08", nature: "Real-estate and construction lending includes development finance for Marina Residences (illustrative)." },
  { id: "XLK-03", fromEntityId: "ENT-INS-01", toEntityId: "ENT-ENR-03", nature: "Insurance writes property and energy cover on the Sahil Offshore Platform (illustrative)." },
  { id: "XLK-04", fromEntityId: "ENT-LOG-01", toEntityId: "ENT-MFG-02", nature: "Logistics carries steel shipments for Fajr Steel Works (illustrative)." },
  { id: "XLK-05", fromEntityId: "ENT-INF-08", toEntityId: "ENT-REA-01", nature: "Metro Line 1 service affects tenant access to Olaya Tower (illustrative)." },
];

// ---------- Record index ----------
export type RecordKind = "metric" | "signal" | "case" | "decision" | "entity" | "evidence";
export type AnyRecord =
  | { kind: "metric"; data: MetricDef }
  | { kind: "signal"; data: Signal }
  | { kind: "case"; data: IntelligenceCase }
  | { kind: "decision"; data: Decision }
  | { kind: "entity"; data: Entity }
  | { kind: "evidence"; data: Evidence };

const PREFIX: Record<string, RecordKind> = { MET: "metric", SIG: "signal", CAS: "case", DEC: "decision", ENT: "entity", EVD: "evidence" };
export const KIND_LABEL: Record<RecordKind, string> = { metric: "Metric", signal: "Signal", case: "Intelligence case", decision: "Decision", entity: "Entity", evidence: "Evidence" };

const RECORDS = new Map<string, AnyRecord>();
for (const s of SEEDS) {
  s.metrics.forEach((d) => RECORDS.set(d.id, { kind: "metric", data: d }));
  s.signals.forEach((d) => RECORDS.set(d.id, { kind: "signal", data: d }));
  s.cases.forEach((d) => RECORDS.set(d.id, { kind: "case", data: d }));
  s.decisions.forEach((d) => RECORDS.set(d.id, { kind: "decision", data: d }));
  s.entities.forEach((d) => RECORDS.set(d.id, { kind: "entity", data: d }));
  s.evidence.forEach((d) => RECORDS.set(d.id, { kind: "evidence", data: d }));
}
export const getRecord = (id: string | null | undefined): AnyRecord | undefined => (id ? RECORDS.get(id) : undefined);
export const recordKind = (id: string): RecordKind | undefined => PREFIX[id.split("-")[0]];
export const recordSector = (id: string): SectorId | undefined => getRecord(id)?.data.sectorId;
export const allRecordIds = () => Array.from(RECORDS.keys());
export const recordTitle = (id: string): string => {
  const r = getRecord(id);
  if (!r) return id;
  return r.kind === "metric" || r.kind === "entity" ? r.data.name : r.data.title;
};

export const ALL_SIGNALS = SEEDS.flatMap((s) => s.signals);
export const ALL_CASES = SEEDS.flatMap((s) => s.cases);
export const ALL_DECISIONS = SEEDS.flatMap((s) => s.decisions);
export const ALL_ACTIVITY = SEEDS.flatMap((s) => s.activity);

// ---------- Computation ----------
export function computeMetric(def: MetricDef): MetricResult & { status: MetricStatus } {
  const r = def.compute(SECTOR_BY_ID[def.sectorId].entities);
  return { ...r, status: def.status ? def.status(r.value) : "ok" };
}
export function computeChart(def: ChartDef): ChartData {
  const seed = SECTOR_BY_ID[def.sectorId];
  return def.build(seed.entities, seed.sector.periods);
}

/** Additive Group measure: capital employed per sector, excluding memo (non-additive) entities. */
export function sectorCapital(id: SectorId): number {
  return SECTOR_BY_ID[id].entities.filter((e) => !e.excludeFromGroupTotal).reduce((a, e) => a + attr(e, "capital"), 0);
}
export const groupCapital = () => SECTOR_IDS.reduce((a, id) => a + sectorCapital(id), 0);

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "moderate", "low"];
export const severityRank = (s: Severity) => SEVERITY_ORDER.indexOf(s);

export function sectorCounts(id: SectorId) {
  const sd = SECTOR_BY_ID[id];
  const bySev = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, sd.signals.filter((x) => x.severity === s).length])) as Record<Severity, number>;
  const commitments = sd.decisions.filter((d) => d.amountKind === "commitment").reduce((a, d) => a + (d.amountSARm ?? 0), 0);
  const reallocations = sd.decisions.filter((d) => d.amountKind === "reallocation").reduce((a, d) => a + (d.amountSARm ?? 0), 0);
  return { signals: sd.signals.length, bySev, cases: sd.cases.length, decisions: sd.decisions.length, commitments, reallocations };
}
export function groupCounts() {
  const parts = SECTOR_IDS.map(sectorCounts);
  const sev = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, parts.reduce((a, p) => a + p.bySev[s], 0)])) as Record<Severity, number>;
  return {
    signals: parts.reduce((a, p) => a + p.signals, 0), bySev: sev, cases: parts.reduce((a, p) => a + p.cases, 0),
    decisions: parts.reduce((a, p) => a + p.decisions, 0), commitments: parts.reduce((a, p) => a + p.commitments, 0),
    reallocations: parts.reduce((a, p) => a + p.reallocations, 0),
  };
}

// ---------- Notifications ----------
export const NOTIFICATIONS: Notification[] = [
  { id: "NTF-01", sectorId: "logistics", at: "2026-10-11T18:05", title: "Critical signal: Western trucking delays", body: "Delay rate on the Gateway–Western lane crossed the alert tolerance.", recordId: "SIG-LOG-01" },
  { id: "NTF-02", sectorId: "infrastructure", at: "2026-10-11T17:30", title: "Critical signal: Metro Extension C behind plan", body: "Completion is 11 pts behind plan.", recordId: "SIG-INF-01" },
  { id: "NTF-03", sectorId: "energy", at: "2026-10-11T16:20", title: "Decision awaiting approval: Sahil infill programme", body: "Proposal submitted for the Approver queue.", recordId: "DEC-ENR-02" },
  { id: "NTF-04", sectorId: "banking", at: "2026-10-11T15:00", title: "Decision awaiting approval: HQLA top-up", body: "Liquidity coverage is below its demonstration tolerance.", recordId: "DEC-BNK-01" },
  { id: "NTF-05", sectorId: "insurance", at: "2026-10-11T12:00", title: "Case ready for decision: Reserving review", body: "Engineering reserves are below best estimate.", recordId: "CAS-INS-01" },
  { id: "NTF-06", sectorId: "sovereign", at: "2026-10-11T13:00", title: "Rebalance proposal submitted", body: "Global equities exceed the mandate band.", recordId: "DEC-SOV-01" },
  { id: "NTF-07", sectorId: "manufacturing", at: "2026-10-10T13:40", title: "New signal: Noor Packaging utilisation", body: "Utilisation is below 85%.", recordId: "SIG-MFG-04" },
  { id: "NTF-08", sectorId: "realestate", at: "2026-10-10T16:00", title: "New signal: Waterfront Phase 1 delay", body: "Completion is behind plan.", recordId: "SIG-REA-04" },
  { id: "NTF-09", sectorId: "banking", at: "2026-10-09T13:30", title: "Case opened: Real-estate credit watchlist", body: "Non-performing exposure is above book average.", recordId: "CAS-BNK-02" },
  { id: "NTF-10", sectorId: "energy", at: "2026-10-09T11:00", title: "Case opened: Wadi hub concentration", body: "Expert input requested.", recordId: "CAS-ENR-01" },
  { id: "NTF-11", sectorId: "sovereign", at: "2026-10-12T08:00", title: "Demonstration data loaded", body: `Seed ${DATA_VERSION}: fictional records for eight sectors. No live feeds.` },
];

// ---------- Search ----------
export interface SearchHit { id: string; kind: RecordKind; title: string; sectorId: SectorId; snippet: string; score: number }
const searchText = (r: AnyRecord): string => {
  const d = r.data as unknown as Record<string, unknown>;
  const parts: string[] = [r.data.id];
  for (const k of ["name", "title", "summary", "description", "category", "theme", "source", "kind", "owner", "decisionType"]) if (typeof d[k] === "string") parts.push(d[k] as string);
  return parts.join(" ").toLowerCase();
};
const INDEX = Array.from(RECORDS.values()).map((r) => ({ r, text: searchText(r) }));
export function search(query: string, limit = 12): SearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const { r, text } of INDEX) {
    if (!terms.every((t) => text.includes(t))) continue;
    const title = recordTitle(r.data.id);
    const tl = title.toLowerCase();
    let score = 0;
    for (const t of terms) score += (r.data.id.toLowerCase() === t ? 20 : 0) + (tl.includes(t) ? 5 : 1);
    if (r.kind === "signal" || r.kind === "case" || r.kind === "decision") score += 1;
    const sn = (r.data as unknown as { summary?: string; description?: string }).summary ?? (r.data as unknown as { description?: string }).description ?? "";
    hits.push({ id: r.data.id, kind: r.kind, title, sectorId: r.data.sectorId, snippet: sn, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------- Formatting ----------
export const fmtNum = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtTime = (iso: string) => (iso.length > 10 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} AST` : iso);
export const fmtSAR = (m: number) => (m >= 1000 ? `SAR ${fmtNum(m / 1000, 1)} bn` : `SAR ${fmtNum(m)} m`);

// ---------- Reverse lookups ----------
export function referencedBy(id: string): { kind: RecordKind; id: string }[] {
  const out: { kind: RecordKind; id: string }[] = [];
  for (const s of SEEDS) {
    s.signals.forEach((x) => (x.entityIds.includes(id) || x.evidenceIds.includes(id) || x.metricId === id) && out.push({ kind: "signal", id: x.id }));
    s.cases.forEach((x) => (x.entityIds.includes(id) || x.evidenceIds.includes(id)) && out.push({ kind: "case", id: x.id }));
    s.decisions.forEach((x) => (x.entityIds.includes(id) || x.evidenceIds.includes(id)) && out.push({ kind: "decision", id: x.id }));
    s.metrics.forEach((x) => computeMetric(x).sources.includes(id) && out.push({ kind: "metric", id: x.id }));
    s.entities.forEach((x) => x.dependsOn?.includes(id) && out.push({ kind: "entity", id: x.id }));
  }
  return out;
}
