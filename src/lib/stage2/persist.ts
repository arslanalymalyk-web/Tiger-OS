/** Versioned persistence, validation and migration of the local demonstration state. */
import type { Role, SectorId } from "../types";
import { NOTIFICATIONS, PEOPLE_BY_ID, SECTOR_BY_ID, isSectorId } from "@/data";
import { evidenceRefs, versionOf } from "@/data/stage2/blocks";
import { EVIDENCE_BY_ID, SIGNAL_BY_ID } from "./catalog";
import {
  CASE_STATUSES, FINDING_TYPES, HYP_KINDS, HYP_STATUSES, PRIORITIES, REVIEW_OUTCOMES, STANCES, TASK_STATUSES, emptyWork, type CaseAggregate, type WorkState,
} from "./types";

export const SCHEMA_VERSION = 2;
export const KEY_V2 = "tigeris.demo.v2";
export const KEY_V1 = "tigeris.demo.v1"; // Stage 1 key, migrated and then removed
export const ROLES: Role[] = ["Analyst", "Expert", "Approver"];

export interface UiState { sectorId: SectorId; role: Role; readIds: string[]; entered: boolean }
export const DEFAULT_UI: UiState = { sectorId: "energy", role: "Analyst", readIds: [], entered: false };
export interface Persisted { schemaVersion: 2; savedAt: string; ui: UiState; work: WorkState }

export type LoadResult =
  | { status: "empty" }
  | { status: "ok"; ui: UiState; work: WorkState; migrated?: string }
  | { status: "invalid"; reason: string; source: "v1" | "v2" };

class Invalid extends Error {}
const bad = (msg: string): never => { throw new Invalid(msg); };
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, what: string) => (typeof x === "string" ? x : bad(`${what} must be text`));
const arr = (x: unknown, what: string): unknown[] => (Array.isArray(x) ? x : bad(`${what} must be a list`));
const oneOf = <T extends string>(x: unknown, set: readonly T[], what: string): T => (set.includes(x as T) ? (x as T) : bad(`${what} has an unsupported value`));
const num = (x: unknown, what: string) => (typeof x === "number" && Number.isFinite(x) ? x : bad(`${what} must be a number`));

function validateUi(raw: unknown): UiState {
  if (!isObj(raw)) return bad("ui state is missing");
  const valid = new Set(NOTIFICATIONS.map((n) => n.id));
  const readIds = arr(raw.readIds, "readIds").filter((x): x is string => typeof x === "string");
  return {
    sectorId: typeof raw.sectorId === "string" && isSectorId(raw.sectorId) ? raw.sectorId : bad("sectorId is not a known sector"),
    role: oneOf(raw.role, ROLES, "role"),
    // Unknown (e.g. dynamic Stage 2) notification ids are kept; they are filtered against the live list at render time.
    readIds: readIds.filter((x) => valid.has(x) || x.startsWith("NTF-W-")),
    entered: raw.entered === true,
  };
}

