import Link from "next/link";
import { redirect } from "next/navigation";
import { Empty, PageHeader, StatusBadge } from "@/components/platform/ui";
import { listCases } from "@/server/cases";
import { requireActor } from "@/server/web";
import { viewFor, type View } from "@/server/view";

type Row = Awaited<ReturnType<typeof listCases>>[number];
function List({ v, items }: { v: View; items: Row[] }) {
  return (
    <ul className="grid gap-3">
      {items.map((c) => (
        <li key={c.id} className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link href={`/app/cases/${c.id}`} className="text-lg font-bold underline-offset-2 hover:underline">#{v.n(Number(c.number))} · {c.title}</Link>
            <StatusBadge v={v} status={c.status} />
          </div>
          <p className="hint mt-1">{c.site_name}{c.asset_tag ? ` · ${c.asset_tag}` : ""} · {v.dt(c.created_at)}</p>
        </li>
      ))}
    </ul>
  );
}

export default async function Portal() {
  const a = await requireActor();
  if (a.role !== "customer_approver") redirect("/app");
  const v = viewFor(a.locale);
  const rows = await listCases(a, { limit: 200 });
  const waiting = rows.filter((c) => c.status === "awaiting_customer");
  const other = rows.filter((c) => c.status !== "awaiting_customer");
  return (
    <>
      <PageHeader title={v.t("portal.title")} />
      {rows.length === 0 && <Empty text={v.t("portal.empty")} />}
      {waiting.length > 0 && <section className="mb-6" aria-labelledby="w"><h2 id="w" className="mb-2 text-lg font-bold">{v.t("portal.pending")} ({v.n(waiting.length)})</h2><List v={v} items={waiting} /></section>}
      {other.length > 0 && <section aria-labelledby="o"><h2 id="o" className="mb-2 text-lg font-bold">{v.t("portal.other")}</h2><List v={v} items={other} /></section>}
    </>
  );
}
