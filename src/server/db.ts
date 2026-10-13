import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { databaseUrl } from "./env";

// Single pool per process (survives Next dev HMR).
const g = globalThis as unknown as { __pool?: Pool };
export function pool(): Pool {
  if (!g.__pool) g.__pool = new Pool({ connectionString: databaseUrl(), max: 10, idleTimeoutMillis: 30_000 });
  return g.__pool;
}
export async function closePool() {
  if (g.__pool) { await g.__pool.end(); g.__pool = undefined; }
}

/** Injectable clock so timestamps and durations are testable. Server time is authoritative. */
export const clock = { now: () => new Date() };

export type Db = {
  q<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T | undefined>;
  companyId: string | null;
  userId: string | null;
};

export type TxOptions = { companyId?: string | null; userId?: string | null; platform?: boolean };

/**
 * Runs fn in a transaction with the tenant context set. Row-level security reads these
 * settings, so a query that forgets its company_id filter still cannot cross tenants.
 */
export async function withTx<T>(opts: TxOptions, fn: (db: Db) => Promise<T>): Promise<T> {
  const c: PoolClient = await pool().connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.company_id', $1, true), set_config('app.user_id', $2, true), set_config('app.platform', $3, true)", [
      opts.companyId ?? "", opts.userId ?? "", opts.platform ? "1" : "",
    ]);
    // A pg client runs one query at a time; serialise so concurrent calls (Promise.all) queue instead of overlapping.
    let tail: Promise<unknown> = Promise.resolve();
    const serial = <T,>(f: () => Promise<T>): Promise<T> => { const r = tail.then(f, f); tail = r.catch(() => undefined); return r; };
    const db: Db = {
      companyId: opts.companyId ?? null,
      userId: opts.userId ?? null,
      q: (sql, params) => serial(async () => (await c.query(sql, params as unknown[])).rows),
      one: (sql, params) => serial(async () => (await c.query(sql, params as unknown[])).rows[0]),
    };
    const out = await fn(db);
    await c.query("commit");
    return out;
  } catch (e) {
    try { await c.query("rollback"); } catch { /* connection already gone */ }
    throw e;
  } finally {
    c.release();
  }
}

/** For pre-authentication queries on tables without tenant RLS (sessions, tokens, attempts). */
export const withoutTenant = <T>(fn: (db: Db) => Promise<T>) => withTx({}, fn);
