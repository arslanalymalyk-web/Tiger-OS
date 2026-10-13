import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PNG, freezeClock, makeWorld, ownerSql, platformAdmin, resetDb, addUser, makeCompany, PASSWORD } from "./helpers";
import * as C from "@/server/cases";
import * as A from "@/server/auth";
import { verifyChain } from "@/server/audit";
import { clock, closePool, withTx } from "@/server/db";
import { dashboard } from "@/server/dashboard";
import { totpAt } from "@/server/crypto";
import { listCompanies } from "@/server/platform";
import { createSite, referenceData } from "@/server/master";
import { METRICS } from "@/server/metrics";
import { blobStore } from "@/server/storage";
import { errorCode, type Actor } from "@/server/actor";

type World = Awaited<ReturnType<typeof makeWorld>>;
let plat: Actor, W1: World, W2: World;
const realNow = clock.now;
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (errorCode(e) === "unexpected" ? (e as Error).message : errorCode(e)));

before(async () => {
  await resetDb();
  plat = await platformAdmin();
  W1 = await makeWorld(plat, "alpha");
  W2 = await makeWorld(plat, "beta");
});
after(async () => { clock.now = realNow; await closePool(); });

async function newCase(w: World, over: Partial<Parameters<typeof C.createCase>[1]> = {}) {
  return C.createCase(w.ops, { type: "corrective", title: "Fire pump fails weekly churn test", siteId: w.siteId, assetId: w.assetId, priority: "high", assignedTo: w.tech.userId, ...over });
}

describe("tenant isolation", () => {
  test("a user cannot read another company's case, even with its id", async () => {
    const id = await newCase(W2);
    assert.equal(await code(C.getCase(W1.admin, id)), "not_found");
    assert.equal(await code(C.getCase(W1.eng, id)), "not_found");
    assert.ok((await C.listCases(W1.admin)).every((c) => c.company_id === W1.companyId));
  });
  test("mutations on another company's case fail as not found", async () => {
    const id = await newCase(W2);
    assert.equal(await code(C.addComment(W1.eng, id, "hi")), "not_found");
    assert.equal(await code(C.closeCase(W1.eng, id, "closing it")), "not_found");
  });
  test("cannot create a case on another company's site or with its asset", async () => {
    assert.equal(await code(C.createCase(W1.ops, { type: "corrective", title: "x", siteId: W2.siteId, priority: "low" })), "not_found");
    assert.equal(await code(C.createCase(W1.ops, { type: "corrective", title: "x", siteId: W1.siteId, assetId: W2.assetId, priority: "low" })), "asset_site_mismatch");
  });
  test("database row-level security blocks cross-tenant reads and writes even when SQL omits company filters", async () => {
    await newCase(W2);
    await withTx({ companyId: W1.companyId }, async (db) => {
      assert.equal((await db.q("select * from cases where company_id = $1", [W2.companyId])).length, 0);
      assert.ok((await db.q("select company_id from cases")).every((r) => r.company_id === W1.companyId));
      assert.equal((await db.q("update cases set title = 'pwned' where company_id = $1 returning id", [W2.companyId])).length, 0);
    });
    await assert.rejects(withTx({ companyId: W1.companyId }, (db) =>
      db.q("insert into customers (company_id, name, created_at) values ($1,'x',now())", [W2.companyId])), /row-level security/);
  });
  test("no tenant context sees nothing; platform admin sees companies but no tenant data", async () => {
    await withTx({}, async (db) => { assert.equal((await db.q("select * from cases")).length, 0); assert.equal((await db.q("select * from evidence")).length, 0); });
    await withTx({ platform: true, userId: plat.userId }, async (db) => {
      for (const t of ["cases", "case_notes", "evidence", "customers", "sites", "assets", "notifications", "approval_requests"]) assert.equal((await db.q(`select 1 from ${t}`)).length, 0, t);
    });
    assert.equal((await listCompanies(plat)).length >= 2, true);
    assert.equal(await code(C.listCases(plat)), "forbidden");
  });
  test("user and audit data are tenant-scoped", async () => {
    assert.equal((await A.listUsers(W1.admin)).some((u) => u.email.endsWith("@beta.test")), false);
    await withTx({ companyId: W1.companyId }, async (db) => assert.equal((await db.q("select 1 from audit_log where company_id = $1", [W2.companyId])).length, 0));
  });
  test("site grants restrict a user inside one company", async () => {
    const site2 = await createSite(W1.admin, { customerId: W1.customerId, name: "Second site" });
    const restricted = await addUser(W1.admin, "alpha", "engineer", "eng-restricted", { siteIds: [site2] });
    const visible = await C.listCases(restricted);
    assert.ok(visible.every((c) => c.site_id === site2));
    const id = await newCase(W1);
    assert.equal(await code(C.getCase(restricted, id)), "not_found");
    assert.equal(await code(C.createCase(restricted, { type: "corrective", title: "x", siteId: W1.siteId, priority: "low" })), "not_found");
    assert.deepEqual((await referenceData(restricted)).sites.map((s) => s.id), [site2]);
  });
});

