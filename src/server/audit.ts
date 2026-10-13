import { createHash } from "node:crypto";
import { clock, type Db } from "./db";

export type AuditInput = {
  action: string;
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  detail?: Record<string, unknown>;
  ip?: string | null;
};

const GENESIS = "0".repeat(64);

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
export const entryHash = (prev: string, e: { chain: string; seq: number; at: string; actorId: string | null; action: string; entityType: string | null; entityId: string | null; detail: unknown }) =>
  createHash("sha256").update(prev).update("|").update(canonical(e)).digest("hex");

/** Appends to the company's hash chain. Must be called inside the same transaction as the change it records. */
export async function audit(db: Db, a: AuditInput): Promise<void> {
  const chain = db.companyId ?? "platform";
  await db.q("select pg_advisory_xact_lock(hashtext($1))", [chain]);
  const last = await db.one<{ seq: string; hash: string }>("select seq, hash from audit_log where chain = $1 order by seq desc limit 1", [chain]);
  const seq = last ? Number(last.seq) + 1 : 1;
  const prev = last?.hash ?? GENESIS;
  const at = clock.now();
  const detail = JSON.parse(JSON.stringify(a.detail ?? {}));
  const hash = entryHash(prev, { chain, seq, at: at.toISOString(), actorId: a.actorId ?? null, action: a.action, entityType: a.entityType ?? null, entityId: a.entityId ?? null, detail });
  await db.q(
    `insert into audit_log (chain, company_id, seq, at, actor_id, action, entity_type, entity_id, detail, ip, prev_hash, hash)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [chain, db.companyId, seq, at, a.actorId ?? null, a.action, a.entityType ?? null, a.entityId ?? null, detail, a.ip ?? null, prev, hash],
  );
}

export type ChainVerdict = { ok: boolean; checked: number; brokenAtSeq?: number; reason?: string };

export async function verifyChain(db: Db): Promise<ChainVerdict> {
  const chain = db.companyId ?? "platform";
  const rows = await db.q<{ seq: string; at: Date; actor_id: string | null; action: string; entity_type: string | null; entity_id: string | null; detail: unknown; prev_hash: string; hash: string }>(
    "select seq, at, actor_id, action, entity_type, entity_id, detail, prev_hash, hash from audit_log where chain = $1 order by seq", [chain]);
  let prev = GENESIS, expectSeq = 1;
  for (const r of rows) {
    const seq = Number(r.seq);
    if (seq !== expectSeq) return { ok: false, checked: expectSeq - 1, brokenAtSeq: expectSeq, reason: "missing_entry" };
    if (r.prev_hash !== prev) return { ok: false, checked: seq - 1, brokenAtSeq: seq, reason: "prev_hash_mismatch" };
    const h = entryHash(prev, { chain, seq, at: r.at.toISOString(), actorId: r.actor_id, action: r.action, entityType: r.entity_type, entityId: r.entity_id, detail: r.detail });
    if (h !== r.hash) return { ok: false, checked: seq - 1, brokenAtSeq: seq, reason: "hash_mismatch" };
    prev = r.hash; expectSeq++;
  }
  return { ok: true, checked: rows.length };
}
