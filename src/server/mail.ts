import nodemailer, { type Transporter } from "nodemailer";
import { clock, withTx, type Db } from "./db";
import { isProdLike, mailConfigured } from "./env";
import { log } from "./log";

export type MailInput = { companyId: string | null; userId?: string | null; to: string; subject: string; body: string; sensitive?: boolean };

/** Queues an email. Sending happens after commit via flushOutbox(); nothing is sent inside a transaction. */
export async function queueMail(db: Db, m: MailInput): Promise<string> {
  // If no mail transport exists in a real environment, do not retain a usable secret link in the outbox.
  const body = m.sensitive && !mailConfigured() && isProdLike() ? "[body withheld: mail transport not configured]" : m.body;
  const status = mailConfigured() ? "queued" : "not_configured";
  const r = await db.one<{ id: string }>(
    "insert into email_outbox (company_id, user_id, to_email, subject, body, status, created_at) values ($1,$2,$3,$4,$5,$6,$7) returning id",
    [m.companyId, m.userId ?? null, m.to, m.subject, body, status, clock.now()]);
  return r!.id;
}

let transport: Transporter | null = null;
const getTransport = () => (transport ??= nodemailer.createTransport(process.env.SMTP_URL!));

/** Delivers queued mail for one tenant (or platform). Failures are recorded with attempt count, never silently dropped. */
export async function flushOutbox(companyId: string | null): Promise<{ sent: number; failed: number }> {
  if (!mailConfigured()) return { sent: 0, failed: 0 };
  const rows = await withTx({ companyId, platform: companyId === null }, (db) =>
    db.q<{ id: string; to_email: string; subject: string; body: string; attempts: number }>(
      "select id, to_email, subject, body, attempts from email_outbox where status = 'queued' and (company_id is not distinct from $1) order by created_at limit 50", [companyId]));
  let sent = 0, failed = 0;
  for (const r of rows) {
    try {
      await getTransport().sendMail({ from: process.env.MAIL_FROM, to: r.to_email, subject: r.subject, text: r.body });
      await withTx({ companyId, platform: companyId === null }, (db) => db.q("update email_outbox set status='sent', attempts=attempts+1, sent_at=$2 where id=$1", [r.id, clock.now()]));
      sent++;
    } catch (e) {
      const final = r.attempts + 1 >= 5;
      await withTx({ companyId, platform: companyId === null }, (db) =>
        db.q("update email_outbox set status=$2, attempts=attempts+1, last_error=$3 where id=$1", [r.id, final ? "failed" : "queued", String((e as Error).message).slice(0, 300)]));
      log("warn", "mail_send_failed", { outboxId: r.id, attempt: r.attempts + 1 });
      failed++;
    }
  }
  return { sent, failed };
}
