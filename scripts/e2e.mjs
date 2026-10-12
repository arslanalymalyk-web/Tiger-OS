/* Browser verification for Stage 1. Usage: npm run build && npm start -- -p 3100 & node scripts/e2e.mjs [baseUrl] [screenshotDir]
   Requires Playwright with a Chromium install (PLAYWRIGHT_BROWSERS_PATH). */
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/node-tools/node_modules/playwright"); }
const BASE = process.argv[2] ?? "http://localhost:3100";
const SHOTS = process.argv[3] ?? "./e2e-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const SECTORS = [
  ["energy", "Energy & Oil and Gas"], ["banking", "Banking & Fintech"], ["insurance", "Insurance"], ["manufacturing", "Manufacturing"],
  ["logistics", "Supply Chain & Logistics"], ["realestate", "Real Estate"], ["infrastructure", "Infrastructure"], ["sovereign", "Sovereign Capital"],
];
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  return { ctx, page };
}
const drawerId = async (page, expected) => {
  // The drawer updates after an async router transition; wait for the expected ID when given.
  if (expected) await page.waitForFunction((id) => document.querySelector('[role="dialog"][aria-label="Record detail"] header code')?.textContent?.trim() === id, expected, { timeout: 5000 }).catch(() => {});
  else await page.waitForSelector('[role="dialog"][aria-label="Record detail"] header code', { timeout: 5000 }).catch(() => {});
  return (await page.locator('[role="dialog"][aria-label="Record detail"] header code').first().textContent().catch(() => null))?.trim();
};