describe("roles and permissions", () => {
  test("technician sees only assigned work and cannot create, assign, review or approve", async () => {
    const mine = await newCase(W1);
    const other = await newCase(W1, { assignedTo: W1.tech2.userId });
    const ids = (await C.listCases(W1.tech)).map((c) => c.id);
    assert.ok(ids.includes(mine) && !ids.includes(other));
    assert.equal(await code(C.getCase(W1.tech, other)), "not_found");
    assert.equal(await code(C.createCase(W1.tech, { type: "corrective", title: "x", siteId: W1.siteId, priority: "low" })), "forbidden");
    assert.equal(await code(C.assignCase(W1.tech, mine, W1.tech2.userId)), "forbidden");
    assert.equal(await code(C.returnForInfo(W1.tech, mine, "no way")), "forbidden");
    assert.equal(await code(C.decideApproval(W1.tech, mine, "approved", "")), "forbidden");
    assert.equal(await code(C.startWork(W1.tech2, mine)), "not_found");
  });
  test("customer sees nothing until shared, never internal notes, and cannot act outside own customer", async () => {
    const id = await newCase(W1);
    assert.equal(await code(C.getCase(W1.cust, id)), "not_found");
    assert.ok(!(await C.listCases(W1.cust)).some((c) => c.id === id));
    await C.startWork(W1.tech, id);
    await C.submitForReview(W1.tech, id, { observation: "INTERNAL: bearing noise on pump" });
    await C.requestApproval(W1.eng, id, { summary: "Replace pump bearing; quote to follow.", internalNote: "INTERNAL engineer thinking" });
    const d = await C.getCase(W1.cust, id);
    assert.ok(d.notes.every((n) => n.visibility === "customer"));
    assert.ok(!JSON.stringify(d).includes("INTERNAL"));
    assert.ok(d.events.every((e) => Object.keys(e.detail).length === 0));
    assert.equal(await code(C.addComment(W1.cust, id, "ok", "internal")), "ok"); // forced to customer visibility
    assert.ok((await C.getCase(W1.eng, id)).notes.find((n) => n.body === "ok")!.visibility === "customer");
    // a different customer in another company cannot see or decide
    assert.equal(await code(C.decideApproval(W2.cust, id, "approved", "")), "not_found");
  });
  test("engineer cannot make the customer decision; customer cannot review or close", async () => {
    const id = await newCase(W1);
    await C.startWork(W1.tech, id);
    await C.submitForReview(W1.tech, id, { observation: "obs" });
    await C.requestApproval(W1.eng, id, { summary: "Please approve" });
    assert.equal(await code(C.decideApproval(W1.eng, id, "approved", "")), "forbidden");
    assert.equal(await code(C.closeCase(W1.cust, id, "closing")), "forbidden");
    assert.equal(await code(C.returnForInfo(W1.cust, id, "x y z")), "forbidden");
  });
  test("auditor is read-only; ops manager cannot perform technical review or approval requests", async () => {
    const id = await newCase(W1);
    assert.equal(await code(C.addComment(W1.auditor, id, "x")), "forbidden");
    assert.equal(await code(C.createCase(W1.auditor, { type: "corrective", title: "x", siteId: W1.siteId, priority: "low" })), "forbidden");
    await C.startWork(W1.tech, id); await C.submitForReview(W1.tech, id, { observation: "obs" });
    assert.equal(await code(C.requestApproval(W1.ops, id, { summary: "x" })), "forbidden");
    assert.equal(await code(C.returnForInfo(W1.ops, id, "need more")), "forbidden");
    assert.equal(await code(A.inviteUser(W1.eng, { email: "n@alpha.test", name: "N", role: "engineer" })), "forbidden");
    assert.equal(await code(A.inviteUser(W1.admin, { email: "p@alpha.test", name: "P", role: "platform_admin" })), "invalid_role");
  });
  test("invalid transitions are rejected", async () => {
    const id = await newCase(W1);
    assert.equal(await code(C.submitForReview(W1.tech, id, { observation: "obs" })), "invalid_state");
    assert.equal(await code(C.completeWork(W1.tech, id, "done")), "invalid_state");
    assert.equal(await code(C.closeCase(W1.admin, id, "no reason")), "invalid_state");
    await C.startWork(W1.tech, id);
    assert.equal(await code(C.submitForReview(W1.tech, id, { observation: "" })), "validation");
  });
  test("concurrent identical transitions: exactly one wins", async () => {
    const id = await newCase(W1);
    await C.startWork(W1.tech, id);
    const r = await Promise.all([1, 2, 3].map(() => code(C.submitForReview(W1.tech, id, { observation: "obs" }))));
    assert.equal(r.filter((x) => x === "ok").length, 1);
  });
});

