import { audit } from "./audit";
import { AppError, forbidden, type Actor } from "./actor";
import { decryptSecret, encryptSecret, hashPassword, newTotpSecret, passwordProblem, randomToken, sha256, totpUri, verifyPassword, verifyTotp } from "./crypto";
import { clock, withoutTenant, withTx, type Db } from "./db";
import { publicBaseUrl } from "./env";
import { flushOutbox, queueMail } from "./mail";
import { can, ROLES, type Role } from "./rbac";
import { tr } from "@/i18n";

const SESSION_ABSOLUTE_MS = 7 * 24 * 3600_000;
const SESSION_IDLE_MS = 8 * 3600_000;
const WINDOW_MS = 15 * 60_000;
const LIMITS = { email: 5, ip: 20, mfa: 6, reset: 5 };
const LOCK_MS = 15 * 60_000;

type UserRow = {
  id: string; company_id: string | null; email: string; name: string; role: Role; customer_id: string | null;
  password_hash: string | null; status: string; locale: "en" | "ar"; mfa_enabled: boolean; mfa_secret_enc: string | null;
  failed_logins: number; locked_until: Date | null;
};

const ctxOf = (u: { id: string; company_id: string | null }) => ({ companyId: u.company_id, userId: u.id, platform: u.company_id === null });

async function attemptsInWindow(db: Db, key: string): Promise<number> {
  const r = await db.one<{ n: string }>("select count(*) n from auth_attempts where key = $1 and at > $2", [key, new Date(clock.now().getTime() - WINDOW_MS)]);
  return Number(r!.n);
}
const recordAttempt = (db: Db, key: string) => db.q("insert into auth_attempts (key, at) values ($1,$2)", [key, clock.now()]);

async function loadActor(db: Db, userId: string): Promise<Actor | null> {
  const u = await db.one<UserRow>("select * from users where id = $1", [userId]);
  if (!u || u.status !== "active") return null;
  if (u.company_id) {
    const c = await db.one<{ status: string }>("select status from companies where id = $1", [u.company_id]);
    if (!c || c.status !== "active") return null;
  }
  const g = await db.q<{ kind: "site" | "contract"; ref_id: string }>("select kind, ref_id from user_access where user_id = $1", [u.id]);
  const sites = g.filter((x) => x.kind === "site").map((x) => x.ref_id);
  const contracts = g.filter((x) => x.kind === "contract").map((x) => x.ref_id);
  return {
    userId: u.id, companyId: u.company_id, role: u.role, customerId: u.customer_id, name: u.name, email: u.email, locale: u.locale,
    siteGrants: sites.length ? sites : null, contractGrants: contracts.length ? contracts : null,
  };
}

export type LoginResult =
  | { ok: true; token: string; mfaRequired: boolean }
  | { ok: false; code: "invalid_credentials" | "rate_limited" | "locked" };

export async function login(email: string, password: string, meta: { ip?: string | null; ua?: string | null } = {}): Promise<LoginResult> {
  const e = email.trim().toLowerCase();
  const ip = meta.ip ?? "unknown";
  const limited = await withoutTenant(async (db) => (await attemptsInWindow(db, `login:email:${e}`)) >= LIMITS.email || (await attemptsInWindow(db, `login:ip:${ip}`)) >= LIMITS.ip);
  if (limited) return { ok: false, code: "rate_limited" };

  const u = await withoutTenant((db) => db.one<UserRow>("select * from auth_find_user($1)", [e]));
  const passwordOk = await verifyPassword(password, u?.password_hash ?? null);
  const now = clock.now();

  if (!u || !passwordOk || u.status !== "active") {
    await withoutTenant(async (db) => { await recordAttempt(db, `login:email:${e}`); await recordAttempt(db, `login:ip:${ip}`); });
    if (u) {
      await withTx(ctxOf(u), async (db) => {
        const fails = u.failed_logins + 1;
        const lock = fails >= LIMITS.email ? new Date(now.getTime() + LOCK_MS) : null;
        await db.q("update users set failed_logins = $2, locked_until = coalesce($3, locked_until) where id = $1", [u.id, fails, lock]);
        await audit(db, { action: "auth.login_failed", actorId: u.id, entityType: "user", entityId: u.id, detail: { reason: !passwordOk ? "bad_password" : "inactive", locked: !!lock }, ip });
      });
    }
    return { ok: false, code: "invalid_credentials" };
  }
  if (u.locked_until && u.locked_until > now) return { ok: false, code: "locked" };

  const token = randomToken();
  await withTx(ctxOf(u), async (db) => {
    await db.q(
      `insert into sessions (user_id, company_id, token_hash, created_at, last_seen_at, expires_at, idle_expires_at, mfa_verified, ip, user_agent)
       values ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9)`,
      [u.id, u.company_id, sha256(token), now, new Date(now.getTime() + SESSION_ABSOLUTE_MS), new Date(now.getTime() + SESSION_IDLE_MS), !u.mfa_enabled, ip, (meta.ua ?? "").slice(0, 300)]);
    await db.q("update users set failed_logins = 0, locked_until = null, last_login_at = $2 where id = $1", [u.id, now]);
    await audit(db, { action: "auth.login_success", actorId: u.id, entityType: "user", entityId: u.id, detail: { mfaPending: u.mfa_enabled }, ip });
  });
  return { ok: true, token, mfaRequired: u.mfa_enabled };
}

