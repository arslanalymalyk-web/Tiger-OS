/* Automated accessibility scan with axe-core (WCAG 2.0/2.1 A + AA rule sets) across pages and open-overlay states.
   Usage: node scripts/a11y.mjs [baseUrl] [outDir]
   Writes: <outDir>/a11y-findings.json, <outDir>/a11y-findings.md and annotated screenshots in <outDir>/a11y-screenshots/
   for every scan that has violations or "incomplete" results (items axe could not decide automatically — NOT passes).
   Scope: automated rules only. It does not replace manual keyboard, contrast and screen-reader testing. */
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/node-tools/node_modules/playwright"); }
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = process.argv[2] ?? "http://localhost:3100";
const OUT = process.argv[3] ?? "./review";
const SHOTS = `${OUT}/a11y-screenshots`;
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const SECTORS = ["energy", "banking", "insurance", "manufacturing", "logistics", "realestate", "infrastructure", "sovereign"];
const browser = await pw.chromium.launch();
const scans = [];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function scan(page, label) {
  await page.evaluate(axeSrc);
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    const pick = (list) => list.map((v) => ({
      id: v.id, impact: v.impact, help: v.help,
      nodes: v.nodes.map((n) => ({
        target: n.target.join(" "),
        html: n.html.replace(/\s+/g, " ").slice(0, 140),
        text: (document.querySelector(n.target[0])?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 70),
        reason: (n.any[0] ?? n.all[0] ?? n.none[0])?.message ?? "",
        key: (n.any[0] ?? n.all[0] ?? n.none[0])?.data?.messageKey ?? "",
        data: (n.any[0] ?? n.all[0] ?? n.none[0])?.data && { fg: n.any[0]?.data?.fgColor, bg: n.any[0]?.data?.bgColor, ratio: n.any[0]?.data?.contrastRatio },
      })),
    }));
    return { violations: pick(r.violations), incomplete: pick(r.incomplete), passes: r.passes.length };
  });
  const entry = { label, violations: res.violations, incomplete: res.incomplete, passes: res.passes, screenshot: null };
  const flagged = [...res.violations, ...res.incomplete].flatMap((v) => v.nodes.map((n) => n.target));
  if (flagged.length) {
    // Outline every flagged element in magenta so a reviewer can find it in the screenshot.
    await page.evaluate((targets) => {
      const st = document.createElement("style"); st.id = "axe-flag-style"; st.textContent = "[data-axe-flag]{outline:3px dashed #d4008a !important;outline-offset:2px}"; document.head.appendChild(st);
      for (const t of targets) { try { document.querySelector(t.split(" ")[0] === t ? t : t)?.setAttribute("data-axe-flag", ""); } catch { /* selector with shadow/iframe parts */ } }
    }, flagged);
    entry.screenshot = `a11y-screenshots/${slug(label)}.jpg`;
    await page.screenshot({ path: `${OUT}/${entry.screenshot}`, type: "jpeg", quality: 40, fullPage: true });
    await page.evaluate(() => { document.getElementById("axe-flag-style")?.remove(); document.querySelectorAll("[data-axe-flag]").forEach((e) => e.removeAttribute("data-axe-flag")); });
  }
  scans.push(entry);
  const nv = res.violations.reduce((a, v) => a + v.nodes.length, 0), ni = res.incomplete.reduce((a, v) => a + v.nodes.length, 0);
  console.log(`${nv ? "VIOLATIONS" : ni ? "incomplete" : "clean     "}  ${label}  (violating nodes=${nv}, incomplete nodes=${ni}, passes=${res.passes})`);
}

