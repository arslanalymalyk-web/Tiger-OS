import type { Actor } from "./actor";
import { forbidden } from "./actor";
import { clock, withTx } from "./db";
import { METRICS, metricSql, nowSql, type Metric } from "./metrics";
import { can } from "./rbac";
import { visibleCases } from "./scope";

/**
 * Every figure here is computed from case records the actor may see. Counts use the same
 * predicates as the drill-down list (metrics.ts). Nothing is estimated or projected.
 */
export async function dashboard(actor: Actor) {
  if (!actor.companyId || !can(actor.role, "dashboard.view")) throw forbidden();
  const now = clock.now();
  return withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const counts: Record<string, number> = {};
    for (const m of METRICS) {
      const params: unknown[] = [];
      const scope = visibleCases(actor, "c", params);
      const r = await db.one<{ n: string }>(`select count(*) n from cases c where ${scope} and (${metricSql(m as Metric, "c", nowSql(now))})`, params);
      counts[m] = Number(r!.n);
    }
    const p1: unknown[] = [];
    const sc1 = visibleCases(actor, "c", p1);
    const approvals = await db.q<{ case_id: string; number: string; title: string; customer_name: string; requested_at: Date; due_at: Date; reminders: number }>(
      `select c.id case_id, c.number, c.title, cu.name customer_name, a.requested_at, a.due_at,
              (select count(*)::int from approval_reminders r where r.approval_id = a.id) reminders
         from approval_requests a join cases c on c.id = a.case_id join customers cu on cu.id = a.customer_id
        where a.status = 'pending' and ${sc1} order by a.requested_at`, p1);
    const p2: unknown[] = [];
    const sc2 = visibleCases(actor, "c", p2);
    const times = await db.one<{ responded: string; avg_response_s: string | null; response_met: string; resolved: string; avg_resolution_s: string | null; resolution_met: string }>(
      `select count(first_response_at) responded,
              avg(extract(epoch from first_response_at - created_at)) avg_response_s,
              count(*) filter (where first_response_at <= response_due_at) response_met,
              count(work_completed_at) resolved,
              avg(extract(epoch from work_completed_at - created_at)) avg_resolution_s,
              count(*) filter (where work_completed_at <= resolution_due_at) resolution_met
         from cases c where ${sc2}`, p2);
    const num = (v: string | null) => (v === null ? null : Number(v));
    return {
      generatedAt: now, counts, approvals,
      sla: {
        responded: Number(times!.responded), responseMet: Number(times!.response_met), avgResponseSeconds: num(times!.avg_response_s),
        resolved: Number(times!.resolved), resolutionMet: Number(times!.resolution_met), avgResolutionSeconds: num(times!.avg_resolution_s),
      },
    };
  });
}
