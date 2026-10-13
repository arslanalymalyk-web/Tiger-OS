import { ActionForm, Submit } from "@/components/platform/ActionForm";
import { Field, PageHeader } from "@/components/platform/ui";
import { PRIORITIES, CASE_TYPES } from "@/server/cases";
import { referenceData } from "@/server/master";
import { can } from "@/server/rbac";
import { requireActor } from "@/server/web";
import { viewFor } from "@/server/view";
import { redirect } from "next/navigation";
import { createCaseAction } from "../../../actions";

export default async function NewCase() {
  const a = await requireActor();
  if (!can(a.role, "case.create")) redirect("/app");
  const v = viewFor(a.locale);
  const ref = await referenceData(a);
  return (
    <>
      <PageHeader title={v.t("case.new_title")} />
      <div className="card max-w-2xl p-4">
        <ActionForm action={createCaseAction} errors={v.errors} resetOnSuccess={false}>
          <Field id="title" label={v.t("common.title")}><input id="title" name="title" required maxLength={300} className="field" /></Field>
          <Field id="description" label={`${v.t("common.description")} (${v.t("common.optional")})`}><textarea id="description" name="description" rows={3} maxLength={4000} className="field" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="type" label={v.t("common.type")}><select id="type" name="type" className="field">{CASE_TYPES.map((x) => <option key={x} value={x}>{v.t(`type.${x}`)}</option>)}</select></Field>
            <Field id="priority" label={v.t("common.priority")}><select id="priority" name="priority" defaultValue="medium" className="field">{PRIORITIES.map((x) => <option key={x} value={x}>{v.t(`priority.${x}`)}</option>)}</select></Field>
            <Field id="siteId" label={v.t("common.site")}><select id="siteId" name="siteId" required className="field">{ref.sites.map((s) => <option key={s.id} value={s.id}>{s.customer_name} — {s.name}</option>)}</select></Field>
            <Field id="assetId" label={`${v.t("common.asset")} (${v.t("common.optional")})`}><select id="assetId" name="assetId" className="field"><option value="">{v.t("common.none")}</option>{ref.assets.map((s) => <option key={s.id} value={s.id}>{s.tag} — {s.name}</option>)}</select></Field>
            <Field id="assignedTo" label={`${v.t("common.assignee")} (${v.t("common.optional")})`}><select id="assignedTo" name="assignedTo" className="field"><option value="">{v.t("common.unassigned")}</option>{ref.technicians.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          </div>
          <Submit>{v.t("common.submit")}</Submit>
        </ActionForm>
      </div>
    </>
  );
}