export type SessionInfo = { actor: Actor; sessionId: string; mfaVerified: boolean; mfaEnabled: boolean };

/** Resolves a cookie token to an Actor, enforcing absolute + idle expiry, revocation, user and company status. */
export async function resolveSession(token: string | undefined | null): Promise<SessionInfo | null> {
  if (!token || token.length > 200) return null;
  const now = clock.now();
  const s = await withoutTenant((db) => db.one<{ id: string; user_id: string; company_id: string | null; expires_at: Date; idle_expires_at: Date; revoked_at: Date | null; mfa_verified: boolean; last_seen_at: Date }>(
    "select id, user_id, company_id, expires_at, idle_expires_at, revoked_at, mfa_verified, last_seen_at from sessions where token_hash = $1", [sha256(token)]));
  if (!s || s.revoked_at || s.expires_at <= now || s.idle_expires_at <= now) return null;
  const out = await withTx({ companyId: s.company_id, userId: s.user_id, platform: s.company_id === null }, async (db) => {
    const actor = await loadActor(db, s.user_id);
    if (!actor) return null;
    const u = await db.one<{ mfa_enabled: boolean }>("select mfa_enabled from users where id = $1", [s.user_id]);
    return { actor, mfaEnabled: u!.mfa_enabled };
  });
  if (!out) return null;
  if (now.getTime() - s.last_seen_at.getTime() > 60_000)
    await withoutTenant((db) => db.q("update sessions set last_seen_at = $2, idle_expires_at = $3 where id = $1", [s.id, now, new Date(now.getTime() + SESSION_IDLE_MS)]));
  return { actor: out.actor, sessionId: s.id, mfaVerified: s.mfa_verified, mfaEnabled: out.mfaEnabled };
}

export async function logout(token: string): Promise<void> {
  const s = await resolveSession(token);
  await withoutTenant((db) => db.q("update sessions set revoked_at = $2 where token_hash = $1 and revoked_at is null", [sha256(token), clock.now()]));
  if (s) await withTx(ctxOf({ id: s.actor.userId, company_id: s.actor.companyId }), (db) => audit(db, { action: "auth.logout", actorId: s.actor.userId, entityType: "user", entityId: s.actor.userId }));
}

export async function revokeUserSessions(db: Db, userId: string): Promise<void> {
  await db.q("update sessions set revoked_at = $2 where user_id = $1 and revoked_at is null", [userId, clock.now()]);
}

export async function listSessions(actor: Actor) {
  return withTx({ companyId: actor.companyId, userId: actor.userId, platform: actor.companyId === null }, (db) =>
    db.q<{ id: string; created_at: Date; last_seen_at: Date; ip: string | null; user_agent: string | null }>(
      "select id, created_at, last_seen_at, ip, user_agent from sessions where user_id = $1 and revoked_at is null and expires_at > $2 order by last_seen_at desc", [actor.userId, clock.now()]));
}
export async function revokeSession(actor: Actor, sessionId: string): Promise<void> {
  await withTx({ companyId: actor.companyId, userId: actor.userId, platform: actor.companyId === null }, async (db) => {
    const r = await db.q("update sessions set revoked_at = $3 where id = $1 and user_id = $2 and revoked_at is null returning id", [sessionId, actor.userId, clock.now()]);
    if (r.length) await audit(db, { action: "auth.session_revoked", actorId: actor.userId, entityType: "session", entityId: sessionId });
  });
}