for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  const closeAll = async () => { await page.keyboard.press("Escape"); await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 3000 }).catch(() => {}); };
  for (const p of ["/", "/entry/energy", "/entry/banking", "/workspaces", "/overview", "/methodology", "/roadmap", "/cases", "/evidence", "/evidence/EVD-LOG-01", "/reviews", "/ai-command", ...["overview", "evidence", "tasks", "review", "brief", "ai", "activity"].map((t) => `/cases/CAS-LOG-01?tab=${t}`), ...SECTORS.map((s) => `/sector/${s}`)]) {
    await page.goto(BASE + p); await page.waitForTimeout(500); await scan(page, `${name} ${p === "/" ? "/ (main entry)" : p}`);
  }
  await page.goto(BASE + "/cases"); await page.waitForTimeout(600);
  await page.getByTestId("new-case-button").click(); await page.waitForTimeout(300); await scan(page, `${name} /cases (Create case dialog open)`); await closeAll();
  await page.goto(BASE + "/cases/CAS-LOG-01?tab=evidence"); await page.waitForTimeout(600);
  await page.getByRole("combobox", { name: "Simulated demonstration role" }).selectOption("Expert").catch(() => {});
  await page.goto(BASE + "/cases/CAS-LOG-01?tab=review"); await page.waitForTimeout(600); await scan(page, `${name} /cases/CAS-LOG-01?tab=review (Expert role)`);
  await page.getByRole("combobox", { name: "Simulated demonstration role" }).selectOption("Analyst").catch(() => {});
  await page.goto(BASE + "/cases/CAS-LOG-01?tab=ai"); await page.waitForTimeout(800);
  await page.getByTestId("op-tasks").check(); await page.getByTestId("run-det").click(); await page.waitForTimeout(800);
  await scan(page, `${name} /cases/CAS-LOG-01?tab=ai (task-proposal run output open)`);
  await page.getByTestId("op-question").check(); await page.getByTestId("ai-question").fill("What is the weather in Paris?"); await page.getByTestId("run-det").click(); await page.waitForTimeout(800);
  await scan(page, `${name} /cases/CAS-LOG-01?tab=ai (insufficient-evidence output)`);
  await page.goto(BASE + "/ai-command"); await page.waitForTimeout(600); await scan(page, `${name} /ai-command (with runs)`);
  await page.goto(BASE + "/sector/banking"); await page.waitForSelector("figure svg");
  await page.getByRole("button", { name: "Table" }).first().click(); await scan(page, `${name} /sector/banking (chart table view)`);
  await page.locator('[data-testid="signal-SIG-BNK-03"]').click(); await page.waitForTimeout(400); await scan(page, `${name} /sector/banking (record drawer open: SIG-BNK-03)`);
  await closeAll();
  await page.getByRole("button", { name: /Notifications/ }).click(); await scan(page, `${name} /sector/banking (notifications open)`); await closeAll();
  await page.getByLabel("Search seeded demonstration records").fill("liquidity"); await scan(page, `${name} /sector/banking (search results open)`); await closeAll();
  await page.getByLabel("Search seeded demonstration records").fill("");
  await page.getByRole("button", { name: "About this prototype" }).click(); await page.waitForTimeout(250); await scan(page, `${name} /sector/banking (About dialog open)`); await closeAll();
  await page.getByRole("button", { name: "Reset demonstration" }).first().click(); await page.waitForTimeout(250); await scan(page, `${name} /sector/banking (Reset dialog open)`); await closeAll();
  await ctx.close();
}
await browser.close();

// ---- Reports
const count = (list) => list.reduce((a, v) => a + v.nodes.length, 0);
const totalV = scans.reduce((a, s) => a + count(s.violations), 0);
const totalI = scans.reduce((a, s) => a + count(s.incomplete), 0);
fs.writeFileSync(`${OUT}/a11y-findings.json`, JSON.stringify({ generated: new Date().toISOString(), scans }, null, 2));
const REASONS = { bgOverlap: "element overlaps another element, background colour cannot be determined", bgGradient: "background is a gradient", bgImage: "background is an image", fgAlpha: "foreground colour has transparency", shortTextContent: "very short text content", pseudoContent: "pseudo-element content", imgNode: "background image", elmPartiallyObscured: "element partially obscured" };
const md = [];
md.push(`# axe-core findings (generated by \`scripts/a11y.mjs\`)`, "", `- Scans: **${scans.length}**; violating nodes: **${totalV}**; "incomplete" nodes (axe could not decide): **${totalI}**.`, `- "Incomplete" is **not a pass**. Each item below needs a manual check; none is claimed to meet WCAG.`, `- Flagged elements are outlined in magenta in the linked screenshots.`, "");
for (const s of scans) {
  const all = [...s.violations.map((v) => ({ ...v, kind: "VIOLATION" })), ...s.incomplete.map((v) => ({ ...v, kind: "incomplete" }))];
  if (!all.length) continue;
  md.push(`### ${s.label}`, "", `Screenshot: \`review/${s.screenshot}\``, "", "| Result | Rule | Element (axe selector) | Visible text | Why axe could not decide / failed |", "|---|---|---|---|---|");
  // group identical (rule, selector) pairs
  const seen = new Map();
  for (const v of all) for (const n of v.nodes) {
    const k = `${v.kind}|${v.id}|${n.target}`;
    if (!seen.has(k)) seen.set(k, { v, n, c: 0 });
    seen.get(k).c++;
  }
  for (const { v, n, c } of seen.values()) md.push(`| ${v.kind}${c > 1 ? ` ×${c}` : ""} | \`${v.id}\` | \`${n.target.replace(/\|/g, "\\|")}\` | ${n.text ? n.text.replace(/\|/g, "\\|") : "—"} | ${REASONS[n.key] ?? (n.reason || v.help).replace(/\|/g, "\\|")} |`);
  md.push("");
}
fs.writeFileSync(`${OUT}/a11y-findings.md`, md.join("\n"));

