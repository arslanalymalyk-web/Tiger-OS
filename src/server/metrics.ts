// Single definition of every dashboard metric. The dashboard count and the drill-down list use the
// same predicate, so each number can be traced to the exact records behind it.
export const METRICS = ["open", "urgent", "overdue", "unassigned", "awaiting_customer", "pending_review", "response_overdue"] as const;
export type Metric = (typeof METRICS)[number];

export function metricSql(m: Metric, alias: string, nowRef: string): string {
  const open = `${alias}.status <> 'closed'`;
  switch (m) {
    case "open": return open;
    case "urgent": return `${open} and ${alias}.priority = 'urgent'`;
    case "overdue": return `${alias}.status not in ('closed','work_completed','deferred') and ${alias}.resolution_due_at < ${nowRef}`;
    case "unassigned": return `${alias}.assigned_to is null and ${alias}.status = 'new'`;
    case "awaiting_customer": return `${alias}.status in ('awaiting_customer','customer_query')`;
    case "pending_review": return `${alias}.status = 'pending_review'`;
    case "response_overdue": return `${alias}.first_response_at is null and ${alias}.status in ('new','assigned') and ${alias}.response_due_at < ${nowRef}`;
  }
}
export const isMetric = (v: unknown): v is Metric => typeof v === "string" && (METRICS as readonly string[]).includes(v);

/** Server-generated instant as a SQL literal (an ISO string from a Date, never user input). */
export const nowSql = (d: Date) => `'${d.toISOString()}'::timestamptz`;
