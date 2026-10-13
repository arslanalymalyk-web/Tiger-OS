import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/platform/ActionForm";
import { Field, PageHeader } from "@/components/platform/ui";
import { listCompanies } from "@/server/platform";
import { requireActor } from "@/server/web";
import { viewFor } from "@/server/view";
import { createCompanyAction } from "../../actions";

export default async function PlatformPage() {
  const a = await requireActor();
  if (a.role !== "platform_admin") redirect("/app");
  const v = viewFor(a.locale);
  const companies = await listCompanies(a);
  return (
    <>
      <PageHeader title={v.t("platform.title")} />
      <p className="hint mb-3">{v.t("platform.note")}</p>
      <ul className="card mb-6 divide-y divide-[color:var(--color-line)]">
        {companies.map((c) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3"><span className="font-semibold">{c.name} <span className="hint" dir="ltr">({c.slug})</span></span><span className="badge badge-ok">{c.status}</span></li>)}
      </ul>
      <section className="card max-w-2xl p-4" aria-labelledby="cc">
        <h2 id="cc" className="mb-2 text-lg font-bold">{v.t("platform.create")}</h2>
        <ActionForm action={createCompanyAction} errors={v.errors} okText={v.t("platform.created")}>
          <Field id="pn" label={v.t("common.name")}><input id="pn" name="name" required className="field" /></Field>
          <Field id="ps" label={v.t("platform.slug")}><input id="ps" name="slug" required pattern="[a-z0-9\-]{2,60}" className="field" dir="ltr" /></Field>
          <Field id="pan" label={v.t("platform.admin_name")}><input id="pan" name="adminName" required className="field" /></Field>
          <Field id="pae" label={v.t("platform.admin_email")}><input id="pae" name="adminEmail" type="email" required className="field" dir="ltr" /></Field>
          <Field id="pl" label={v.t("settings.language")}><select id="pl" name="locale" className="field"><option value="en">English</option><option value="ar">العربية</option></select></Field>
          <div><Submit>{v.t("platform.create")}</Submit></div>
        </ActionForm>
      </section>
    </>
  );
}
