import { ActionForm, Submit } from "@/components/platform/ActionForm";
import { AuthShell } from "@/components/platform/AuthShell";
import { Field } from "@/components/platform/ui";
import { guestLocale } from "@/server/web";
import { viewFor } from "@/server/view";
import { forgotAction } from "../../actions";

export default async function Forgot() {
  const v = viewFor(await guestLocale());
  return (
    <AuthShell title={v.t("auth.forgot_title")}>
      <p className="hint mb-3">{v.t("auth.forgot_help")}</p>
      <ActionForm action={forgotAction} errors={v.errors} okText={v.t("auth.forgot_sent")}>
        <Field id="email" label={v.t("auth.email")}><input id="email" name="email" type="email" required className="field" dir="ltr" /></Field>
        <Submit>{v.t("common.submit")}</Submit>
      </ActionForm>
    </AuthShell>
  );
}
