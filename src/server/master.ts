import { z } from "zod";
import { AppError, forbidden, type Actor } from "./actor";
import { audit } from "./audit";
import { clock, withTx } from "./db";
import { can } from "./rbac";

const name = z.string().trim().min(1).max(200);
const uuid = z.string().uuid();
const need = (a: Actor) => { if (!a.companyId || !can(a.role, "master.manage")) throw forbidden(); };

export async function createCustomer(actor: Actor, raw: { name: string; contactEmail?: string }) {
  need(actor);
  const i = z.object({ name, contactEmail: z.string().email().optional().or(z.literal("").transform(() => undefined)) }).parse(raw);
  return withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const r = await db.one<{ id: string }>("insert into customers (company_id, name, contact_email, created_at) values ($1,$2,$3,$4) returning id", [actor.companyId, i.name, i.contactEmail ?? null, clock.now()]);
    await audit(db, { action: "customer.created", actorId: actor.userId, entityType: "customer", entityId: r!.id, detail: { name: i.name } });
    return r!.id;
  });
}

export async function createContract(actor: Actor, raw: { customerId: string; reference: string; name: string }) {
  need(actor);
  const i = z.object({ customerId: uuid, reference: name, name }).parse(raw);
  return withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    if (!(await db.one("select 1 from customers where id = $1", [i.customerId]))) throw new AppError("not_found", 404);
    const r = await db.one<{ id: string }>("insert into contracts (company_id, customer_id, reference, name, created_at) values ($1,$2,$3,$4,$5) returning id", [actor.companyId, i.customerId, i.reference, i.name, clock.now()]);
    await audit(db, { action: "contract.created", actorId: actor.userId, entityType: "contract", entityId: r!.id, detail: i });
    return r!.id;
  });
}

export async function createSite(actor: Actor, raw: { customerId: string; contractId?: string; name: string; address?: string }) {
  need(actor);
  const i = z.object({ customerId: uuid, contractId: uuid.optional().or(z.literal("").transform(() => undefined)), name, address: z.string().trim().max(500).optional() }).parse(raw);
  return withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    if (!(await db.one("select 1 from customers where id = $1", [i.customerId]))) throw new AppError("not_found", 404);
    if (i.contractId && !(await db.one("select 1 from contracts where id = $1 and customer_id = $2", [i.contractId, i.customerId]))) throw new AppError("not_found", 404);
    const r = await db.one<{ id: string }>("insert into sites (company_id, customer_id, contract_id, name, address, created_at) values ($1,$2,$3,$4,$5,$6) returning id", [actor.companyId, i.customerId, i.contractId ?? null, i.name, i.address ?? null, clock.now()]);
    await audit(db, { action: "site.created", actorId: actor.userId, entityType: "site", entityId: r!.id, detail: { name: i.name } });
    return r!.id;
  });
}

export const AssetInput = z.object({
  siteId: uuid, parentId: uuid.optional().or(z.literal("").transform(() => undefined)), tag: z.string().trim().min(1).max(60), name, assetType: name,
  discipline: z.enum(["fire_protection", "mep"]), make: z.string().trim().max(100).optional(), model: z.string().trim().max(100).optional(),
  serialNumber: z.string().trim().max(100).optional(), criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  installedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
  warrantyUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
});
export async function createAsset(actor: Actor, raw: z.input<typeof AssetInput>) {
  need(actor);
  const i = AssetInput.parse(raw);
  return withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    if (!(await db.one("select 1 from sites where id = $1", [i.siteId]))) throw new AppError("not_found", 404);
    if (i.parentId && !(await db.one("select 1 from assets where id = $1 and site_id = $2", [i.parentId, i.siteId]))) throw new AppError("not_found", 404);
    try {
      const r = await db.one<{ id: string }>(
        `insert into assets (company_id, site_id, parent_id, tag, name, asset_type, discipline, make, model, serial_number, installed_on, warranty_until, criticality, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
        [actor.companyId, i.siteId, i.parentId ?? null, i.tag, i.name, i.assetType, i.discipline, i.make ?? null, i.model ?? null, i.serialNumber ?? null, i.installedOn ?? null, i.warrantyUntil ?? null, i.criticality, clock.now()]);
      await audit(db, { action: "asset.created", actorId: actor.userId, entityType: "asset", entityId: r!.id, detail: { tag: i.tag } });
      return r!.id;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new AppError("asset_tag_taken", 409);
      throw e;
    }
  });
}

/** Reference data visible to the actor (site grants respected). Used by forms and filters. */
export async function referenceData(actor: Actor) {
  if (!actor.companyId) throw forbidden();
  return withTx({ companyId: actor.companyId, userId: actor.userId }, async (db) => {
    const params: unknown[] = [];
    const w: string[] = [];
    if (actor.role === "customer_approver") { params.push(actor.customerId); w.push(`s.customer_id = $${params.length}`); }
    if (actor.siteGrants) { params.push(actor.siteGrants); w.push(`s.id = any($${params.length}::uuid[])`); }
    const sites = await db.q<{ id: string; name: string; customer_id: string; customer_name: string }>(
      `select s.id, s.name, s.customer_id, c.name customer_name from sites s join customers c on c.id = s.customer_id ${w.length ? "where " + w.join(" and ") : ""} order by c.name, s.name`, params);
    const assets = await db.q<{ id: string; site_id: string; tag: string; name: string; asset_type: string }>("select id, site_id, tag, name, asset_type from assets order by tag");
    const customers = await db.q<{ id: string; name: string }>("select id, name from customers order by name");
    const contracts = await db.q<{ id: string; reference: string; name: string; customer_id: string }>("select id, reference, name, customer_id from contracts order by reference");
    const technicians = await db.q<{ id: string; name: string }>("select id, name from users where role = 'field_technician' and status = 'active' order by name");
    const siteIds = new Set(sites.map((s) => s.id));
    return { sites, assets: assets.filter((a) => siteIds.has(a.site_id)), customers: actor.role === "customer_approver" ? [] : customers, contracts: actor.role === "customer_approver" ? [] : contracts, technicians: actor.role === "customer_approver" ? [] : technicians };
  });
}
