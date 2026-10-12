/* Automated accessibility scan with axe-core (WCAG 2.0/2.1 A + AA rules) across pages and open-overlay states.
   Usage: node scripts/a11y.mjs [baseUrl]. Scope: automated rules only — it does not replace manual screen-reader testing. */
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/node-tools/node_modules/playwright"); }
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = process.argv[2] ?? "http://localhost:3100";
const SECTORS = ["energy", "banking", "insurance", "manufacturing", "logistics", "realestate", "infrastructure", "sovereign"];
const browser = await pw.chromium.launch();
let total = 0, scans = 0;
const report = [];
async function scan(page, label) {
  await page.evaluate(axeSrc);
  const res = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  scans++;
  for (const v of res.violations) { total += v.nodes.length; report.push(`${label}: [${v.impact}] ${v.id} ×${v.nodes.length} — ${v.help} — e.g. ${v.nodes[0].target.join(" ")} ${v.nodes[0].failureSummary?.split("\n")[1] ?? ""}`); }
  console.log(`${res.violations.length ? "VIOLATIONS" : "clean     "}  ${label}  (passes=${res.passes.length}, incomplete=${res.incomplete.length})`);
}
for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  for (const p of ["/", "/entry/energy", "/entry/banking", "/workspaces", "/overview", "/methodology", "/roadmap", ...SECTORS.map((s) => `/sector/${s}`)]) {
    await page.goto(BASE + p); await page.waitForTimeout(500); await scan(page, `${name} ${p}`);
  }
  await page.goto(BASE + "/sector/banking"); await page.waitForSelector("figure svg");
  await page.getByRole("button", { name: "Table" }).first().click(); await scan(page, `${name} sector table view`);
  await page.locator('[data-testid="signal-SIG-BNK-03"]').click(); await page.waitForTimeout(400); await scan(page, `${name} record drawer (signal)`);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Notifications/ }).click(); await scan(page, `${name} notifications open`); await page.keyboard.press("Escape");
  await page.getByLabel("Search seeded demonstration records").fill("liquidity"); await scan(page, `${name} search results`); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "About this prototype" }).click(); await scan(page, `${name} About dialog`); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Reset demonstration" }).first().click(); await scan(page, `${name} Reset dialog`); await page.keyboard.press("Escape");
  await ctx.close();
}
await browser.close();
console.log(`\n${scans} scans, ${total} violating nodes`);
report.forEach((r) => console.log(r));
process.exit(total ? 1 : 0);
