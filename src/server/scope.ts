import type { Actor } from "./actor";

/** SQL fragment restricting a `cases` alias to what the actor may see. Params are appended to `params`. */
export function visibleCases(actor: Actor, alias: string, params: unknown[]): string {
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const parts = [`${alias}.company_id = ${p(actor.companyId)}`];
  if (actor.role === "customer_approver") {
    parts.push(`${alias}.customer_id = ${p(actor.customerId)}`, `${alias}.shared_with_customer_at is not null`);
  }
  if (actor.role === "field_technician") parts.push(`${alias}.assigned_to = ${p(actor.userId)}`);
  if (actor.siteGrants) parts.push(`${alias}.site_id = any(${p(actor.siteGrants)}::uuid[])`);
  if (actor.contractGrants) parts.push(`${alias}.contract_id = any(${p(actor.contractGrants)}::uuid[])`);
  return parts.join(" and ");
}

/** Users who should be notified about a case: same tenant, active, role match, and within their own grants. */
export const RECIPIENT_SQL = `
  select u.id, u.email, u.name, u.locale from users u
   where u.company_id = $1 and u.status = 'active' and u.role = any($2::text[])
     and ($3::uuid is null or u.customer_id = $3)
     and (not exists (select 1 from user_access a where a.user_id = u.id and a.kind = 'site')
          or exists (select 1 from user_access a where a.user_id = u.id and a.kind = 'site' and a.ref_id = $4))
     and (not exists (select 1 from user_access a where a.user_id = u.id and a.kind = 'contract')
          or exists (select 1 from user_access a where a.user_id = u.id and a.kind = 'contract' and a.ref_id = $5))`;
