import type { View } from "@/server/view";

const STATUS_TONE: Record<string, string> = {
  new: "badge-neutral", assigned: "badge-info", in_progress: "badge-info", pending_review: "badge-warn", info_requested: "badge-warn",
  awaiting_customer: "badge-warn", customer_query: "badge-warn", approved: "badge-ok", rejected: "badge-bad", deferred: "badge-neutral",
  work_completed: "badge-ok", closed: "badge-neutral",
};
export const StatusBadge = ({ v, status }: { v: View; status: string }) => <span className={`badge ${STATUS_TONE[status] ?? "badge-neutral"}`}>{v.t(`status.${status}`)}</span>;
export const PriorityBadge = ({ v, priority }: { v: View; priority: string }) => (
  <span className={`badge ${priority === "urgent" ? "badge-bad" : priority === "high" ? "badge-warn" : "badge-neutral"}`}>{v.t(`priority.${priority}`)}</span>
);

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
export const Empty = ({ text }: { text: string }) => <p className="card p-6 text-center text-[color:var(--color-mute)]">{text}</p>;
