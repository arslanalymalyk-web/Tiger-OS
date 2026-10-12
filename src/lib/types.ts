/** Core typed model for the TIGERIS Stage 1 demonstration. All data is fictional. */

export type SectorId =
  | "energy"
  | "banking"
  | "insurance"
  | "manufacturing"
  | "logistics"
  | "realestate"
  | "infrastructure"
  | "sovereign";

export type Role = "Analyst" | "Expert" | "Approver";
export type Severity = "critical" | "high" | "moderate" | "low";
export type MetricStatus = "ok" | "watch" | "alert" | "info";

export interface Entity {
  id: string; // ENT-<SECTOR>-nn
  sectorId: SectorId;
  name: string;
  category: string;
  description: string;
  /** Snapshot values at the sector's latest reporting period. Units in Sector.attrs. */
  attrs: Record<string, number>;
  /** History aligned with Sector.periods; last element equals the snapshot attr of the same name. */
  series?: Record<string, number[]>;
  dependsOn?: string[]; // entity ids (may be same sector)
  /** If set, the entity is shown but excluded from additive Group totals (reason given). */
  excludeFromGroupTotal?: string;
}

export interface AttrDef {
  label: string;
  unit: string;
}

export interface MetricResult {
  value: number;
  sources: string[]; // entity ids that contributed
}

export interface MetricDef {
  id: string; // MET-<SECTOR>-nn
  sectorId: SectorId;
  name: string;
  theme: string; // e.g. "Production"
  unit: string;
  period: string; // reporting period label
  decimals: number;
  formula: string; // human readable
  compute: (entities: Entity[]) => MetricResult;
  status?: (value: number) => MetricStatus;
  thresholdNote?: string;
  assumptions: string[];
  additive: boolean; // true when the value may be summed across entities/sectors
}

export interface ChartSeries {
  name: string;
  values: number[];
}
export interface ChartData {
  categories: string[];
  series: ChartSeries[];
  sources: string[];
}
export interface ChartDef {
  id: string; // CHT-<SECTOR>-nn
  sectorId: SectorId;
  title: string;
  subtitle: string;
  kind: "bars" | "line";
  xLabel: string;
  yLabel: string;
  unit: string;
  decimals: number;
  refLine?: { value: number; label: string };
  yMin?: number;
  formula: string;
  build: (entities: Entity[], periods: string[]) => ChartData;
}

export interface Signal {
  id: string; // SIG-<SECTOR>-nn
  sectorId: SectorId;
  title: string;
  severity: Severity;
  summary: string;
  detectedAt: string; // YYYY-MM-DDTHH:mm (AST, Asia/Riyadh)
  metricId?: string;
  entityIds: string[];
  evidenceIds: string[];
  /** Primary seeded case. Null for signals raised in Stage 2 that have no case yet. Live links come from the store. */
  caseId: string | null;
  assumptions: string[];
}

export interface IntelligenceCase {
  id: string; // CAS-<SECTOR>-nn
  sectorId: SectorId;
  title: string;
  status: "Open" | "In analysis" | "Awaiting decision";
  owner: string;
  openedAt: string;
  summary: string;
  nextStep: string;
  signalIds: string[];
  decisionIds: string[];
  entityIds: string[];
  evidenceIds: string[];
  assumptions: string[];
  expertInputRequested: boolean;
}

export interface DecisionOption {
  label: string;
  effect: string;
}
export interface Decision {
  id: string; // DEC-<SECTOR>-nn
  sectorId: SectorId;
  title: string;
  summary: string;
  decisionType: string;
  amountSARm: number | null;
  /** commitment = new outlay (additive); reallocation = movement of existing capital (not additive); none = no amount */
  amountKind: "commitment" | "reallocation" | "none";
  amountNote: string;
  proposedBy: string;
  dueBy: string; // YYYY-MM-DD
  caseId: string;
  signalIds: string[];
  entityIds: string[];
  evidenceIds: string[];
  options: DecisionOption[];
  recommendation: string;
  assumptions: string[];
}

/** Readable fictional source content (Stage 2). Paragraphs are referenced as P1…Pn, table rows as T<k>R<n>. */
export type EvidenceBlock =
  | { type: "p"; text: string }
  | { type: "table"; caption: string; columns: string[]; rows: (string | number)[][] };
export interface EvidenceVersion {
  version: number;
  sourceDate: string; // YYYY-MM-DD
  changeNote: string;
  limitations: string[];
  blocks: EvidenceBlock[];
}

export interface Evidence {
  id: string; // EVD-<SECTOR>-nn
  sectorId: SectorId;
  title: string;
  kind: string;
  source: string; // fictional source system / author
  asOf: string; // source date of the current version
  summary: string;
  /** Entities the source is about. */
  entityIds?: string[];
  /** Readable content, oldest first. Absent = summary only (no readable source in this demonstration). */
  versions?: EvidenceVersion[];
}

export interface Activity {
  id: string; // ACT-<SECTOR>-nn
  sectorId: SectorId;
  at: string;
  actor: string;
  text: string;
  recordId?: string;
}

export interface Notification {
  id: string; // NTF-nn
  sectorId: SectorId;
  at: string;
  title: string;
  body: string;
  recordId?: string;
}

export interface Sector {
  id: SectorId;
  code: string; // 3-letter code used in record IDs
  name: string;
  short: string;
  entityName: string; // fictional institution entity
  descriptor: string; // e.g. "Energy & Oil"
  mandate: string;
  analyticalFocus: string[];
  periods: string[];
  periodsLabel: string; // axis label
  reportingPeriod: string; // headline reporting period
  asOf: string;
  attrs: Record<string, AttrDef>;
  capitalDefinition: string; // what "capital employed" means for this sector
  icon: string;
}

export interface SectorSeed {
  sector: Sector;
  entities: Entity[];
  metrics: MetricDef[];
  charts: ChartDef[];
  signals: Signal[];
  cases: IntelligenceCase[];
  decisions: Decision[];
  evidence: Evidence[];
  activity: Activity[];
}

export interface CrossLink {
  id: string; // XLK-nn
  fromEntityId: string;
  toEntityId: string;
  nature: string;
}