// ── MFA ──
export async function verifyMfaForSession(token: string, code: string, ip?: string | null): Promise<boolean> {
  const s = await resolveSession(token);
  if (!s || !s.mfaEnabled) return false;
  const key = `mfa:${s.actor.userId}`;
  if (await withoutTenant((db) => attemptsInWindow(db, key)) >= LIMITS.mfa) return false;
  const ctx = { companyId: s.actor.companyId, userId: s.actor.userId, platform: s.actor.companyId === null };
  const u = await withTx(ctx, (db) => db.one<{ mfa_secret_enc: string }>("select mfa_secret_enc from users where id = $1", [s.actor.userId]));
  const ok = !!u?.mfa_secret_enc && verifyTotp(decryptSecret(u.mfa_secret_enc), code.trim(), clock.now().getTime());
  if (!ok) { await withoutTenant((db) => recordAttempt(db, key)); return false; }
  await withoutTenant((db) => db.q("update sessions set mfa_verified = true where token_hash = $1", [sha256(token)]));
  await withTx(ctx, (db) => audit(db, { action: "auth.mfa_verified", actorId: s.actor.userId, entityType: "user", entityId: s.actor.userId, ip }));
  return true;
}

export async function beginMfaEnrollment(actor: Actor): Promise<{ secret: string; uri: string }> {
  const secret = newTotpSecret();
  await withTx({ companyId: actor.companyId, userId: actor.userId, platform: actor.companyId === null }, (db) =>
    db.q("update users set mfa_secret_enc = $2 where id = $1 and mfa_enabled = false", [actor.userId, encryptSecret(secret)]));
  return { secret, uri: totpUri(secret, actor.email) };
}
export async function confirmMfaEnrollment(actor: Actor, code: string): Promise<boolean> {
  return withTx({ companyId: actor.companyId, userId: actor.userId, platform: actor.companyId === null }, async (db) => {
    const u = await db.one<{ mfa_secret_enc: string | null; mfa_enabled: boolean }>("select mfa_secret_enc, mfa_enabled from users where id = $1", [actor.userId]);
    if (!u?.mfa_secret_enc || u.mfa_enabled || !verifyTotp(decryptSecret(u.mfa_secret_enc), code.trim(), clock.now().getTime())) return false;
    await db.q("update users set mfa_enabled = true where id = $1", [actor.userId]);
    await audit(db, { action: "auth.mfa_enabled", actorId: actor.userId, entityType: "user", entityId: actor.userId });
    return true;
  });
}
export async function disableMfa(actor: Actor, password: string): Promise<boolean> {
  return withTx({ companyId: actor.companyId, userId: actor.userId, platform: actor.companyId === null }, async (db) => {
    const u = await db.one<UserRow>("select * from users where id = $1", [actor.userId]);
    if (!u || !(await verifyPassword(password, u.password_hash))) return false;
    await db.q("update users set mfa_enabled = false, mfa_secret_enc = null where id = $1", [actor.userId]);
    await audit(db, { action: "auth.mfa_disabled", actorId: actor.userId, entityType: "user", entityId: actor.userId });
    return true;
  });
}

// ── invites & password reset (single-use, hashed, expiring tokens) ──
async function issueToken(db: Db, userId: string, kind: "invite" | "reset", ttlMs: number): Promise<string> {
  const token = randomToken();
  const now = clock.now();
  await db.q("update user_tokens set used_at = $3 where user_id = $1 and kind = $2 and used_at is null", [userId, kind, now]);
  await db.q("insert into user_tokens (user_id, kind, token_hash, expires_at, created_at) values ($1,$2,$3,$4,$5)", [userId, kind, sha256(token), new Date(now.getTime() + ttlMs), now]);
  return token;
}

