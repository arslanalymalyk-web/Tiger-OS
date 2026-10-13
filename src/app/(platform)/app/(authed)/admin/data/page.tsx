import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/platform/ActionForm";
import { Field, PageHeader } from "@/components/platform/ui";
import { referenceData } from "@/server/master";
import { can } from "@/server/rbac";
import { requireActor } from "@/server/web";
import { viewFor, type View } from "@/server/view";
import { masterAction } from "../../../actions";

function Form({ v, kind, title, children }: { v: View; kind: string; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4" aria-label={title}>
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <ActionForm action={masterAction} errors={v.errors} okText={v.t("admin.created")}>
        <input type="hidden" name="kind" value={kind} />{children}<div><Submit>{v.t("common.add")}</Submit></div>
      </ActionForm>
    </section>
  );
}
function CustSel({ v, id, customers }: { v: View; id: string; customers: { id: string; name: string }[] }) {
  return <Field id={id} label={v.t("common.customer")}><select id={id} name="customerId" required className="field">{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>;
}

export default async function Data() {
  const a = await requireActor();
  if (!a.companyId || !can(a.role, "master.manage")) redirect("/app");
  const v = viewFor(a.locale);
  const ref = await referenceData(a);
  return (
    <>
      <PageHeader title={v.t("admin.data_title")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Form v={v} kind="customer" title={v.t("admin.add_customer")}>
          <Field id="cn" label={v.t("common.name")}><input id="cn" name="name" required className="field" /></Field>
          <Field id="ce" label={`${v.t("common.email")} (${v.t("common.optional")})`}><input id="ce" name="contactEmail" type="email" className="field" dir="ltr" /></Field>
        </Form>
        <Form v={v} kind="contract" title={v.t("admin.add_contract")}>
          <CustSel v={v} id="kc" customers={ref.customers} />
          <Field id="kr" label={v.t("common.reference")}><input id="kr" name="reference" required className="field" dir="ltr" /></Field>
          <Field id="kn" label={v.t("common.name")}><input id="kn" name="name" required className="field" /></Field>
        </Form>
        <Form v={v} kind="site" title={v.t("admin.add_site")}>
          <CustSel v={v} id="sc" customers={ref.customers} />
          <Field id="sk" label={`${v.t("common.contract")} (${v.t("common.optional")})`}><select id="sk" name="contractId" className="field"><option value="">{v.t("common.none")}</option>{ref.contracts.map((c) => <option key={c.id} value={c.id}>{c.reference}</option>)}</select></Field>
          <Field id="sn" label={v.t("common.name")}><input id="sn" name="name" required className="field" /></Field>
          <Field id="sa" label={`${v.t("common.address")} (${v.t("common.optional")})`}><input id="sa" name="address" className="field" /></Field>
        </Form>
        <Form v={v} kind="asset" title={v.t("admin.add_asset")}>
          <Field id="as" label={v.t("common.site")}><select id="as" name="siteId" required className="field">{ref.sites.map((s) => <option key={s.id} value={s.id}>{s.customer_name} — {s.name}</option>)}</select></Field>
          <Field id="ap" label={`${v.t("admin.parent")} (${v.t("common.optional")})`}><select id="ap" name="parentId" className="field"><option value="">{v.t("common.none")}</option>{ref.assets.map((s) => <option key={s.id} value={s.id}>{s.tag}</option>)}</select></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="at" label={v.t("admin.tag")}><input id="at" name="tag" required className="field" dir="ltr" /></Field>
            <Field id="an" label={v.t("common.name")}><input id="an" name="name" required className="field" /></Field>
            <Field id="aty" label={v.t("admin.asset_type")}><input id="aty" name="assetType" required className="field" /></Field>
            <Field id="ad" label={v.t("admin.discipline")}><select id="ad" name="discipline" className="field"><option value="fire_protection">{v.t("discipline.fire_protection")}</option><option value="mep">{v.t("discipline.mep")}</option></select></Field>
            <Field id="am" label={v.t("admin.make")}><input id="am" name="make" className="field" /></Field>
            <Field id="amo" label={v.t("admin.model")}><input id="amo" name="model" className="field" /></Field>
            <Field id="asn" label={v.t("admin.serial")}><input id="asn" name="serialNumber" className="field" dir="ltr" /></Field>
            <Field id="acr" label={v.t("admin.criticality")}><select id="acr" name="criticality" defaultValue="medium" className="field">{(["low", "medium", "high", "critical"] as const).map((c) => <option key={c} value={c}>{v.t(`criticality.${c}`)}</option>)}</select></Field>
            <Field id="ai" label={v.t("admin.installed")}><input id="ai" name="installedOn" type="date" className="field" /></Field>
            <Field id="aw" label={v.t("admin.warranty")}><input id="aw" name="warrantyUntil" type="date" className="field" /></Field>
          </div>
        </Form>
      </div>
      <section className="card mt-6 p-4" aria-labelledby="al">
        <h2 id="al" className="mb-2 text-lg font-bold">{v.t("common.asset")} ({v.n(ref.assets.length)})</h2>
        <ul className="grid gap-1 text-sm">{ref.assets.map((s) => <li key={s.id}><span dir="ltr" className="font-mono">{s.tag}</span> — {s.name} ({s.asset_type})</li>)}</ul>
      </section>
    </>
  );
}
