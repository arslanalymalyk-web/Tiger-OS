import { tr } from "@/i18n";
import { clock, type Db } from "./db";
import { publicBaseUrl } from "./env";
import { queueMail } from "./mail";
import { RECIPIENT_SQL } from "./scope";

export type Recipient = { id: string; email: string; name: string; locale: "en" | "ar" };
export type CaseRef = { id: string; company_id: string; number: number | string; title: string; site_id: string; contract_id: string | null; customer_id: string };

export async function recipientsFor(db: Db, c: CaseRef, roles: string[], opts: { customer?: boolean } = {}): Promise<Recipient[]> {
  return db.q<Recipient>(RECIPIENT_SQL, [c.company_id, roles, opts.customer ? c.customer_id : null, c.site_id, c.contract_id]);
}

const EMAILED = new Set(["assigned", "info_requested", "submitted", "approval_requested", "approval_reminder", "approval_decided", "customer_message", "work_completed"]);

/** In-app notification for each recipient (excluding the actor) plus a queued email for key kinds. */
export async function notify(db: Db, to: Recipient[], actorId: string, kind: string, c: CaseRef, extra: Record<string, unknown> = {}) {
  const seen = new Set<string>();
  for (const r of to) {
    if (r.id === actorId || seen.has(r.id)) continue;
    seen.add(r.id);
    const params = { number: Number(c.number), title: c.title, ...extra };
    await db.q("insert into notifications (company_id, user_id, kind, case_id, params, created_at) values ($1,$2,$3,$4,$5,$6)", [c.company_id, r.id, kind, c.id, params, clock.now()]);
    if (EMAILED.has(kind)) {
      const text = tr(r.locale, `notif.${kind}`, params as Record<string, string | number>);
      await queueMail(db, { companyId: c.company_id, userId: r.id, to: r.email, subject: text, body: `${text}\n\n${publicBaseUrl()}/app/cases/${c.id}` });
    }
  }
}
