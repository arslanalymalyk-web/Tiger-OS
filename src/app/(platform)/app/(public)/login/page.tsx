import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/platform/ActionForm";
import { AuthShell } from "@/components/platform/AuthShell";
import { Field } from "@/components/platform/ui";
import { getSession, guestLocale } from "@/server/web";
import { viewFor } from "@/server/view";
import { loginAction } from "../../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  if (await getSession()) redirect("/app");
  const v = viewFor(await guestLocale());
  const { done } = await searchParams;
  return (
    <AuthShell title={v.t("auth.title")}>
      {done && <p className="alert-ok mb-3" role="status">{v.t("auth.password_done")}</p>}
      <ActionForm action={loginAction} errors={v.errors} resetOnSuccess={false}>
        <Field id="email" label={v.t("auth.email")}><input id="email" name="email" type="email" autoComplete="username" required className="field" dir="ltr" /></Field>
        <Field id="password" label={v.t("auth.password")}><input id="password" name="password" type="password" autoComplete="current-password" required className="field" dir="ltr" /></Field>
        <Submit>{v.t("auth.signin")}</Submit>
      </ActionForm>
      <p className="mt-4"><Link className="underline text-[color:var(--color-brand-700)]" href="/app/forgot">{v.t("auth.forgot")}</Link></p>
      <p className="hint mt-2">{v.t("auth.signin_notice")}</p>
    </AuthShell>
  );
}
