import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/platform/ui";
import { verifyChain } from "@/server/audit";
import { withTx } from "@/server/db";
import { can } from "@/server/rbac";
import { requireActor } from "@/server/web";
import { viewFor } from "@/server/view";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ verify?: string }> }) {
  const a = await requireActor();
  if (!a.companyId || !can(a.role, "audit.view")) redirect("/app");
  const v = viewFor(a.locale);
  const sp = await searchParams;
  const { rows, verdict } = await withTx({ companyId: a.companyId, userId: a.userId }, async (db) => ({
    rows: await db.q<{ seq: string; at: Date; action: string; entity_type: string | null; entity_id: string | null; actor_name: string | null; detail: Record<string, unknown> }>(
      "select l.seq, l.at, l.action, l.entity_type, l.entity_id, u.name actor_name, l.detail from audit_log l left join users u on u.id = l.actor_id where l.chain = $1 order by l.seq desc limit 200", [a.companyId]),
    verdict: sp.verify ? await verifyChain(db) : null,
  }));
  return (
    <>
      <PageHeader title={v.t("audit.title")}>
        <Link className="btn btn-secondary" href="/app/admin/audit?verify=1">{v.t("audit.verify")}</Link>
        <a className="btn btn-secondary" href="/app/admin/audit/export">{v.t("audit.export")}</a>
      </PageHeader>
      {verdict && (verdict.ok
        ? <p role="status" className="alert-ok mb-3">{v.t("audit.intact", { n: v.n(verdict.checked) })}</p>
        : <p role="alert" className="alert-error mb-3">{v.t("audit.broken", { n: v.n(verdict.brokenAtSeq ?? 0) })}</p>)}
      <p className="hint mb-3">{v.t("audit.note")}</p>
      <div className="card scroll-x p-2" role="region" aria-label={v.t("audit.title")} tabIndex={0}>
        <table className="grid">
          <thead><tr><th>#</th><th>{v.t("audit.time")}</th><th>{v.t("audit.actor")}</th><th>{v.t("audit.action")}</th><th>{v.t("audit.entity")}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.seq}><td>{v.n(Number(r.seq))}</td><td>{v.dt(r.at)}</td><td>{r.actor_name ?? "—"}</td><td dir="ltr" className="font-mono text-sm">{r.action}</td><td dir="ltr" className="text-sm">{r.entity_type}{r.entity_id ? ` ${r.entity_id.slice(0, 8)}` : ""}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
