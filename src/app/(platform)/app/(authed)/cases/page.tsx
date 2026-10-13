import Link from "next/link";
import { Empty, PageHeader, PriorityBadge, StatusBadge } from "@/components/platform/ui";
import { listCases, STATUSES, PRIORITIES, type Status } from "@/server/cases";
import { isMetric } from "@/server/metrics";
import { can } from "@/server/rbac";
import { requireActor } from "@/server/web";
import { viewFor } from "@/server/view";
import { clock } from "@/server/db";
import { redirect } from "next/navigation";

type SP = { q?: string; status?: string; priority?: string; metric?: string; mine?: string };

export default async function Cases({ searchParams }: { searchParams: Promise<SP> }) {
  const a = await requireActor();
  if (!can(a.role, "case.view")) redirect("/app");
  const sp = await searchParams;
  const v = viewFor(a.locale);
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? [sp.status as Status] : undefined;
  const rows = await listCases(a, { q: sp.q, status, priority: sp.priority, metric: isMetric(sp.metric) ? sp.metric : undefined, mine: sp.mine === "1" });
  const now = clock.now();
  const filtered = Boolean(sp.q || sp.status || sp.priority || sp.metric || sp.mine);
  return (
    <>
      <PageHeader title={a.role === "field_technician" ? v.t("nav.jobs") : v.t("case.list_title")}>
        {can(a.role, "case.create") && <Link className="btn" href="/app/cases/new">{v.t("nav.new_case")}</Link>}
      </PageHeader>
      {isMetric(sp.metric) && <p className="alert-ok mb-3" role="status">{v.t("case.showing_metric")}: <strong>{v.t(`dash.${sp.metric}`)}</strong> — {v.n(rows.length)} {v.t("common.records")}</p>}
      <form method="get" className="card mb-4 grid gap-3 p-4 sm:grid-cols-5" role="search">
        <div className="sm:col-span-2"><label className="label" htmlFor="q">{v.t("common.search")}</label><input id="q" name="q" defaultValue={sp.q} className="field" placeholder={v.t("case.search_ph")} /></div>
        <div><label className="label" htmlFor="status">{v.t("case.filter_status")}</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="field"><option value="">{v.t("common.all")}</option>{STATUSES.map((s) => <option key={s} value={s}>{v.t(`status.${s}`)}</option>)}</select></div>
        <div><label className="label" htmlFor="priority">{v.t("case.filter_priority")}</label>
          <select id="priority" name="priority" defaultValue={sp.priority ?? ""} className="field"><option value="">{v.t("common.all")}</option>{PRIORITIES.map((p) => <option key={p} value={p}>{v.t(`priority.${p}`)}</option>)}</select></div>
        <div className="flex items-end gap-2"><button className="btn">{v.t("common.filter")}</button>{filtered && <Link className="btn btn-secondary" href="/app/cases">{v.t("case.clear_filter")}</Link>}</div>
        {sp.metric && <input type="hidden" name="metric" value={sp.metric} />}{sp.mine && <input type="hidden" name="mine" value={sp.mine} />}
      </form>
      {rows.length === 0 ? <Empty text={v.t("common.empty")} /> : (
        <ul className="grid gap-3">
          {rows.map((c) => {
            const overdue = !["closed", "work_completed", "deferred"].includes(c.status) && c.resolution_due_at < now;
            return (
              <li key={c.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`/app/cases/${c.id}`} className="text-lg font-bold underline-offset-2 hover:underline">#{v.n(Number(c.number))} · {c.title}</Link>
                  <div className="flex flex-wrap gap-2"><StatusBadge v={v} status={c.status} /><PriorityBadge v={v} priority={c.priority} />{overdue && <span className="badge badge-bad">{v.t("case.overdue")}</span>}</div>
                </div>
                <p className="hint mt-1">{c.site_name}{c.asset_tag ? ` · ${c.asset_tag}` : ""} · {v.t(`type.${c.type}`)} · {c.assignee_name ?? v.t("common.unassigned")} · {v.t("common.created")} {v.dt(c.created_at)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
