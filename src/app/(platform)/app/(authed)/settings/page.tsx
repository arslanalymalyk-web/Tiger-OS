import { ActionForm, Submit } from "@/components/platform/ActionForm";
import { Field, PageHeader } from "@/components/platform/ui";
import { listSessions } from "@/server/auth";
import { withTx } from "@/server/db";
import { decryptSecret, totpUri } from "@/server/crypto";
import { requireActor } from "@/server/web";
import { viewFor } from "@/server/view";
import { beginMfaAction, changePasswordAction, confirmMfaAction, disableMfaAction, revokeSessionAction, setLanguage } from "../../actions";

export default async function Settings() {
  const a = await requireActor();
  const v = viewFor(a.locale);
  const sessions = await listSessions(a);
  const u = await withTx({ companyId: a.companyId, userId: a.userId, platform: a.companyId === null }, (db) =>
    db.one<{ mfa_enabled: boolean; mfa_secret_enc: string | null }>("select mfa_enabled, mfa_secret_enc from users where id = $1", [a.userId]));
  const pendingSecret = u && !u.mfa_enabled && u.mfa_secret_enc ? decryptSecret(u.mfa_secret_enc) : null;
  return (
    <>
      <PageHeader title={v.t("settings.title")} />
      <div className="grid max-w-2xl gap-4">
        <section className="card p-4" aria-labelledby="lang">
          <h2 id="lang" className="mb-2 text-lg font-bold">{v.t("settings.language")}</h2>
          <div className="flex gap-2">
            {(["en", "ar"] as const).map((l) => (
              <form key={l} action={setLanguage}><input type="hidden" name="locale" value={l} />
                <button className={`btn ${a.locale === l ? "" : "btn-secondary"}`} lang={l} aria-pressed={a.locale === l}>{l === "en" ? "English" : "العربية"}</button></form>
            ))}
          </div>
        </section>

        <section className="card p-4" aria-labelledby="mfa">
          <h2 id="mfa" className="mb-2 text-lg font-bold">{v.t("settings.mfa")}</h2>
          <p className="mb-2">{u?.mfa_enabled ? v.t("settings.mfa_on") : v.t("settings.mfa_off")}</p>
          {u?.mfa_enabled ? (
            <ActionForm action={disableMfaAction} errors={v.errors} confirmText={v.t("common.confirm_action")}>
              <Field id="dp" label={v.t("settings.current_password")}><input id="dp" name="password" type="password" required autoComplete="current-password" className="field" dir="ltr" /></Field>
              <div><Submit danger>{v.t("settings.mfa_disable")}</Submit></div>
            </ActionForm>
          ) : pendingSecret ? (
            <ActionForm action={confirmMfaAction} errors={v.errors}>
              <p className="hint">{v.t("settings.mfa_secret")}</p>
              <p className="rounded bg-[color:var(--color-brand-50)] p-2 font-mono" dir="ltr">{pendingSecret}</p>
              <p className="hint break-all" dir="ltr">{totpUri(pendingSecret, a.email)}</p>
              <Field id="mc" label={v.t("auth.mfa_code")}><input id="mc" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required className="field" dir="ltr" /></Field>
              <div><Submit>{v.t("settings.mfa_confirm")}</Submit></div>
            </ActionForm>
          ) : (
            <form action={beginMfaAction}><button className="btn">{v.t("settings.mfa_enable")}</button></form>
          )}
        </section>

        <section className="card p-4" aria-labelledby="pw">
          <h2 id="pw" className="mb-2 text-lg font-bold">{v.t("settings.password")}</h2>
          <ActionForm action={changePasswordAction} errors={v.errors} confirmText={v.t("common.confirm_action")}>
            <Field id="cur" label={v.t("settings.current_password")}><input id="cur" name="current" type="password" required autoComplete="current-password" className="field" dir="ltr" /></Field>
            <Field id="nw" label={v.t("auth.new_password")} hint={`${v.t("auth.password_hint")} ${v.t("settings.signed_out_others")}`}><input id="nw" name="next" type="password" required minLength={12} autoComplete="new-password" className="field" dir="ltr" /></Field>
            <div><Submit>{v.t("common.save")}</Submit></div>
          </ActionForm>
        </section>

        <section className="card p-4" aria-labelledby="ses">
          <h2 id="ses" className="mb-2 text-lg font-bold">{v.t("settings.sessions")}</h2>
          <ul className="grid gap-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span dir="ltr">{s.ip ?? "?"} · {(s.user_agent ?? "").slice(0, 60)}<br /><span className="hint">{v.dt(s.last_seen_at)}</span></span>
                <form action={revokeSessionAction}><input type="hidden" name="id" value={s.id} /><button className="btn btn-secondary">{v.t("settings.revoke")}</button></form>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
