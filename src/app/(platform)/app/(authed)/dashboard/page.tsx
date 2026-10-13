import Link from "next/link";
import { PageHeader } from "@/components/platform/ui";
import { dashboard } from "@/server/dashboard";
import { clock } from "@/server/db";
import { METRICS } from "@/server/metrics";
import { requireActor } from "@/server/web";
import { viewFor } from "@/server/view";
import { can } from "@/server/rbac";
import { redirect } from "next/navigation";

export default async function Dashboard() {
  const a = await requireActor();
  if (!can(a.role, "dashboard.view")) redirect("/app");
  const v = viewFor(a.locale);
  const d = await dashboard(a);
  const now = clock.now();
  const pct = (num: number, den: number) => (den ? `${v.n(Math.round((num / den) * 100))}%` : v.t("dash.no_data"));
  return (
    <>
      <PageHeader title={v.t("dash.title")} />
      <p className="hint mb-3">{v.t("dash.traceable")} · {v.t("common.generated")}: {v.dt(d.generatedAt)}</p>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label={v.t("dash.title")}>
        {METRICS.map((m) => (
          <li key={m}>
            <Link href={`/app/cases?metric=${m}`} className="card block p-4 hover:bg-[color:var(--color-brand-50)]">
              <span className="block text-3xl font-extrabold">{v.n(d.counts[m])}</span>
              <span className="text-sm font-semibold text-[color:var(--color-ink-2)]">{v.t(`dash.${m}`)}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="card mt-6 p-4" aria-labelledby="appr">
        <h2 id="appr" className="mb-3 text-lg font-bold">{v.t("dash.approvals")}</h2>
        {d.approvals.length === 0 ? <p className="hint">{v.t("dash.no_approvals")}</p> : (
          <div className="scroll-x" role="region" aria-label={v.t("dash.approvals")} tabIndex={0}>
            <table className="grid">
              <thead><tr><th>#</th><th>{v.t("common.title")}</th><th>{v.t("common.customer")}</th><th>{v.t("approval.requested_at")}</th><th>{v.t("approval.elapsed")}</th><th>{v.t("approval.reminders")}</th></tr></thead>
              <tbody>
                {d.approvals.map((p) => {
                  const late = p.due_at < now;
                  return (
                    <tr key={p.case_id}>
                      <td><Link className="underline" href={`/app/cases/${p.case_id}`}>{v.n(Number(p.number))}</Link></td>
                      <td>{p.title}</td><td>{p.customer_name}</td><td>{v.dt(p.requested_at)}</td>
                      <td>{v.dur(now.getTime() - p.requested_at.getTime())} {late && <span className="badge badge-bad">{v.t("approval.past_due")}</span>}</td>
                      <td>{v.n(p.reminders)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card mt-6 p-4" aria-labelledby="sla">
        <h2 id="sla" className="mb-3 text-lg font-bold">{v.t("dash.sla")}</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="hint">{v.t("dash.response_met")}</dt><dd className="text-xl font-bold">{pct(d.sla.responseMet, d.sla.responded)} <span className="hint">({v.n(d.sla.responseMet)} {v.t("dash.of")} {v.n(d.sla.responded)})</span></dd></div>
          <div><dt className="hint">{v.t("dash.avg_response")}</dt><dd className="text-xl font-bold">{d.sla.avgResponseSeconds === null ? v.t("dash.no_data") : v.dur(d.sla.avgResponseSeconds * 1000)}</dd></div>
          <div><dt className="hint">{v.t("dash.resolution_met")}</dt><dd className="text-xl font-bold">{pct(d.sla.resolutionMet, d.sla.resolved)} <span className="hint">({v.n(d.sla.resolutionMet)} {v.t("dash.of")} {v.n(d.sla.resolved)})</span></dd></div>
          <div><dt className="hint">{v.t("dash.avg_resolution")}</dt><dd className="text-xl font-bold">{d.sla.avgResolutionSeconds === null ? v.t("dash.no_data") : v.dur(d.sla.avgResolutionSeconds * 1000)}</dd></div>
        </dl>
      </section>
    </>
  );
}
