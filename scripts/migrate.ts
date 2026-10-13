// Applies db/migrations/*.sql in order using MIGRATE_DATABASE_URL (owner role), falling back to DATABASE_URL.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

export async function migrate(url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL) {
  if (!url) throw new Error("Set MIGRATE_DATABASE_URL (owner role) or DATABASE_URL");
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    const done = new Set((await c.query("select name from schema_migrations")).rows.map((r) => r.name));
    const dir = join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      if (done.has(f)) continue;
      await c.query("begin");
      try {
        await c.query(readFileSync(join(dir, f), "utf8"));
        await c.query("insert into schema_migrations(name) values ($1)", [f]);
        await c.query("commit");
        console.log(`applied ${f}`);
      } catch (e) { await c.query("rollback"); throw e; }
    }
  } finally { await c.end(); }
}

if (process.argv[1]?.endsWith("migrate.ts")) migrate().catch((e) => { console.error(e.message); process.exit(1); });
