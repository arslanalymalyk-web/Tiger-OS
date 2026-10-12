/* Captures the review screenshot package. Usage: node scripts/review-shots.mjs [baseUrl] [outDir] */
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/node-tools/node_modules/playwright"); }
const BASE = process.argv[2] ?? "http://localhost:3100";
const OUT = process.argv[3] ?? "./review/screenshots";
fs.mkdirSync(OUT, { recursive: true });
const SECTORS = ["energy", "banking", "insurance", "manufacturing", "logistics", "realestate", "infrastructure", "sovereign"];
const browser = await pw.chromium.launch();
for (const [label, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  const shot = async (name, full = true) => { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}/${label}-${name}.jpg`, type: "jpeg", quality: 70, fullPage: full }); };
  for (const [name, path] of [["entry-main", "/"], ["entry-energy", "/entry/energy"], ["entry-banking", "/entry/banking"]]) { await page.goto(BASE + path); await shot(name); }
  await page.goto(BASE + "/"); await page.getByRole("button", { name: "Enter demonstration" }).click(); await page.waitForURL("**/workspaces");
  await shot("workspaces");
  await page.goto(BASE + "/overview"); await page.waitForSelector("figure svg"); await shot("overview");
  for (const s of SECTORS) { await page.goto(`${BASE}/sector/${s}`); await page.waitForSelector("figure svg"); await shot(`sector-${s}`); }
  await page.goto(`${BASE}/sector/energy`);
  await page.getByLabel("Search seeded demonstration records").fill("Sahil"); await shot("search-open", false);
  await page.keyboard.press("Escape"); await page.getByLabel("Search seeded demonstration records").fill("");
  await page.getByRole("button", { name: /Notifications/ }).click(); await shot("notifications-open", false); await page.keyboard.press("Escape");
  await page.locator('[data-testid="signal-SIG-ENR-01"]').click(); await shot("drawer-signal", false);
  await page.locator('[role="dialog"][aria-label="Record detail"]').getByRole("button", { name: /Wadi hub concentration/ }).first().click(); await page.waitForTimeout(300); await shot("drawer-case", false);
  await page.keyboard.press("Escape");
  await page.locator('[data-testid="metric-MET-ENR-02"]').click(); await shot("drawer-metric", false); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "About this prototype" }).click(); await shot("about", false); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Reset demonstration" }).first().click(); await shot("reset-confirm", false);
  await ctx.close();
}
await browser.close();
console.log("screenshots written to", OUT);
