import { ActionForm, Submit } from "@/components/platform/ActionForm";
import { AuthShell } from "@/components/platform/AuthShell";
import { Field } from "@/components/platform/ui";
import { inspectToken } from "@/server/auth";
import { guestLocale } from "@/server/web";
import { viewFor } from "@/server/view";
import { tokenPasswordAction } from "../../../actions";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = viewFor(await guestLocale());
  const info = await inspectToken(token, "invite");
  return (
    <AuthShell title={v.t("auth.invite_title")}>
      {!info.valid ? <p role="alert" className="alert-error">{v.t("err.token_invalid")}</p> : (
        <ActionForm action={tokenPasswordAction} errors={v.errors} resetOnSuccess={false}>
          <input type="hidden" name="token" value={token} /><input type="hidden" name="kind" value="invite" />
          {info.name && <p className="font-semibold">{info.name}</p>}
          <Field id="password" label={v.t("auth.new_password")} hint={v.t("auth.password_hint")}>
            <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required className="field" dir="ltr" />
          </Field>
          <Submit>{v.t("auth.set_password")}</Submit>
        </ActionForm>
      )}
    </AuthShell>
  );
}
