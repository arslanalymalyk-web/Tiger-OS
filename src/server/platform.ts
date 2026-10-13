import { z } from "zod";
import { AppError, forbidden, type Actor } from "./actor";
import { audit } from "./audit";
import { randomToken, sha256 } from "./crypto";
import { clock, withTx } from "./db";
import { publicBaseUrl } from "./env";
import { flushOutbox, queueMail } from "./mail";
import { tr } from "@/i18n";

export const DEFAULT_SLA = { urgent: [60, 480], high: [240, 1440], medium: [480, 4320], low: [1440, 10080] } as const; // minutes: [response, resolution]

const Input = z.object({
  name: z.string().trim().min(1).max(200), slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
  adminEmail: z.string().email(), adminName: z.string().trim().min(1).max(200), locale: z.enum(["en", "ar"]).default("en"),
});

/** Platform admin creates a tenant and invites its first company admin. No tenant data is read or exposed. */
export async function createCompany(actor: Actor, raw: z.input<typeof Input>): Promise<{ companyId: string; token: string }> {
  if (actor.role !== "platform_admin") throw forbidden();
  const i = Input.parse(raw);
  const out = await withTx({ platform: true, userId: actor.userId }, async (db) => {
    const now = clock.now();
    let company: { id: string };
    try {
      company = (await db.one<{ id: string }>("insert into companies (name, slug, default_locale, created_at) values ($1,$2,$3,$4) returning id", [i.name, i.slug, i.locale, now]))!;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new AppError("slug_taken", 409);
      throw e;
    }
    // Switch the transaction to the new tenant for the tenant-scoped inserts.
    await db.q("select set_config('app.company_id', $1, true)", [company.id]);
    const tdb = { ...db, companyId: company.id };
    for (const [p, [resp, resol]] of Object.entries(DEFAULT_SLA))
      await db.q("insert into sla_policies (company_id, priority, response_minutes, resolution_minutes) values ($1,$2,$3,$4)", [company.id, p, resp, resol]);
    const email = i.adminEmail.trim().toLowerCase();
    let u: { id: string };
    try {
      u = (await db.one<{ id: string }>("insert into users (company_id, email, name, role, status, locale, created_at) values ($1,$2,$3,'company_admin','invited',$4,$5) returning id", [company.id, email, i.adminName, i.locale, now]))!;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new AppError("email_taken", 409);
      throw e;
    }
    const token = randomToken();
    await db.q("insert into user_tokens (user_id, kind, token_hash, expires_at, created_at) values ($1,'invite',$2,$3,$4)", [u.id, sha256(token), new Date(now.getTime() + 72 * 3600_000), now]);
    await queueMail(tdb, { companyId: company.id, userId: u.id, to: email, sensitive: true, subject: tr(i.locale, "mail.invite.subject"),
      body: tr(i.locale, "mail.invite.body", { name: i.adminName, inviter: "ServiceTrace", link: `${publicBaseUrl()}/app/invite/${token}` }) });
    await audit(tdb, { action: "company.created", actorId: actor.userId, entityType: "company", entityId: company.id, detail: { name: i.name, slug: i.slug, firstAdmin: email } });
    return { companyId: company.id, token };
  });
  await flushOutbox(out.companyId);
  return out;
}

export async function listCompanies(actor: Actor) {
  if (actor.role !== "platform_admin") throw forbidden();
  // Names and status only: platform administration never reads tenant case data.
  return withTx({ platform: true, userId: actor.userId }, (db) => db.q<{ id: string; name: string; slug: string; status: string; created_at: Date }>("select id, name, slug, status, created_at from companies order by created_at"));
}
