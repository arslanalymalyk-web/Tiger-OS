// Creates (or re-invites) the platform administrator and prints a single-use invite link.
// Uses MIGRATE_DATABASE_URL (owner) because no application user exists yet.
//   PLATFORM_ADMIN_EMAIL=you@example.com npm run admin:create
import { Client } from "pg";
import { randomToken, sha256 } from "@/server/crypto";

export async function createPlatformAdmin(email: string, name = "Platform Admin"): Promise<string> {
  const url = process.env.MIGRATE_DATABASE_URL;
  if (!url) throw new Error("Set MIGRATE_DATABASE_URL (owner role)");
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const e = email.trim().toLowerCase();
    const u = await c.query(
      `insert into users (email, name, role, status, created_at) values ($1,$2,'platform_admin','invited', now())
       on conflict (lower(email)) do update set name = excluded.name returning id, role`, [e, name]);
    if (u.rows[0].role !== "platform_admin") throw new Error("That email belongs to a non-platform user");
    const token = randomToken();
    await c.query("update user_tokens set used_at = now() where user_id = $1 and kind = 'invite' and used_at is null", [u.rows[0].id]);
    await c.query("insert into user_tokens (user_id, kind, token_hash, expires_at, created_at) values ($1,'invite',$2, now() + interval '24 hours', now())", [u.rows[0].id, sha256(token)]);
    return token;
  } finally { await c.end(); }
}

if (process.argv[1]?.endsWith("create-platform-admin.ts")) {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  if (!email) { console.error("Set PLATFORM_ADMIN_EMAIL"); process.exit(1); }
  createPlatformAdmin(email).then((t) => console.log(`Invite link (valid 24h, single use): ${(process.env.APP_BASE_URL ?? "http://localhost:3000")}/app/invite/${t}`)).catch((e) => { console.error(e.message); process.exit(1); });
}