export async function requestPasswordReset(email: string, ip?: string | null): Promise<void> {
  const e = email.trim().toLowerCase();
  const blocked = await withoutTenant(async (db) => {
    if ((await attemptsInWindow(db, `reset:${e}`)) >= LIMITS.reset || (await attemptsInWindow(db, `reset-ip:${ip ?? "unknown"}`)) >= LIMITS.ip) return true;
    await recordAttempt(db, `reset:${e}`); await recordAttempt(db, `reset-ip:${ip ?? "unknown"}`);
    return false;
  });
  if (blocked) return; // same response either way: no account enumeration
  const u = await withoutTenant((db) => db.one<UserRow>("select * from auth_find_user($1)", [e]));
  if (!u || u.status !== "active") return;
  await withTx(ctxOf(u), async (db) => {
    const token = await issueToken(db, u.id, "reset", 3600_000);
    const link = `${publicBaseUrl()}/app/reset/${token}`;
    await queueMail(db, { companyId: u.company_id, userId: u.id, to: u.email, sensitive: true,
      subject: tr(u.locale, "mail.reset.subject"), body: tr(u.locale, "mail.reset.body", { name: u.name, link }) });
    await audit(db, { action: "auth.password_reset_requested", actorId: u.id, entityType: "user", entityId: u.id, ip });
  });
  await flushOutbox(u.company_id);
}

export async function inspectToken(token: string, kind: "invite" | "reset"): Promise<{ valid: boolean; name?: string }> {
  const t = await withoutTenant((db) => db.one<{ user_id: string; company_id: string | null; expires_at: Date; used_at: Date | null }>("select * from auth_find_user_by_token($1,$2)", [sha256(token), kind]));
  if (!t || t.used_at || t.expires_at <= clock.now()) return { valid: false };
  const u = await withTx({ companyId: t.company_id, userId: t.user_id, platform: t.company_id === null }, (db) => db.one<{ name: string }>("select name from users where id = $1", [t.user_id]));
  return { valid: true, name: u?.name };
}

export async function consumeToken(token: string, kind: "invite" | "reset", newPassword: string, ip?: string | null): Promise<{ ok: true } | { ok: false; code: string }> {
  const prob = passwordProblem(newPassword);
  if (prob) return { ok: false, code: prob };
  const t = await withoutTenant((db) => db.one<{ token_id: string; user_id: string; company_id: string | null; expires_at: Date; used_at: Date | null }>("select * from auth_find_user_by_token($1,$2)", [sha256(token), kind]));
  if (!t || t.used_at || t.expires_at <= clock.now()) return { ok: false, code: "token_invalid" };
  const hash = await hashPassword(newPassword);
  return withTx({ companyId: t.company_id, userId: t.user_id, platform: t.company_id === null }, async (db) => {
    const used = await db.q("update user_tokens set used_at = $2 where id = $1 and used_at is null returning id", [t.token_id, clock.now()]);
    if (!used.length) return { ok: false as const, code: "token_invalid" };
    const u = await db.one<{ status: string }>("select status from users where id = $1", [t.user_id]);
    if (!u || u.status === "deactivated") return { ok: false as const, code: "token_invalid" };
    await db.q("update users set password_hash = $2, status = 'active', failed_logins = 0, locked_until = null where id = $1", [t.user_id, hash]);
    await revokeUserSessions(db, t.user_id);
    await audit(db, { action: kind === "invite" ? "auth.invite_accepted" : "auth.password_reset_completed", actorId: t.user_id, entityType: "user", entityId: t.user_id, ip });
    return { ok: true as const };
  });
}

export async function changePassword(actor: Actor, current: string, next: string): Promise<{ ok: true } | { ok: false; code: string }> {
  const prob = passwordProblem(next);
  if (prob) return { ok: false, code: prob };
  return withTx({ companyId: actor.companyId, userId: actor.userId, platform: actor.companyId === null }, async (db) => {
    const u = await db.one<UserRow>("select * from users where id = $1", [actor.userId]);
    if (!u || !(await verifyPassword(current, u.password_hash))) return { ok: false as const, code: "invalid_credentials" };
    await db.q("update users set password_hash = $2 where id = $1", [actor.userId, await hashPassword(next)]);
    await revokeUserSessions(db, actor.userId);
    await audit(db, { action: "auth.password_changed", actorId: actor.userId, entityType: "user", entityId: actor.userId });
    return { ok: true as const };
  });
}