describe("main workflow, timestamps and approval duration", () => {
  test("technician → engineer → customer notification → approval → resolution", async () => {
    const clk = freezeClock("2026-03-01T08:00:00Z");
    const id = await C.createCase(W1.ops, { type: "corrective", title: "Jockey pump tripping", siteId: W1.siteId, assetId: W1.assetId, priority: "urgent" });
    let d = await C.getCase(W1.ops, id);
    assert.equal(d.case.status, "new");
    // SLA deadlines come from policy: urgent = 60 min response / 480 min resolution
    assert.equal(d.case.response_due_at.toISOString(), "2026-03-01T09:00:00.000Z");
    assert.equal(d.case.resolution_due_at.toISOString(), "2026-03-01T16:00:00.000Z");

    clk.set("2026-03-01T08:20:00Z");
    await C.assignCase(W1.ops, id, W1.tech.userId);
    clk.set("2026-03-01T08:45:00Z");
    await C.startWork(W1.tech, id);
    clk.set("2026-03-01T10:30:00Z");
    await C.submitForReview(W1.tech, id, { observation: "Motor winding overheated; breaker tripped.", observedAt: new Date("2026-03-01T09:55:00Z") });
    const png = await C.uploadEvidence(W1.tech, id, { name: "pump.png", data: PNG }, { caption: "Nameplate" }).catch(() => null);
    assert.equal(png, null, "technician cannot upload after submitting");

    clk.set("2026-03-01T11:00:00Z");
    await C.returnForInfo(W1.eng, id, "Please photograph the motor nameplate.");
    assert.equal((await C.getCase(W1.eng, id)).case.status, "info_requested");
    clk.set("2026-03-01T11:30:00Z");
    const ev = await C.uploadEvidence(W1.tech, id, { name: "../../etc/passwd.png", data: PNG }, { caption: "Nameplate", capturedAt: new Date("2026-03-01T11:25:00Z") });
    await C.submitForReview(W1.tech, id, { observation: "Nameplate photographed." });

    clk.set("2026-03-01T12:00:00Z");
    await C.shareEvidence(W1.eng, ev, "customer");
    await C.requestApproval(W1.eng, id, { summary: "Replace motor, est. 3 days. Approval needed to order.", dueAt: new Date("2026-03-04T12:00:00Z") });
    d = await C.getCase(W1.cust, id);
    assert.equal(d.case.status, "awaiting_customer");
    assert.equal(d.approvals[0].status, "pending");
    assert.equal(C.approvalElapsedMs(d.approvals[0], clock.now()), 0);

    clk.set("2026-03-02T12:00:00Z");
    assert.equal(C.approvalElapsedMs((await C.getCase(W1.cust, id)).approvals[0], clock.now()), 24 * 3600_000);
    await C.remindApproval(W1.ops, id, "Gentle reminder");
    assert.equal((await C.getCase(W1.ops, id)).approvals[0].reminders, 1);

    clk.set("2026-03-02T14:30:00Z");
    await C.decideApproval(W1.cust, id, "approved", "Go ahead, ref PO 1182");
    d = await C.getCase(W1.eng, id);
    const a = d.approvals[0];
    assert.equal(a.status, "approved");
    assert.equal(a.decided_by_name, W1.cust.name);
    assert.equal(a.decided_at!.toISOString(), "2026-03-02T14:30:00.000Z");
    assert.equal(C.approvalElapsedMs(a, new Date("2026-03-30T00:00:00Z")), 26.5 * 3600_000, "duration is fixed at decision time");

    clk.set("2026-03-04T09:00:00Z");
    await C.completeWork(W1.tech, id, "Motor replaced and tested under load.");
    clk.set("2026-03-04T09:30:00Z");
    await C.closeCase(W1.ops, id, "Verified complete; customer informed.");
    d = await C.getCase(W1.eng, id);
    assert.equal(d.case.status, "closed");
    assert.equal(d.case.first_response_at!.toISOString(), "2026-03-01T08:45:00.000Z");
    assert.equal(d.case.closed_at!.toISOString(), "2026-03-04T09:30:00.000Z");
    // every step is on the timeline, in order, with actor and time
    assert.deepEqual(d.events.map((e) => e.kind), ["created", "assign", "start", "submit", "return_info", "evidence_uploaded", "submit", "evidence_visibility_changed", "request_approval", "approval_reminded", "decide", "complete_work", "close"]);
    assert.ok(d.events.every((e) => e.actor_name));
    const obs = d.notes.find((n) => n.kind === "observation" && n.body.startsWith("Motor winding"))!;
    assert.equal(obs.observed_at!.toISOString(), "2026-03-01T09:55:00.000Z");
    assert.equal(obs.created_at.toISOString(), "2026-03-01T10:30:00.000Z"); // server receipt time kept separately
    assert.equal(d.evidence[0].original_name.includes("/"), false);
    // closed cases accept no further comments
    assert.equal(await code(C.addComment(W1.eng, id, "late")), "case_closed");
    // chain still intact after all of this
    await withTx({ companyId: W1.companyId }, async (db) => assert.deepEqual(await verifyChain(db), { ok: true, checked: (await db.one<{ n: string }>("select count(*) n from audit_log"))!.n ? Number((await db.one<{ n: string }>("select count(*) n from audit_log"))!.n) : 0 }));
    clock.now = realNow;
  });

  test("customer rejection, query and engineer response loops; deferral", async () => {
    const id = await newCase(W1);
    await C.startWork(W1.tech, id); await C.submitForReview(W1.tech, id, { observation: "obs" });
    await C.requestApproval(W1.eng, id, { summary: "Please approve" });
    assert.equal(await code(C.decideApproval(W1.cust, id, "rejected", "")), "validation");
    await C.decideApproval(W1.cust, id, "info_requested", "What is the total cost?");
    assert.equal((await C.getCase(W1.cust, id)).case.status, "customer_query");
    await C.respondToQuery(W1.eng, id, "Quote attached separately; no cost until you approve.");
    assert.equal((await C.getCase(W1.cust, id)).approvals[0].status, "pending");
    await C.decideApproval(W1.cust, id, "rejected", "Too expensive this quarter");
    const d = await C.getCase(W1.eng, id);
    assert.equal(d.case.status, "rejected");
    assert.equal(d.approvals[0].decision_reason, "Too expensive this quarter");
    await C.deferCase(W1.eng, id, "Revisit next quarter", "2026-07-01");
    assert.equal((await C.getCase(W1.eng, id)).case.status, "deferred");
    await C.reopenCase(W1.eng, id, "Customer asked to revisit");
    assert.equal((await C.getCase(W1.eng, id)).case.status, "pending_review");
  });

  test("decided approvals are immutable at the database level", async () => {
    const id = await newCase(W1);
    await C.startWork(W1.tech, id); await C.submitForReview(W1.tech, id, { observation: "obs" });
    await C.requestApproval(W1.eng, id, { summary: "Approve" });
    await C.decideApproval(W1.cust, id, "approved", "");
    await assert.rejects(withTx({ companyId: W1.companyId }, (db) => db.q("update approval_requests set status = 'rejected' where case_id = $1", [id])), /immutable/);
  });
});

