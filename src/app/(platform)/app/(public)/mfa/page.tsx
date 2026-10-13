import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/platform/ActionForm";
import { AuthShell } from "@/components/platform/AuthShell";
import { Field } from "@/components/platform/ui";
import { getSession } from "@/server/web";
import { viewFor } from "@/server/view";
import { mfaAction } from "../../actions";

export default async function Mfa() {
  const s = await getSession();
  if (!s) redirect("/app/login");
  if (!s.mfaEnabled || s.mfaVerified) redirect("/app");
  const v = viewFor(s.actor.locale);
  return (
    <AuthShell title={v.t("auth.mfa_title")}>
      <ActionForm action={mfaAction} errors={v.errors} resetOnSuccess={false}>
        <Field id="code" label={v.t("auth.mfa_code")}><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="field" dir="ltr" /></Field>
        <Submit>{v.t("auth.verify")}</Submit>
      </ActionForm>
    </AuthShell>
  );
}
