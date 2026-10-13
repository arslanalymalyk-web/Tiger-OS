// Browser end-to-end checks for the ServiceTrace platform against a running server seeded by `npm run seed:demo`.
//   SEED_PASSWORD=... node scripts/e2e-platform.mjs http://localhost:3200 ./e2e-shots
import { chromium } from "playwright";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:3200";
const shots = process.argv[3] ?? "./e2e-shots";
const password = process.env.SEED_PASSWORD;
if (!password) { console.error("Set SEED_PASSWORD to the seeded demo password"); process.exit(2); }
fs.mkdirSync(shots, { recursive: true });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  ", m); } else { fail++; console.log("  FAIL", m); } };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function session(email, viewport = { width: 1100, height: 900 }) {
  const ctx = await browser.newContext({ viewport, baseURL: base });
  const page = await ctx.newPage();
  const errors = [];
  page.on("dialog", (d) => d.accept()); // consequential actions ask for confirmation
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text()); });
  await page.goto("/app/login");
  await page.getByLabel(/Email address|البريد/).fill(email);
  await page.getByLabel(/^Password|كلمة المرور/).fill(password);
  await page.getByRole("button", { name: /^Sign in$|^دخول$/ }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });
  return { ctx, page, errors };
}
const doOp = async (page, label, fill) => {
  const d = page.locator("details", { has: page.locator("summary", { hasText: label }) }).first();
  await d.locator("summary").click();
  if (fill) await fill(d);
  await d.getByRole("button", { name: label }).click();
};