describe("evidence", () => {
  test("rejects disguised, empty and oversized files; stores a sha-256", async () => {
    const id = await newCase(W1); await C.startWork(W1.tech, id);
    assert.equal(await code(C.uploadEvidence(W1.tech, id, { name: "x.png", data: Buffer.from("<script>alert(1)</script>") })), "file_type_not_allowed");
    assert.equal(await code(C.uploadEvidence(W1.tech, id, { name: "x.png", data: Buffer.alloc(0) })), "file_empty");
    assert.equal(await code(C.uploadEvidence(W1.tech, id, { name: "x.png", data: Buffer.concat([PNG, Buffer.alloc(11 * 1024 * 1024)]) })), "file_too_large");
    const ev = await C.uploadEvidence(W1.tech, id, { name: "a.png", data: PNG });
    const row = (await ownerSql("select sha256, mime, storage_key from evidence where id=$1", [ev]))[0];
    assert.equal(row.mime, "image/png"); assert.match(row.sha256, /^[0-9a-f]{64}$/); assert.ok(!row.storage_key.includes("a.png"));
  });
  test("customers only download evidence shared with them; other tenants cannot", async () => {
    const id = await newCase(W1); await C.startWork(W1.tech, id);
    const ev = await C.uploadEvidence(W1.tech, id, { name: "a.png", data: PNG });
    await C.submitForReview(W1.tech, id, { observation: "obs" });
    await C.requestApproval(W1.eng, id, { summary: "Approve" });
    assert.equal(await code(C.readEvidence(W1.cust, ev)), "not_found");
    assert.equal(await code(C.readEvidence(W2.eng, ev)), "not_found");
    await C.shareEvidence(W1.eng, ev, "customer");
    assert.deepEqual((await C.readEvidence(W1.cust, ev)).data, PNG);
    assert.equal(await code(C.shareEvidence(W1.cust, ev, "internal")), "forbidden");
  });
  test("evidence is immutable and tampered files are detected", async () => {
    const id = await newCase(W1); await C.startWork(W1.tech, id);
    const ev = await C.uploadEvidence(W1.tech, id, { name: "a.png", data: PNG });
    await assert.rejects(withTx({ companyId: W1.companyId }, (db) => db.q("update evidence set sha256 = 'x' where id = $1", [ev])), /immutable|permission/);
    await assert.rejects(withTx({ companyId: W1.companyId }, (db) => db.q("delete from evidence where id = $1", [ev])), /permission denied|cannot be deleted/);
    const key = (await ownerSql("select storage_key from evidence where id=$1", [ev]))[0].storage_key;
    await blobStore.get(key);
    const { writeFile } = await import("node:fs/promises"); const { resolve } = await import("node:path");
    await writeFile(resolve(process.cwd(), ".data/test-uploads", key), Buffer.concat([PNG, Buffer.from("tampered")]));
    assert.equal(await code(C.readEvidence(W1.eng, ev)), "integrity_failure");
  });
});