function validateCase(key: string, raw: unknown): CaseAggregate {
  if (!isObj(raw)) return bad(`case ${key} is not an object`);
  const c = raw as Record<string, unknown>;
  const id = str(c.id, "case id");
  if (id !== key) bad(`case key ${key} does not match its id`);
  const sectorId = typeof c.sectorId === "string" && isSectorId(c.sectorId) ? c.sectorId : bad(`case ${id} has an unknown sector`);
  if (!new RegExp(`^CAS-${SECTOR_BY_ID[sectorId].sector.code}-\\d{2,}$`).test(id)) bad(`case id ${id} does not match its sector`);
  oneOf(c.origin, ["seed", "created"], `case ${id} origin`);
  str(c.title, `case ${id} title`); str(c.question, `case ${id} question`); str(c.summary, `case ${id} summary`);
  oneOf(c.status, CASE_STATUSES, `case ${id} status`); oneOf(c.priority, PRIORITIES, `case ${id} priority`);
  if (!PEOPLE_BY_ID[str(c.ownerId, "owner")]) bad(`case ${id} owner is unknown`);
  str(c.dueDate, "dueDate");
  for (const f of ["signalIds", "entityIds", "objectiveIds", "decisionIds"] as const) arr(c[f], `case ${id} ${f}`).forEach((x) => str(x, `${f} entry`));
  for (const s of c.signalIds as string[]) if (!SIGNAL_BY_ID[s]) bad(`case ${id} links unknown signal ${s}`);
  const hyps = arr(c.hypotheses, "hypotheses").map((h) => { if (!isObj(h)) return bad("hypothesis malformed"); str(h.id, "hypothesis id"); oneOf(h.kind, HYP_KINDS, "hypothesis kind"); oneOf(h.status, HYP_STATUSES, "hypothesis status"); str(h.statement, "statement"); num(h.rev, "hypothesis rev"); return h.id as string; });
  arr(c.links, "links").forEach((l) => {
    if (!isObj(l)) return bad("evidence link malformed");
    const ev = EVIDENCE_BY_ID[str(l.evidenceId, "evidenceId")];
    if (!ev) bad(`case ${id} links unknown evidence ${l.evidenceId}`);
    const v = versionOf(ev, num(l.version, "link version"));
    if (!v) bad(`evidence ${l.evidenceId} has no version ${l.version}`);
    oneOf(l.stance, STANCES, "link stance"); str(l.id, "link id");
    if (l.hypothesisId !== null && !hyps.includes(str(l.hypothesisId, "hypothesisId"))) bad(`link ${l.id} references an unknown hypothesis`);
    const valid = new Set(evidenceRefs(v!).map((r) => r.ref));
    arr(l.refs, "refs").forEach((r) => { if (!valid.has(str(r, "ref"))) bad(`link ${l.id} has an invalid reference ${r}`); });
    arr(l.history, "link history");
  });
  for (const f of ["assumptions", "missing", "questions"] as const) arr(c[f], f).forEach((n) => { if (!isObj(n)) bad("note malformed"); else { str(n.id, "note id"); str(n.text, "note text"); } });
  arr(c.tasks, "tasks").forEach((t) => { if (!isObj(t)) return bad("task malformed"); str(t.id, "task id"); oneOf(t.status, TASK_STATUSES, "task status"); if (!PEOPLE_BY_ID[str(t.assigneeId, "assignee")]) bad(`task ${t.id} assignee is unknown`); arr(t.evidenceIds, "task evidence"); });
  arr(c.reviews, "reviews").forEach((r) => {
    if (!isObj(r)) return bad("review malformed"); str(r.id, "review id");
    if (!PEOPLE_BY_ID[str(r.assigneeId, "assignee")]) bad(`review ${r.id} assignee is unknown`);
    const rounds = arr(r.rounds, "rounds"); if (!rounds.length) bad(`review ${r.id} has no rounds`);
    rounds.forEach((rd) => { if (!isObj(rd)) return bad("round malformed"); num(rd.round, "round"); if (rd.submission !== undefined) { const s = rd.submission; if (!isObj(s)) return bad("submission malformed"); oneOf(s.outcome, REVIEW_OUTCOMES, "outcome"); arr(s.findings, "findings").forEach((f) => { if (!isObj(f)) return bad("finding malformed"); str(f.id, "finding id"); oneOf(f.type, FINDING_TYPES, "finding type"); str(f.text, "finding text"); arr(f.citations, "citations"); }); } });
  });
  let last = 0;
  arr(c.briefs, "briefs").forEach((b) => { if (!isObj(b)) return bad("brief malformed"); const v = num(b.version, "brief version"); if (v <= last) bad(`case ${id} brief versions are not increasing`); last = v; if (!isObj(b.content) || !isObj(b.basis)) bad("brief content/basis missing"); arr((b.content as Record<string, unknown>).options, "brief options"); });
  arr(c.events, "events").forEach((e) => { if (!isObj(e)) bad("event malformed"); else { str(e.id, "event id"); str(e.at, "event time"); } });
  if (!isObj(c.seq)) bad(`case ${id} counters missing`);
  num(c.revision, "revision");
  return raw as unknown as CaseAggregate;
}