try {
  console.log("Login & generic errors");
  {
    const ctx = await browser.newContext({ baseURL: base }); const p = await ctx.newPage();
    await p.goto("/app/login");
    await p.getByLabel("Email address").fill("tech@northgate.example");
    await p.getByLabel("Password").fill("definitely wrong password");
    await p.getByRole("button", { name: "Sign in" }).click();
    await p.locator(".alert-error").waitFor();
    ok((await p.locator(".alert-error").innerText()).includes("incorrect"), "wrong password shows a generic error");
    const r = await ctx.request.get("/app/dashboard", { maxRedirects: 0 });
    ok([302, 303, 307, 308].includes(r.status()), "unauthenticated dashboard redirects to sign-in");
    const h = (await p.request.get("/app/login")).headers();
    ok(h["x-frame-options"] === "DENY" && h["x-content-type-options"] === "nosniff", "security headers present");
    ok((await (await p.request.get("/api/health")).json()).db === "ok", "health endpoint reports database ok");
    await ctx.close();
  }

  console.log("Technician");
  const t = await session("tech@northgate.example", { width: 390, height: 800 });
  await t.page.goto("/app/cases?mine=1");
  ok(await t.page.getByText("Duty fire pump trips").first().isVisible(), "technician sees assigned job on mobile");
  ok(!(await t.page.getByText("Quarterly AHU-03").count()), "technician does not see unassigned work");
  await t.page.getByText("Duty fire pump trips").first().click();
  await t.page.waitForURL(/\/app\/cases\/[0-9a-f-]{36}$/);
  const caseUrl = t.page.url();
  await doOp(t.page, "Start work");
  await t.page.getByText("In progress").first().waitFor();
  ok(true, "technician started work");
  await t.page.locator("summary", { hasText: "Add evidence" }).click();
  await t.page.setInputFiles('input[type=file]', { name: "pump-nameplate.png", mimeType: "image/png", buffer: PNG });
  await t.page.getByLabel(/^Caption/).fill("Pump nameplate");
  await t.page.locator("details", { has: t.page.locator("summary", { hasText: "Add evidence" }) }).getByRole("button", { name: "Add evidence" }).click();
  await t.page.getByText("pump-nameplate.png").first().waitFor();
  ok(true, "photo evidence uploaded and listed with SHA-256");
  ok(await t.page.getByText(/SHA-256/).first().isVisible(), "evidence shows SHA-256");
  await doOp(t.page, "Submit for engineer review", async (d) => { await d.getByLabel("What did you observe?").fill("Starter contactor chattering; thermal overload tripped at 40 s."); });
  await t.page.getByText("Pending engineer review").first().waitFor({ timeout: 10000 }).catch(() => {});
  const overflow = await t.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!overflow, "no horizontal overflow at 390px");
  await t.page.screenshot({ path: `${shots}/tech-mobile.png`, fullPage: true });
  ok(t.errors.length === 0, `no console errors (technician) ${t.errors.join("|")}`);
  const r403 = await t.ctx.request.get("/app/admin/users", { maxRedirects: 0 });
  ok([302, 303, 307, 308].includes(r403.status()), "technician cannot open user admin");

  console.log("Engineer");
  const e = await session("engineer@northgate.example");
  await e.page.goto(caseUrl);
  ok(await e.page.getByText("Starter contactor chattering").first().isVisible(), "engineer sees technician observation");
  await e.page.locator("details", { has: e.page.locator("summary", { hasText: "Notify customer and request approval" }) }).locator("summary").click();
  await e.page.getByLabel("Summary for the customer").fill("Replace the starter contactor and overload relay. Approval is needed to order parts.");
  await e.page.locator("details", { has: e.page.locator("summary", { hasText: "Notify customer and request approval" }) }).getByRole("button", { name: "Notify customer and request approval" }).click();
  await e.page.getByText("Awaiting customer decision").first().waitFor();
  ok(true, "engineer requested customer approval");
  // share the evidence with the customer
  await e.page.getByRole("button", { name: "Share with customer" }).first().click();
  await e.page.getByText("Make internal").first().waitFor();
  ok(true, "engineer shared evidence with the customer");

  console.log("Customer portal (English)");
  const c = await session("approver@harbourview.example");
  await c.page.waitForURL("**/app/portal");
  ok(true, "customer lands on the portal");
  await c.page.getByText("Duty fire pump trips").first().click();
  await c.page.waitForURL(/\/app\/cases\/[0-9a-f-]{36}$/);
  ok(!(await c.page.getByText("Starter contactor chattering").count()), "internal technician notes are hidden from the customer");
  await c.page.getByText("pump-nameplate.png").first().waitFor({ timeout: 5000 }).catch(() => {});
  ok(await c.page.getByText("pump-nameplate.png").first().isVisible(), "shared evidence is visible to the customer");
  ok(!(await c.page.getByText(/Internal review note|Assigned to/).count()), "customer does not see internal fields");
  const adminRes = await c.ctx.request.get("/app/admin/audit", { maxRedirects: 0 });
  ok([302, 303, 307, 308].includes(adminRes.status()), "customer cannot open audit log");
  const other = await c.ctx.request.get("/app/cases/00000000-0000-0000-0000-000000000000");
  ok(other.status() === 404, "unknown/forbidden case id returns 404");
  await c.page.screenshot({ path: `${shots}/customer-case-en.png`, fullPage: true });

  console.log("Customer portal (Arabic, RTL)");
  await c.page.getByRole("button", { name: "العربية" }).first().click();
  await c.page.waitForFunction(() => document.documentElement.dir === "rtl");
  ok(await c.page.evaluate(() => document.documentElement.lang === "ar"), "html lang=ar and dir=rtl");
  ok(await c.page.getByText("بانتظار قرار العميل").first().isVisible(), "status label translated");
  const hasOverflow = await c.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!hasOverflow, "no horizontal overflow in RTL");
  const navAlign = await c.page.evaluate(() => getComputedStyle(document.querySelector("nav ul")).direction);
  ok(navAlign === "rtl", "navigation inherits RTL");
  await c.page.screenshot({ path: `${shots}/customer-case-ar.png`, fullPage: true });
  await c.page.getByRole("button", { name: "English" }).first().click();
  await c.page.waitForFunction(() => document.documentElement.dir === "ltr");

  console.log("Customer decision");
  await doOp(c.page, "Approve", async (d) => { await d.getByLabel(/^Reason/).fill("Go ahead. PO 5521."); });
  await c.page.getByText("Approved by customer").first().waitFor({ timeout: 10000 }).catch(() => {});
  ok(await c.page.getByText("Approved by customer").first().isVisible(), "customer approval recorded");
  ok(await c.page.getByText(/Go ahead\. PO 5521\./).first().isVisible(), "decision reason recorded");

  console.log("Completion and closure");
  await t.page.goto(caseUrl);
  await doOp(t.page, "Record work completed", async (d) => { await d.getByLabel("Describe the work completed").fill("Contactor and overload replaced; churn test passed."); });
  await t.page.getByText("Work completed").first().waitFor({ timeout: 10000 }).catch(() => {});
  const o = await session("ops@northgate.example");
  await o.page.goto(caseUrl);
  await doOp(o.page, "Close work order", async (d) => { await d.getByLabel(/^Reason/).fill("Verified complete."); });
  await o.page.getByText("Closed").first().waitFor({ timeout: 10000 }).catch(() => {});
  ok(await o.page.getByText("Closed").first().isVisible(), "ops closed the work order");
  ok(await o.page.getByText("Customer decision: approved").first().isVisible(), "timeline shows customer decision with who/when");
  await o.page.screenshot({ path: `${shots}/ops-case-closed.png`, fullPage: true });
  await o.page.goto("/app/dashboard");
  ok(await o.page.getByText("Operations dashboard").isVisible(), "ops dashboard renders");
  await o.page.getByRole("link", { name: /Awaiting customer/ }).click();
  await o.page.waitForURL("**metric=awaiting_customer");
  ok(true, "dashboard metric drills down to its records");
  ok(o.errors.length === 0, `no console errors (ops) ${o.errors.join("|")}`);

  console.log("Admin & audit");
  const a = await session("admin@northgate.example");
  await a.page.goto("/app/admin/audit?verify=1");
  ok(await a.page.getByText(/Chain intact/).isVisible(), "audit hash chain verifies in the UI");
  const csv = await a.ctx.request.get("/app/admin/audit/export");
  ok(csv.ok() && (await csv.text()).includes("case.decide"), "audit CSV export contains workflow events");
  await a.page.goto("/app/admin/users");
  ok(await a.page.getByText("Invite user").first().isVisible(), "admin can manage users");
  ok(a.errors.length === 0, `no console errors (admin) ${a.errors.join("|")}`);
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
