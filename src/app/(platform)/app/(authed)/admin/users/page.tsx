import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/platform/ActionForm";
import { Field, PageHeader } from "@/components/platform/ui";
import { listUsers } from "@/server/auth";
import { withTx } from "@/server/db";
import { referenceData } from "@/server/master";
import { can, ROLES } from "@/server/rbac";
import { requireActor } from "@/server/web";
import { viewFor } from "@/server/view";
import { deactivateAction, inviteAction } from "../../../actions";

export default async function Users() {
  const a = await requireActor();
  if (!a.companyId || !can(a.role, "user.manage")) redirect("/app");
  const v = viewFor(a.locale);
  const [users, ref, outbox] = await Promise.all([
    listUsers(a), referenceData(a),
    withTx({ companyId: a.companyId, userId: a.userId }, (db) => db.q<{ id: string; to_email: string; subject: string; status: string; created_at: Date; last_error: string | null }>("select id, to_email, subject, status, created_at, last_error from email_outbox order by created_at desc limit 10")),
  ]);
  return (
    <>
      <PageHeader title={v.t("admin.users_title")} />
      <div className="card scroll-x mb-6 p-2" role="region" aria-label={v.t("admin.users_title")} tabIndex={0}>
        <table className="grid">
          <thead><tr><th>{v.t("common.name")}</th><th>{v.t("common.role")}</th><th>{v.t("admin.status")}</th><th>{v.t("admin.mfa")}</th><th>{v.t("admin.last_login")}</th><th>{v.t("common.actions")}</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}<br /><span className="hint" dir="ltr">{u.email}</span></td>
                <td>{v.t(`role.${u.role}`)}{u.customer_name ? ` · ${u.customer_name}` : ""}</td>
                <td><span className={`badge ${u.status === "active" ? "badge-ok" : u.status === "invited" ? "badge-warn" : "badge-neutral"}`}>{u.status}</span></td>
                <td>{u.mfa_enabled ? v.t("common.yes") : v.t("common.no")}</td>
                <td>{v.dt(u.last_login_at)}</td>
                <td>{u.status !== "deactivated" && u.id !== a.userId && (
                  <ActionForm action={deactivateAction} errors={v.errors} confirmText={v.t("common.confirm_action")} className="grid">
                    <input type="hidden" name="userId" value={u.id} /><Submit danger>{v.t("admin.deactivate")}</Submit>
                  </ActionForm>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card mb-6 max-w-2xl p-4" aria-labelledby="inv">
        <h2 id="inv" className="mb-2 text-lg font-bold">{v.t("admin.invite")}</h2>
        <ActionForm action={inviteAction} errors={v.errors} okText={v.t("admin.invited")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="iname" label={v.t("common.name")}><input id="iname" name="name" required className="field" /></Field>
            <Field id="iemail" label={v.t("common.email")}><input id="iemail" name="email" type="email" required className="field" dir="ltr" /></Field>
            <Field id="irole" label={v.t("common.role")}><select id="irole" name="role" className="field">{ROLES.filter((r) => r !== "platform_admin").map((r) => <option key={r} value={r}>{v.t(`role.${r}`)}</option>)}</select></Field>
            <Field id="icust" label={v.t("admin.customer_for_role")}><select id="icust" name="customerId" className="field"><option value="">{v.t("common.none")}</option>{ref.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          </div>
          <fieldset><legend className="label">{v.t("admin.site_limit")}</legend>
            <div className="grid gap-1 sm:grid-cols-2">{ref.sites.map((s) => <label key={s.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="siteIds" value={s.id} className="size-5" />{s.name}</label>)}</div>
          </fieldset>
          <div><Submit>{v.t("admin.invite")}</Submit></div>
        </ActionForm>
      </section>

      <section className="card max-w-3xl p-4" aria-labelledby="ob">
        <h2 id="ob" className="mb-1 text-lg font-bold">{v.t("admin.outbox")}</h2>
        {outbox.some((o) => o.status === "not_configured") && <p className="hint mb-2">{v.t("admin.outbox_note")}</p>}
        <ul className="grid gap-1 text-sm">{outbox.map((o) => <li key={o.id}><span dir="ltr">{o.to_email}</span> · {o.subject} · <span className={`badge ${o.status === "sent" ? "badge-ok" : o.status === "failed" ? "badge-bad" : "badge-warn"}`}>{o.status}</span> · {v.dt(o.created_at)}</li>)}</ul>
      </section>
    </>
  );
}