// ── user administration ──
export type InviteInput = { email: string; name: string; role: Role; customerId?: string | null; siteIds?: string[] };

export async function inviteUser(actor: Actor, input: InviteInput, ip?: string | null): Promise<{ userId: string; token: string }> {
  if (!actor.companyId || !can(actor.role, "user.manage")) throw forbidden();
  if (!ROLES.includes(input.role) || input.role === "platform_admin") throw new AppError("invalid_role");
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new AppError("invalid_email");
  if (!input.name.trim()) throw new AppError("name_required");
  if ((input.role === "customer_approver") !== Boolean(input.customerId)) throw new AppError("customer_required");
  const out = await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    if (input.customerId && !(await db.one("select 1 from customers where id = $1 and company_id = $2", [input.customerId, actor.companyId])))
      throw new AppError("not_found", 404);
    const company = await db.one<{ default_locale: "en" | "ar" }>("select default_locale from companies where id = $1", [actor.companyId]);
    let u: { id: string };
    try {
      u = (await db.one<{ id: string }>("insert into users (company_id, email, name, role, customer_id, status, locale, created_at) values ($1,$2,$3,$4,$5,'invited',$6,$7) returning id",
        [actor.companyId, email, input.name.trim(), input.role, input.customerId ?? null, company!.default_locale, clock.now()]))!;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new AppError("email_taken", 409);
      throw e;
    }
    for (const siteId of input.siteIds ?? []) {
      if (!(await db.one("select 1 from sites where id = $1", [siteId]))) throw new AppError("not_found", 404);
      await db.q("insert into user_access (company_id, user_id, kind, ref_id) values ($1,$2,'site',$3)", [actor.companyId, u.id, siteId]);
    }
    const token = await issueToken(db, u.id, "invite", 72 * 3600_000);
    await queueMail(db, { companyId: actor.companyId, userId: u.id, to: email, sensitive: true,
      subject: tr(company!.default_locale, "mail.invite.subject"),
      body: tr(company!.default_locale, "mail.invite.body", { name: input.name.trim(), inviter: actor.name, link: `${publicBaseUrl()}/app/invite/${token}` }) });
    await audit(db, { action: "user.invited", actorId: actor.userId, entityType: "user", entityId: u.id, detail: { role: input.role, email, customerId: input.customerId ?? null, siteIds: input.siteIds ?? [] }, ip });
    return { userId: u.id, token };
  });
  await flushOutbox(actor.companyId);
  return out;
}

export async function deactivateUser(actor: Actor, userId: string, ip?: string | null): Promise<void> {
  if (!actor.companyId || !can(actor.role, "user.manage")) throw forbidden();
  if (userId === actor.userId) throw new AppError("cannot_deactivate_self");
  await withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const u = await db.one<{ id: string; role: Role }>("select id, role from users where id = $1 and company_id = $2", [userId, actor.companyId]);
    if (!u) throw new AppError("not_found", 404);
    await db.q("update users set status = 'deactivated', deactivated_at = $2 where id = $1", [userId, clock.now()]);
    await revokeUserSessions(db, userId);
    await audit(db, { action: "user.deactivated", actorId: actor.userId, entityType: "user", entityId: userId, ip });
  });
}

export async function listUsers(actor: Actor) {
  if (!actor.companyId || !can(actor.role, "user.manage")) throw forbidden();
  return withTx({ companyId: actor.companyId, userId: actor.userId }, (db) =>
    db.q<{ id: string; name: string; email: string; role: Role; status: string; mfa_enabled: boolean; last_login_at: Date | null; customer_name: string | null }>(
      `select u.id, u.name, u.email, u.role, u.status, u.mfa_enabled, u.last_login_at, c.name customer_name
         from users u left join customers c on c.id = u.customer_id where u.company_id = $1 order by u.created_at`, [actor.companyId]));
}

export async function setLocale(actor: Actor, locale: "en" | "ar") {
  await withTx({ companyId: actor.companyId, userId: actor.userId, platform: actor.companyId === null }, (db) => db.q("update users set locale = $2 where id = $1", [actor.userId, locale]));
}