describe("audit history", () => {
  test("hash chain verifies, is append-only for the app role, and detects tampering", async () => {
    await withTx({ companyId: W1.companyId }, async (db) => assert.equal((await verifyChain(db)).ok, true));
    await assert.rejects(withTx({ companyId: W1.companyId }, (db) => db.q("update audit_log set action = 'x'")), /permission denied|append-only/);
    await assert.rejects(withTx({ companyId: W1.companyId }, (db) => db.q("delete from audit_log")), /permission denied|append-only/);
    // simulate an attacker with owner access who disables the trigger and edits a row
    await ownerSql("alter table audit_log disable trigger audit_no_mutation");
    await ownerSql("update audit_log set actor_id = null where chain = $1 and seq = 3", [W1.companyId]);
    await ownerSql("alter table audit_log enable trigger audit_no_mutation");
    const v = await withTx({ companyId: W1.companyId }, (db) => verifyChain(db));
    assert.equal(v.ok, false); assert.equal(v.brokenAtSeq, 3);
    // company 2's chain is unaffected
    await withTx({ companyId: W2.companyId }, async (db) => assert.equal((await verifyChain(db)).ok, true));
  });
});

describe("authentication", () => {
  test("wrong password is generic and rate-limited; locked accounts stay locked", async () => {
    const { admin } = await makeCompany(plat, "gamma");
    const email = admin.email;
    for (let i = 0; i < 5; i++) assert.deepEqual(await A.login(email, "wrong password!!", { ip: "9.9.9.9" }), { ok: false, code: "invalid_credentials" });
    assert.deepEqual(await A.login(email, PASSWORD, { ip: "9.9.9.9" }), { ok: false, code: "rate_limited" });
    assert.deepEqual(await A.login(email, PASSWORD, { ip: "1.1.1.1" }), { ok: false, code: "rate_limited" }, "limit is per account, not only per IP");
    assert.deepEqual(await A.login("nobody@nowhere.test", "x", { ip: "8.8.8.8" }), { ok: false, code: "invalid_credentials" });
    freezeClock(new Date(Date.now() + 16 * 60_000).toISOString());
    assert.equal((await A.login(email, PASSWORD, { ip: "9.9.9.9" })).ok, true, "limit window passes");
    clock.now = realNow;
  });
  test("sessions expire when idle and when revoked; deactivation signs the user out", async () => {
    const u = await addUser(W1.admin, "alpha", "engineer", "sess");
    const r = await A.login(u.email, PASSWORD, { ip: "s1" });
    assert.ok(r.ok);
    const token = (r as { token: string }).token;
    assert.ok(await A.resolveSession(token));
    const clk = freezeClock(new Date(Date.now() + 9 * 3600_000).toISOString());
    assert.equal(await A.resolveSession(token), null, "idle timeout");
    clock.now = realNow; void clk;
    const r2 = await A.login(u.email, PASSWORD, { ip: "s1" }) as { ok: true; token: string };
    await A.deactivateUser(W1.admin, u.userId);
    assert.equal(await A.resolveSession(r2.token), null);
    assert.deepEqual(await A.login(u.email, PASSWORD, { ip: "s2" }), { ok: false, code: "invalid_credentials" });
  });
  test("invite and reset tokens are single-use and expire; reset revokes sessions", async () => {
    const { token } = await A.inviteUser(W1.admin, { email: "late@alpha.test", name: "Late", role: "engineer" });
    assert.equal((await A.inspectToken(token, "invite")).valid, true);
    assert.deepEqual(await A.consumeToken(token, "invite", "short"), { ok: false, code: "password_short" });
    assert.deepEqual(await A.consumeToken(token, "invite", PASSWORD), { ok: true });
    assert.deepEqual(await A.consumeToken(token, "invite", PASSWORD), { ok: false, code: "token_invalid" });
    const old = await ownerSql("select token_hash from user_tokens limit 1");
    assert.ok(old[0].token_hash.length === 64, "tokens stored hashed");
    const { token: t2 } = await A.inviteUser(W1.admin, { email: "exp@alpha.test", name: "Exp", role: "engineer" });
    const clk = freezeClock(new Date(Date.now() + 73 * 3600_000).toISOString());
    assert.equal((await A.inspectToken(t2, "invite")).valid, false); clk.advance(0); clock.now = realNow;
    const login1 = await A.login("late@alpha.test", PASSWORD, { ip: "r1" }) as { ok: true; token: string };
    await A.requestPasswordReset("late@alpha.test", "r1");
    const mail = await ownerSql("select body from email_outbox where to_email='late@alpha.test' order by created_at desc limit 1");
    assert.match(mail[0].body, /\/app\/reset\//); // dev environment: transport not configured, body kept for local use
    const tk = mail[0].body.match(/reset\/([\w-]+)/)[1];
    assert.deepEqual(await A.consumeToken(tk, "reset", "a brand new passphrase"), { ok: true });
    assert.equal(await A.resolveSession(login1.token), null, "reset revokes sessions");
    assert.ok((await A.login("late@alpha.test", "a brand new passphrase", { ip: "r1" })).ok);
    await A.requestPasswordReset("ghost@nowhere.test", "r1"); // no error, no enumeration
  });
  test("optional MFA: TOTP required after enrolment", async () => {
    const u = await addUser(W1.admin, "alpha", "engineer", "mfa");
    const { secret } = await A.beginMfaEnrollment(u);
    assert.equal(await A.confirmMfaEnrollment(u, "000000"), false);
    assert.equal(await A.confirmMfaEnrollment(u, totpAt(secret, Date.now())), true);
    const r = await A.login(u.email, PASSWORD, { ip: "m1" }) as { ok: true; token: string; mfaRequired: boolean };
    assert.equal(r.mfaRequired, true);
    assert.equal((await A.resolveSession(r.token))!.mfaVerified, false);
    assert.equal(await A.verifyMfaForSession(r.token, "123456"), false);
    assert.equal(await A.verifyMfaForSession(r.token, totpAt(secret, Date.now())), true);
    assert.equal((await A.resolveSession(r.token))!.mfaVerified, true);
    const stored = (await ownerSql("select mfa_secret_enc from users where email=$1", [u.email]))[0].mfa_secret_enc;
    assert.ok(!stored.includes(secret), "MFA secret encrypted at rest");
  });
  test("passwords are stored as scrypt hashes", async () => {
    const rows = await ownerSql("select password_hash from users where password_hash is not null");
    assert.ok(rows.every((r) => r.password_hash.startsWith("scrypt$") && !r.password_hash.includes(PASSWORD)));
  });
});

describe("dashboard traceability and notifications", () => {
  test("every dashboard count equals the number of records behind it", async () => {
    const dsh = await dashboard(W1.ops);
    for (const m of METRICS) assert.equal(dsh.counts[m], (await C.listCases(W1.ops, { metric: m, limit: 200 })).length, m);
    assert.ok(dsh.counts.open > 0);
    assert.equal(await code(dashboard(W1.tech)), "forbidden");
    assert.equal(await code(dashboard(W1.cust)), "forbidden");
  });
  test("overdue uses the recorded SLA deadline; approvals show elapsed time from timestamps", async () => {
    const clk = freezeClock("2026-05-01T08:00:00Z");
    const id = await newCase(W1, { priority: "urgent", assignedTo: null });
    clk.set("2026-05-01T10:00:00Z");
    assert.ok((await C.listCases(W1.ops, { metric: "response_overdue" })).some((c) => c.id === id));
    assert.ok(!(await C.listCases(W1.ops, { metric: "overdue" })).some((c) => c.id === id));
    clk.set("2026-05-01T17:00:00Z");
    assert.ok((await C.listCases(W1.ops, { metric: "overdue" })).some((c) => c.id === id));
    assert.ok((await C.listCases(W1.ops, { metric: "unassigned" })).some((c) => c.id === id));
    clock.now = realNow;
  });
  test("notifications go to the right people, once, with a queued email record", async () => {
    const id = await newCase(W1, { assignedTo: null });
    await C.assignCase(W1.ops, id, W1.tech.userId);
    assert.ok((await C.listNotifications(W1.tech)).some((n) => n.kind === "assigned" && n.case_id === id));
    await C.startWork(W1.tech, id); await C.submitForReview(W1.tech, id, { observation: "obs" });
    assert.ok((await C.listNotifications(W1.eng)).some((n) => n.kind === "submitted" && n.case_id === id));
    assert.ok(!(await C.listNotifications(W1.tech)).some((n) => n.kind === "submitted"));
    await C.requestApproval(W1.eng, id, { summary: "Approve" });
    assert.ok((await C.listNotifications(W1.cust)).some((n) => n.kind === "approval_requested"));
    assert.ok(!(await C.listNotifications(W2.cust)).some((n) => n.case_id === id));
    await C.decideApproval(W1.cust, id, "approved", "");
    assert.ok((await C.listNotifications(W1.eng)).some((n) => n.kind === "approval_decided"));
    const mails = await ownerSql("select status from email_outbox where company_id=$1", [W1.companyId]);
    assert.ok(mails.length > 0 && mails.every((m) => m.status === "not_configured"), "no email is reported as sent without a transport");
  });
});
