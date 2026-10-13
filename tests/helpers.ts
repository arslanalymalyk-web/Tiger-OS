process.env.APP_ENV = "test";
process.env.MIGRATE_DATABASE_URL ??= "postgresql://trace_owner:owner_dev_pw@localhost:5432/tracetest";
process.env.DATABASE_URL ??= "postgresql://trace_app:app_dev_pw@localhost:5432/tracetest";
process.env.UPLOAD_DIR = ".data/test-uploads";

import { Client } from "pg";
import { migrate } from "../scripts/migrate";
import type { Actor } from "@/server/actor";
import { resolveSession, login, consumeToken } from "@/server/auth";
import { clock } from "@/server/db";
import { createCompany } from "@/server/platform";
import { inviteUser } from "@/server/auth";
import { createCustomer, createSite, createAsset, createContract } from "@/server/master";
import type { Role } from "@/server/rbac";

export const PASSWORD = "correct horse battery";

export async function resetDb() {
  const c = new Client({ connectionString: process.env.MIGRATE_DATABASE_URL });
  await c.connect();
  await c.query("drop schema public cascade; create schema public;");
  await c.end();
  await migrate(process.env.MIGRATE_DATABASE_URL);
}
export async function ownerSql(sql: string, params: unknown[] = []) {
  const c = new Client({ connectionString: process.env.MIGRATE_DATABASE_URL });
  await c.connect();
  try { return (await c.query(sql, params)).rows; } finally { await c.end(); }
}

export function freezeClock(iso: string) {
  let t = new Date(iso).getTime();
  clock.now = () => new Date(t);
  return { set: (i: string) => { t = new Date(i).getTime(); }, advance: (ms: number) => { t += ms; } };
}

async function actorFor(email: string): Promise<Actor> {
  const r = await login(email, PASSWORD, { ip: "test" });
  if (!r.ok) throw new Error("login failed in helper: " + r.code);
  const s = await resolveSession(r.token);
  return s!.actor;
}

export async function platformAdmin(): Promise<Actor> {
  await ownerSql("insert into users (email, name, role, status, created_at, password_hash) values ('root@platform.test','Root','platform_admin','invited', now(), null) on conflict do nothing");
  // set a password through the normal token path
  const { randomToken, sha256 } = await import("@/server/crypto");
  const token = randomToken();
  await ownerSql("insert into user_tokens (user_id, kind, token_hash, expires_at, created_at) select id,'invite',$1, now() + interval '1 day', now() from users where email='root@platform.test'", [sha256(token)]);
  const r = await consumeToken(token, "invite", PASSWORD);
  if (!r.ok) throw new Error(r.code);
  return actorFor("root@platform.test");
}

/** Creates a company via the real platform flow, accepts the admin invite, and returns the admin. */
export async function makeCompany(plat: Actor, slug: string) {
  const { companyId, token } = await createCompany(plat, { name: `Co ${slug}`, slug, adminEmail: `admin@${slug}.test`, adminName: `Admin ${slug}`, locale: "en" });
  const r = await consumeToken(token, "invite", PASSWORD);
  if (!r.ok) throw new Error(r.code);
  const admin = await actorFor(`admin@${slug}.test`);
  return { companyId, admin };
}

export async function addUser(admin: Actor, slug: string, role: Role, key: string, extra: { customerId?: string; siteIds?: string[] } = {}) {
  const { token } = await inviteUser(admin, { email: `${key}@${slug}.test`, name: `${key} ${slug}`, role, customerId: extra.customerId, siteIds: extra.siteIds });
  const r = await consumeToken(token, "invite", PASSWORD);
  if (!r.ok) throw new Error(r.code);
  return actorFor(`${key}@${slug}.test`);
}

/** A full tenant: staff of every role, one customer with an approver, a site, and an asset. */
export async function makeWorld(plat: Actor, slug: string) {
  const { companyId, admin } = await makeCompany(plat, slug);
  const customerId = await createCustomer(admin, { name: `Customer ${slug}` });
  const contractId = await createContract(admin, { customerId, reference: `C-${slug}`, name: "Maintenance" });
  const siteId = await createSite(admin, { customerId, contractId, name: `Tower ${slug}` });
  const assetId = await createAsset(admin, { siteId, tag: `FP-${slug}-001`, name: "Fire pump", assetType: "Fire pump", discipline: "fire_protection", criticality: "critical" });
  const ops = await addUser(admin, slug, "operations_manager", "ops");
  const eng = await addUser(admin, slug, "engineer", "eng");
  const tech = await addUser(admin, slug, "field_technician", "tech");
  const tech2 = await addUser(admin, slug, "field_technician", "tech2");
  const auditor = await addUser(admin, slug, "auditor", "auditor");
  const cust = await addUser(admin, slug, "customer_approver", "cust", { customerId });
  return { companyId, admin, ops, eng, tech, tech2, auditor, cust, customerId, contractId, siteId, assetId };
}

export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake-png-body-for-tests")]);