// ---- Condensed per-page summary (desktop and mobile merged) for REVIEW.md
const family = (sel, text) => {
  if (/(^|[ >])(svg|text|tspan)\b|text\[|tspan\[/.test(sel)) return "Chart SVG text (axis ticks, axis titles, category or value labels)";
  if (/(^|[ >])(td|th|tr)\b/.test(sel)) return "Table cell text";
  if (/(^|[ >])(dt|dd)\b/.test(sel)) return "Definition-list label/value text";
  if (/(^|[ >])h[1-3]\b/.test(sel)) return "Heading text";
  if (/eyebrow|uppercase/.test(sel)) return "Eyebrow / small-caps label";
  if (/input|select|textarea/.test(sel)) return "Form control";
  if (/mt-1\\.5.*flex-wrap/.test(sel) || /→/.test(text)) return "Relationship link chips (button text with arrow glyph)";
  return "Other text";
};
const MANUAL = {
  "Chart SVG text (axis ticks, axis titles, category or value labels)": "Measure rendered text colour against the white card for each label style (ticks #5a6761, titles/categories #34453f, values #0e2a23); 11px text needs 4.5:1. Axe cannot resolve SVG text backgrounds.",
  "Table cell text": "Sample text colour vs. row background in default, hover and scrolled states (muted, emerald-link and mono ID styles on white); 4.5:1 for normal text.",
  "Definition-list label/value text": "Sample each label/value against the card background at the text position (header card uses a white→sage gradient); 4.5:1 normal, 3:1 large text.",
  "Heading text": "Sample heading colour vs. the local background (gradient header card, or illustration on entry pages); 3:1 for large text.",
  "Eyebrow / small-caps label": "Sample gold-700 (#7a5c22) 11px labels vs. the local background (ivory, white→sage gradient, or gold tint); 4.5:1 required.",
  "Form control": "Enter a value and check text vs. field background; read-only demo fields use ink-2 on a translucent ivory fill.",
  "Relationship link chips (button text with arrow glyph)": "Check chip text vs. ivory-2 fill; the arrow glyph is non-text and is judged separately (3:1 for meaningful graphics).",
  "Other text": "Sample colour pair at the element and compare with 4.5:1 (normal) or 3:1 (large).",
};
const REASON = { bgOverlap: "background overlapped by another element", bgGradient: "background is a gradient (or contains one)", bgImage: "background is an image", imgNode: "contains an image/SVG node", elmPartiallyObscured: "partially obscured by another element", elmPartiallyObscuring: "partially overlaps other elements", shortTextContent: "text too short to classify", nonBmp: "only non-text glyphs", emptyValue: "empty field value" };
const pages = new Map();
for (const s of scans) {
  const [vp, ...rest] = s.label.split(" ");
  const page = rest.join(" ");
  if (!pages.has(page)) pages.set(page, { shots: {}, groups: new Map() });
  const pg = pages.get(page);
  if (s.screenshot) pg.shots[vp] = s.screenshot;
  for (const v of s.incomplete) for (const n of v.nodes) {
    const f = family(n.target, n.text), r = REASON[n.key] ?? (n.reason || v.help);
    const k = `${f}|${r}`;
    if (!pg.groups.has(k)) pg.groups.set(k, { f, r, d: 0, m: 0, ex: `${n.target.slice(0, 80)}${n.text ? ` — “${n.text.slice(0, 40)}”` : ""}` });
    pg.groups.get(k)[vp === "desktop" ? "d" : "m"]++;
  }
}
const sum = ["| Page / state | Screenshots (annotated) | Element family | Why axe left it unresolved | Nodes (desktop / mobile) | Example element | Manual check required |", "|---|---|---|---|---|---|---|"];
for (const [page, pg] of pages) {
  if (!pg.groups.size) continue;
  const shot = ["desktop", "mobile"].filter((v) => pg.shots[v]).map((v) => `[${v}](${pg.shots[v]})`).join(", ");
  for (const g of [...pg.groups.values()].sort((a, b) => b.d + b.m - (a.d + a.m))) sum.push(`| \`${page}\` | ${shot} | ${g.f} | ${g.r} | ${g.d} / ${g.m} | \`${g.ex.replace(/\|/g, "\\|")}\` | ${MANUAL[g.f]} |`);
}
const clean = [...pages].filter(([, pg]) => !pg.groups.size).map(([p]) => `\`${p}\``);
fs.writeFileSync(`${OUT}/a11y-findings-summary.md`, [`Scans: ${scans.length}; violating nodes: ${totalV}; unresolved ("incomplete") nodes: ${totalI}.`, "", `Pages/states with no violations and no unresolved items: ${clean.join(", ") || "none"}.`, "", ...sum].join("\n"));
console.log(`\n${scans.length} scans, ${totalV} violating nodes, ${totalI} incomplete nodes (need manual review)`);
console.log(`Reports: ${OUT}/a11y-findings.json, ${OUT}/a11y-findings.md`);
process.exit(totalV ? 1 : 0);