export function validateWork(raw: unknown): WorkState {
  if (!isObj(raw)) return bad("work state is missing");
  if (!isObj(raw.cases)) bad("cases map is missing");
  const cases: Record<string, CaseAggregate> = {};
  for (const [k, v] of Object.entries(raw.cases as Record<string, unknown>)) cases[k] = validateCase(k, v);
  const notifications = arr(raw.notifications, "notifications").map((n) => {
    if (!isObj(n)) return bad("notification malformed");
    str(n.id, "notification id"); str(n.title, "notification title"); str(n.at, "notification time");
    if (typeof n.sectorId !== "string" || !isSectorId(n.sectorId)) bad("notification sector is unknown");
    return n as unknown as WorkState["notifications"][number];
  });
  const counters = raw.counters;
  if (!isObj(counters) || !isObj(counters.case)) return bad("counters are missing");
  return { cases, notifications, counters: { case: counters.case as WorkState["counters"]["case"], notification: num(counters.notification, "notification counter") } };
}

export function serialize(ui: UiState, work: WorkState): string {
  const p: Persisted = { schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), ui, work };
  return JSON.stringify(p);
}
export const isDefaultState = (ui: UiState, work: WorkState) =>
  ui.sectorId === DEFAULT_UI.sectorId && ui.role === DEFAULT_UI.role && ui.readIds.length === 0 && !ui.entered &&
  Object.keys(work.cases).length === 0 && work.notifications.length === 0 && work.counters.notification === 0;

/** Parse saved text (either schema). Never throws; reports why it could not be used. */
export function parseSaved(text: string, source: "v1" | "v2"): LoadResult {
  try {
    const raw = JSON.parse(text) as unknown;
    if (!isObj(raw)) return { status: "invalid", reason: "The saved data is not an object.", source };
    if (source === "v2") {
      const v = raw.schemaVersion;
      if (v !== SCHEMA_VERSION) return { status: "invalid", reason: typeof v === "number" && v > SCHEMA_VERSION ? `It was saved by a newer version of the prototype (schema ${v}); this build supports schema ${SCHEMA_VERSION}.` : `Unsupported schema version ${String(v)}.`, source };
      return { status: "ok", ui: validateUi(raw.ui), work: validateWork(raw.work) };
    }
    // Stage 1 format: { sectorId, role, readIds, entered } without a schema version
    if ("schemaVersion" in raw) return { status: "invalid", reason: "Unexpected schema marker in the Stage 1 key.", source };
    const ui = validateUi(raw);
    return { status: "ok", ui, work: emptyWork(), migrated: `Your Stage 1 saved state (role ${ui.role}, sector ${SECTOR_BY_ID[ui.sectorId].sector.name}, ${ui.readIds.length} notification(s) read) was migrated to the Stage 2 format. Nothing was discarded.` };
  } catch (e) {
    return { status: "invalid", reason: e instanceof Invalid ? e.message : e instanceof SyntaxError ? "The saved data is not valid JSON." : "The saved data could not be read.", source };
  }
}

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export function loadPersisted(storage: StorageLike): LoadResult {
  let v2: string | null = null, v1: string | null = null;
  try { v2 = storage.getItem(KEY_V2); v1 = storage.getItem(KEY_V1); } catch { return { status: "empty" }; }
  if (v2 !== null) return parseSaved(v2, "v2");
  if (v1 !== null) return parseSaved(v1, "v1");
  return { status: "empty" };
}
export function clearPersisted(storage: StorageLike) {
  try { storage.removeItem(KEY_V2); storage.removeItem(KEY_V1); } catch { /* ignore */ }
}
