import Link from "next/link";
import { Empty, PageHeader } from "@/components/platform/ui";
import { listNotifications } from "@/server/cases";
import { requireActor } from "@/server/web";
import { viewFor } from "@/server/view";
import { markReadAction } from "../../actions";

export default async function Notifications() {
  const a = await requireActor();
  const v = viewFor(a.locale);
  const rows = a.companyId ? await listNotifications(a) : [];
  return (
    <>
      <PageHeader title={v.t("notif.title")}>
        <form action={markReadAction}><button className="btn btn-secondary">{v.t("notif.mark_read")}</button></form>
      </PageHeader>
      {rows.length === 0 ? <Empty text={v.t("notif.empty")} /> : (
        <ul className="grid gap-2">
          {rows.map((n) => (
            <li key={n.id} className={`card p-3 ${n.read_at ? "" : "border-s-4 border-s-[color:var(--color-brand-600)]"}`}>
              {n.case_id ? <Link className="font-semibold underline" href={`/app/cases/${n.case_id}`}>{v.t(`notif.${n.kind}`, n.params)}</Link> : v.t(`notif.${n.kind}`, n.params)}
              <p className="hint">{v.dt(n.created_at)}{n.read_at ? "" : " ●"}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