{
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  // ---- Entries
  await page.goto(BASE + "/");
  check("Main entry renders 'Enter demonstration'", await page.getByRole("button", { name: "Enter demonstration" }).isVisible());
  check("Main entry labels access as simulated", (await page.locator("body").innerText()).includes("Simulated access"));
  await page.screenshot({ path: `${SHOTS}/entry-main.png` });
  for (const v of ["energy", "banking"]) {
    await page.goto(`${BASE}/entry/${v}`);
    check(`Entry variant ${v}: button present and simulated labelling`, (await page.getByRole("button", { name: "Enter demonstration" }).isVisible()) && (await page.locator("body").innerText()).includes("simulated"));
    await page.screenshot({ path: `${SHOTS}/entry-${v}.png` });
    await page.getByRole("button", { name: "Enter demonstration" }).click();
    await page.waitForURL(`**/sector/${v}`);
    check(`Entry variant ${v} converges on /sector/${v}`, (await page.locator("h1").innerText()).toLowerCase().includes("command centre"));
  }
  // ---- Main entry → workspaces, with role pick
  await page.goto(BASE + "/");
  await page.getByText("Approver", { exact: true }).first().click();
  await page.getByRole("button", { name: "Enter demonstration" }).click();
  await page.waitForURL("**/workspaces");
  check("Workspaces lists all 8 sectors", (await page.locator('[data-testid^="workspace-"]').count()) === 8);
  check("Branded entry links reachable from sector selection", (await page.locator('a[href="/entry/energy"]').count()) > 0 && (await page.locator('a[href="/entry/banking"]').count()) > 0);
  check("Role chosen at entry persisted (Approver)", (await page.getByLabel("Simulated demonstration role").inputValue()) === "Approver");
  await page.screenshot({ path: `${SHOTS}/workspaces.png` });

  // ---- All eight command centres
  for (const [id, name] of SECTORS) {
    await page.goto(`${BASE}/workspaces`);
    await page.locator(`[data-testid="workspace-${id}"] a[href="/sector/${id}"]`).click();
    await page.waitForURL(`**/sector/${id}`);
    await page.waitForSelector("figure svg");
    const body = await page.locator("main").innerText();
    const m = await page.locator('[data-testid^="metric-"]').count();
    const f = await page.locator("main figure").count();
    const s = await page.locator('[data-testid^="signal-"]').count();
    const c = await page.locator('[data-testid^="case-"]').count();
    const d = await page.locator('[data-testid^="decision-"]').count();
    check(`Command centre ${id}: heading, 4 metrics, 2 charts, ≥3 signals, ≥2 cases, ≥2 decisions, activity`,
      body.toLowerCase().includes(name.toLowerCase()) && m === 4 && f === 2 && s >= 3 && c >= 2 && d >= 2 && /recent activity/i.test(body) && /mandate summary/i.test(body), `m=${m} f=${f} s=${s} c=${c} d=${d}`);
    check(`Command centre ${id}: demonstration indicator visible`, (await page.locator("header").first().innerText()).includes("Demonstration data"));
    const labels = await page.locator("main figure svg text").allInnerTexts();
    check(`Command centre ${id}: charts have axis labels`, labels.length > 6);
    await page.screenshot({ path: `${SHOTS}/sector-${id}.png`, fullPage: true });
  }

  // ---- Sector switching via selector updates dashboard
  await page.goto(`${BASE}/sector/energy`);
  await page.getByRole("button", { name: /Sector/ }).first().click();
  await page.getByRole("button", { name: "Insurance" }).click();
  await page.waitForURL("**/sector/insurance");
  check("Sector selector switches dashboard", (await page.locator("h1").innerText()).includes("Insurance"));

  // ---- Signal → case → decision navigation
  await page.goto(`${BASE}/sector/energy`);
  await page.locator('[data-testid="signal-SIG-ENR-01"]').click();
  check("Signal opens drawer", (await drawerId(page)) === "SIG-ENR-01");
  const dlg = page.locator('[role="dialog"][aria-label="Record detail"]');
  await dlg.getByRole("button", { name: /Wadi hub concentration and export redundancy/ }).first().click();
  check("Signal → linked case", (await drawerId(page, "CAS-ENR-01")) === "CAS-ENR-01");
  await dlg.getByRole("button", { name: /Approve feasibility study/ }).first().click();
  check("Case → linked decision", (await drawerId(page, "DEC-ENR-01")) === "DEC-ENR-01");
  const dtxt = await dlg.innerText();
  check("Decision shows IDs, assumptions, evidence refs, and stage boundary", /assumptions/i.test(dtxt) && dtxt.includes("EVD-ENR-01") && dtxt.includes("Stage 6"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("Escape closes drawer", (await dlg.count()) === 0);
  // metric drawer
  await page.locator('[data-testid="metric-MET-ENR-02"]').click();
  await drawerId(page, "MET-ENR-02");
  const mt = await dlg.innerText();
  check("Metric drawer shows formula, period and contributing records", /formula/i.test(mt) && mt.includes("Sep 2026") && mt.includes("ENT-ENR-04") && mt.includes("60.4"));
  await page.keyboard.press("Escape");

  // ---- Search
  const search = page.getByLabel("Search seeded demonstration records");
  await search.fill("Sahil");
  await page.getByRole("option").first().click();
  check("Search result opens record", /^(SIG|ENT|CAS|DEC)-/.test((await drawerId(page)) ?? ""));
  await page.keyboard.press("Escape");
  await search.fill("SIG-LOG-01");
  await page.getByRole("option").first().click();
  check("Search by ID opens that record and switches sector", (await drawerId(page, "SIG-LOG-01")) === "SIG-LOG-01" && page.url().includes("/sector/logistics"));
  await page.keyboard.press("Escape");
  await search.fill("zzzzzz");
  check("Search shows empty state", (await page.locator("#search-results").innerText()).includes("No seeded record"));
  await search.fill("");

  // ---- Notifications & persistence
  await page.goto(`${BASE}/overview`);
  const unread = async () => Number((await page.getByTestId("unread-count").textContent()) ?? 0);
  const startUnread = await unread();
  await page.getByRole("button", { name: /Notifications/ }).click();
  await page.getByText("Critical signal: Western trucking delays").click();
  check("Notification opens relevant record", (await drawerId(page)) === "SIG-LOG-01");
  await page.keyboard.press("Escape");
  check("Notification marked read (count decreased)", (await unread()) === startUnread - 1, `${startUnread} → ${await unread()}`);
  await page.reload();
  await page.waitForSelector('[data-testid="unread-count"]');
  check("Unread state persists across reload", (await unread()) === startUnread - 1);
  await page.getByLabel("Simulated demonstration role").selectOption("Expert");
  await page.reload();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Simulated demonstration role"]')?.value === "Expert", null, { timeout: 5000 }).catch(() => {});
  check("Role persists across reload", (await page.getByLabel("Simulated demonstration role").inputValue()) === "Expert");
  // role-aware focus panel
  await page.goto(`${BASE}/sector/energy`);
  await page.waitForFunction(() => document.querySelector('section[aria-label="Role focus"]')?.textContent?.includes("Expert focus"), null, { timeout: 5000 }).catch(() => {});
  check("Expert focus panel shows cases requesting expert input", (await page.locator('section[aria-label="Role focus"]').innerText()).includes("Expert focus"));
  await page.getByLabel("Simulated demonstration role").selectOption("Approver");
  await page.waitForFunction(() => document.querySelector('section[aria-label="Role focus"]')?.textContent?.includes("Approver focus"), null, { timeout: 5000 }).catch(() => {});
  check("Approver focus panel shows decisions", (await page.locator('section[aria-label="Role focus"]').innerText()).includes("decisions awaiting"));

  // ---- Overview totals
  await page.goto(`${BASE}/overview`);
  check("Overview group capital total shown and equals 262,330", (await page.getByTestId("group-capital-total").innerText()).trim() === "262,330");
  await page.screenshot({ path: `${SHOTS}/overview.png`, fullPage: true });
  for (const p of ["/methodology", "/roadmap"]) { await page.goto(BASE + p); check(`${p} renders`, (await page.locator("h1").count()) === 1); }

  // ---- About + reset
  await page.getByRole("button", { name: "About this prototype" }).click();
  check("About panel states scope", (await page.getByRole("dialog", { name: "About this prototype" }).innerText()).includes("no live feeds"));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Reset demonstration" }).first().click();
  await page.getByRole("dialog", { name: "Reset demonstration?" }).getByRole("button", { name: "Reset demonstration" }).click();
  await page.waitForURL("**/workspaces");
  await page.waitForTimeout(300);
  check("Reset restores seeded state (all unread, Analyst)", (await unread()) === 11 && (await page.getByLabel("Simulated demonstration role").inputValue()) === "Analyst", `unread=${await unread()}`);
  await page.reload();
  check("Reset state persists (no stale storage)", (await unread()) === 11);
  // reset cancel path
  await page.getByRole("button", { name: "Reset demonstration" }).first().click();
  await page.getByRole("button", { name: "Cancel" }).click();
  check("Reset confirmation can be cancelled", (await page.getByRole("dialog", { name: "Reset demonstration?" }).count()) === 0);
  await ctx.close();
}

// ---- Mobile layout
{
  const { ctx, page } = await newPage({ width: 390, height: 844 });
  const paths = ["/", "/entry/energy", "/entry/banking", "/workspaces", "/overview", "/methodology", "/roadmap", ...SECTORS.map(([id]) => `/sector/${id}`)];
  for (const p of paths) {
    await page.goto(BASE + p);
    await page.waitForTimeout(250);
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    check(`Mobile no horizontal overflow ${p}`, w.sw <= w.iw + 1, `scrollWidth=${w.sw} innerWidth=${w.iw}`);
  }
  await page.goto(BASE + "/sector/banking");
  await page.waitForSelector("figure svg");
  await page.screenshot({ path: `${SHOTS}/mobile-banking.png`, fullPage: true });
  await page.getByRole("button", { name: "Open navigation" }).click();
  check("Mobile navigation drawer opens", await page.getByRole("navigation", { name: "Primary" }).isVisible());
  await page.screenshot({ path: `${SHOTS}/mobile-nav.png` });
  await page.getByRole("link", { name: "Insurance" }).first().click();
  await page.waitForURL("**/sector/insurance");
  await page.locator('[data-testid^="signal-"]').first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/mobile-drawer.png` });
  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check("Mobile drawer no horizontal overflow", w.sw <= w.iw + 1);
  await page.goto(BASE + "/entry/energy"); await page.screenshot({ path: `${SHOTS}/mobile-entry-energy.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
const filtered = errors.filter((e) => !/favicon/.test(e));
check("No console or page errors", filtered.length === 0, filtered.slice(0, 5).join(" | "));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
