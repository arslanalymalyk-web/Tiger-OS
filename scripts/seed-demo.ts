// Fictional demonstration data for development and staging. Refuses to run in production.
// Prints generated credentials once; nothing secret is stored in the repository.
import { randomBytes } from "node:crypto";
import { createPlatformAdmin } from "./create-platform-admin";
import { consumeToken, inviteUser, login, resolveSession } from "@/server/auth";
import * as C from "@/server/cases";
import { closePool } from "@/server/db";
import { createAsset, createContract, createCustomer, createSite } from "@/server/master";
import { createCompany } from "@/server/platform";
import type { Actor } from "@/server/actor";
import type { Role } from "@/server/rbac";

async function main() {
  if ((process.env.APP_ENV ?? process.env.NODE_ENV) === "production") throw new Error("Refusing to seed demo data in production");
  const password = process.env.SEED_PASSWORD ?? randomBytes(9).toString("base64url") + "-Aa1";
  const asActor = async (email: string): Promise<Actor> => {
    const r = await login(email, password, { ip: "seed" });
    if (!r.ok) throw new Error(`seed login failed for ${email}: ${r.code}`);
    return (await resolveSession(r.token))!.actor;
  };

  const pt = await createPlatformAdmin("platform@example.test");
  await consumeToken(pt, "invite", password);
  const plat = await asActor("platform@example.test");

  const { token } = await createCompany(plat, { name: "Northgate Facility Services (fictional)", slug: "northgate", adminEmail: "admin@northgate.example", adminName: "Amira Admin", locale: "en" });
  await consumeToken(token, "invite", password);
  const admin = await asActor("admin@northgate.example");

  const add = async (email: string, name: string, role: Role, extra: { customerId?: string } = {}) => {
    const r = await inviteUser(admin, { email, name, role, customerId: extra.customerId });
    await consumeToken(r.token, "invite", password);
    return asActor(email);
  };
  const customerId = await createCustomer(admin, { name: "Harbourview Properties (fictional)", contactEmail: "fm@harbourview.example" });
  const contractId = await createContract(admin, { customerId, reference: "HV-2026-001", name: "Integrated fire & MEP maintenance" });
  const siteId = await createSite(admin, { customerId, contractId, name: "Harbourview Tower", address: "Fictional Street 1" });
  const pump = await createAsset(admin, { siteId, tag: "FP-PMP-001", name: "Duty fire pump", assetType: "Fire pump", discipline: "fire_protection", make: "ExampleCo", model: "FP-250", criticality: "critical", installedOn: "2021-04-10", warrantyUntil: "2026-04-10" });
  await createAsset(admin, { siteId, tag: "AHU-03", name: "Air handling unit 3", assetType: "AHU", discipline: "mep", criticality: "high" });
  const ops = await add("ops@northgate.example", "Omar Operations", "operations_manager");
  const eng = await add("engineer@northgate.example", "Layla Engineer", "engineer");
  const tech = await add("tech@northgate.example", "Tariq Technician", "field_technician");
  await add("auditor@northgate.example", "Aisha Auditor", "auditor");
  const cust = await add("approver@harbourview.example", "Hassan Approver", "customer_approver", { customerId });

  // One case at each interesting point of the workflow.
  await C.createCase(ops, { type: "preventive", title: "Quarterly AHU-03 filter inspection", siteId, priority: "low" });
  const c1 = await C.createCase(ops, { type: "corrective", title: "Duty fire pump trips on weekly churn test", siteId, assetId: pump, priority: "urgent", assignedTo: tech.userId });
  const c2 = await C.createCase(ops, { type: "corrective", title: "Jockey pump pressure drop", siteId, assetId: pump, priority: "high", assignedTo: tech.userId });
  await C.startWork(tech, c2);
  await C.submitForReview(tech, c2, { observation: "Pressure decays 0.4 bar per hour with pump idle. Visible weep at the discharge flange gasket." });
  const c3 = await C.createCase(ops, { type: "corrective", title: "Sprinkler zone 4 isolation valve seized", siteId, priority: "high", assignedTo: tech.userId });
  await C.startWork(tech, c3);
  await C.submitForReview(tech, c3, { observation: "Valve will not turn by hand; corrosion at stem." });
  await C.requestApproval(eng, c3, { summary: "The zone 4 isolation valve needs replacing. Please approve so we can schedule the shutdown." });
  void c1; void cust;
  console.log("\nFictional demo data created.\nAll demo accounts share one generated password (shown once):\n");
  console.log(`  password: ${password}`);
  for (const e of ["platform@example.test", "admin@northgate.example", "ops@northgate.example", "engineer@northgate.example", "tech@northgate.example", "auditor@northgate.example", "approver@harbourview.example"]) console.log(`  ${e}`);
  console.log("");
}
main().catch((e) => { console.error(e.message); process.exit(1); }).finally(closePool);
