import { cookies } from "next/headers";
import { resolveSession } from "@/server/auth";
import { audit } from "@/server/audit";
import { withTx } from "@/server/db";
import { can } from "@/server/rbac";
import { SESSION_COOKIE } from "@/server/web";

export const dynamic = "force-dynamic";

const csv = (v: unknown) => {
  let s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
};

export async function GET() {
  const s = await resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s || (s.mfaEnabled && !s.mfaVerified) || !s.actor.companyId || !can(s.actor.role, "audit.view")) return new Response("Forbidden", { status: 403 });
  const a = s.actor;
  const rows = await withTx({ companyId: a.companyId, userId: a.userId }, async (db) => {
    const r = await db.q<Record<string, unknown>>("select seq, at, actor_id, action, entity_type, entity_id, detail, prev_hash, hash from audit_log where chain = $1 order by seq", [a.companyId]);
    await audit(db, { action: "audit.exported", actorId: a.userId, detail: { rows: r.length } });
    return r;
  });
  const head = ["seq", "at", "actor_id", "action", "entity_type", "entity_id", "detail", "prev_hash", "hash"];
  const body = [head.join(","), ...rows.map((r) => head.map((h) => csv(h === "at" ? (r.at as Date).toISOString() : r[h])).join(","))].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="audit-log.csv"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
