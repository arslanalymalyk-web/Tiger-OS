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

const BROWSER = process.env.BROWSER || "chromium";
let browser;
try { browser = await pw[BROWSER].launch(); } catch (e) { console.log(`UNAVAILABLE  ${BROWSER} could not be launched: ${String(e.message).split("\n")[0]}`); process.exit(2); }
console.log(`Running checks in ${BROWSER}`);
const errors = [];
async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  return { ctx, page };
}
// Escape, then wait until any modal dialog has actually been removed (closing is an async router transition).
const escClose = async (page) => { await page.keyboard.press("Escape"); await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 3000 }).catch(() => {}); };
const drawerId = async (page, expected) => {
  // The drawer updates after an async router transition; wait for the expected ID when given.
  if (expected) await page.waitForFunction((id) => document.querySelector('dialog[open][aria-labelledby="record-drawer-title"] header code')?.textContent?.trim() === id, expected, { timeout: 5000 }).catch(() => {});
  else await page.waitForSelector('dialog[open][aria-labelledby="record-drawer-title"] header code', { timeout: 5000 }).catch(() => {});
  return (await page.locator('dialog[open][aria-labelledby="record-drawer-title"] header code').first().textContent().catch(() => null))?.trim();
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
  const dlg = page.locator('dialog[open][aria-labelledby="record-drawer-title"]');
  await dlg.getByRole("button", { name: /Wadi hub concentration and export redundancy/ }).first().click();
  check("Signal → linked case", (await drawerId(page, "CAS-ENR-01")) === "CAS-ENR-01");
  await dlg.getByRole("button", { name: /Approve feasibility study/ }).first().click();
  check("Case → linked decision", (await drawerId(page, "DEC-ENR-01")) === "DEC-ENR-01");
  const dtxt = await dlg.innerText();
  check("Decision shows IDs, assumptions, evidence refs, and stage boundary", /assumptions/i.test(dtxt) && dtxt.includes("EVD-ENR-01") && dtxt.includes("Stage 5"));
  await escClose(page);
  await page.waitForTimeout(300);
  check("Escape closes drawer", (await dlg.count()) === 0);
  // metric drawer
  await page.locator('[data-testid="metric-MET-ENR-02"]').click();
  await drawerId(page, "MET-ENR-02");
  const mt = await dlg.innerText();
  check("Metric drawer shows formula, period and contributing records", /formula/i.test(mt) && mt.includes("Sep 2026") && mt.includes("ENT-ENR-04") && mt.includes("60.4"));
  await escClose(page);

  // ---- Search
  const search = page.getByLabel("Search seeded demonstration records");
  await search.fill("Sahil");
  await page.getByRole("option").first().click();
  check("Search result opens record", /^(SIG|ENT|CAS|DEC)-/.test((await drawerId(page)) ?? ""));
  await escClose(page);
  await search.fill("SIG-LOG-01");
  await page.getByRole("option").first().click();
  check("Search by ID opens that record and switches sector", (await drawerId(page, "SIG-LOG-01")) === "SIG-LOG-01" && page.url().includes("/sector/logistics"));
  await escClose(page);
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
  await escClose(page);
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
  await escClose(page);
  await page.getByRole("button", { name: "Reset demonstration" }).first().click();
  await page.getByRole("dialog", { name: "Reset demonstration?" }).getByRole("button", { name: "Reset demonstration" }).click();
  await page.waitForURL("**/workspaces");
  await page.waitForTimeout(300);
  check("Reset restores seeded state (all unread, Analyst)", (await unread()) === 19 && (await page.getByLabel("Simulated demonstration role").inputValue()) === "Analyst", `unread=${await unread()}`);
  await page.reload();
  check("Reset state persists (no stale storage)", (await unread()) === 19);
  // reset cancel path
  await page.getByRole("button", { name: "Reset demonstration" }).first().click();
  await page.getByRole("button", { name: "Cancel" }).click();
  check("Reset confirmation can be cancelled", (await page.getByRole("dialog", { name: "Reset demonstration?" }).count()) === 0);
  await ctx.close();
}


// ---- Hydration: a persisted non-default role must never flash the default
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("tigeris.demo.v1", JSON.stringify({ sectorId: "insurance", role: "Expert", readIds: ["NTF-01", "NTF-02"], entered: true })); } catch {}
    window.__seen = new Set();
    const rec = () => {
      const sel = document.querySelector('select[aria-label="Simulated demonstration role"]');
      if (sel) window.__seen.add("sel:" + sel.value);
      const f = document.querySelector('section[aria-label="Role focus"]');
      if (f) window.__seen.add("focus:" + (f.textContent || "").slice(0, 24));
      const side = document.body?.innerText.match(/Simulated role: (\S+)/);
      if (side) window.__seen.add("side:" + side[1]);
    };
    new MutationObserver(rec).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    setInterval(rec, 4);
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(BASE + "/sector/insurance");
  await page.waitForFunction(() => document.querySelector('select[aria-label="Simulated demonstration role"]')?.value === "Expert");
  await page.waitForTimeout(300);
  const seen = await page.evaluate(() => [...window.__seen]);
  check("No role flash: Analyst never rendered when Expert persisted", !seen.some((x) => /Analyst/.test(x)), seen.join(" | "));
  check("Persisted role and focus panel appear after hydration", seen.includes("sel:Expert") && seen.some((x) => x.startsWith("focus:Expert")), seen.join(" | "));
  check("Persisted read count applied from migrated Stage 1 state (17 unread of 19)", (await page.getByTestId("unread-count").textContent()) === "17");
  await ctx.close();
  const raw = await (await fetch(BASE + "/sector/insurance")).text();
  check("Server HTML contains no role-specific content (loading state only)", !/Analyst focus|Expert focus|Approver focus/.test(raw) && raw.includes("Loading"));
}

// ---- Keyboard, focus management, persistence, reset
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  const inDialog = () => page.evaluate(() => !!document.activeElement?.closest('dialog[open]'));
  const activeId = () => page.evaluate(() => document.activeElement?.getAttribute("data-testid") || document.activeElement?.getAttribute("aria-label") || document.activeElement?.id || document.activeElement?.tagName);
  await page.goto(BASE + "/sector/energy");
  await page.waitForSelector("figure svg");
  // Top bar and sidebar stay pinned while the page scrolls (regression: overflow-x:hidden on body broke position:sticky)
  await page.evaluate(() => window.scrollTo(0, 900)); await page.waitForTimeout(150);
  const pinned = await page.evaluate(() => ({ top: Math.round(document.querySelector("header").getBoundingClientRect().top), side: Math.round(document.querySelector("aside").getBoundingClientRect().top) }));
  check("Top bar and sidebar remain pinned after scrolling 900px", pinned.top === 0 && pinned.side === 0, JSON.stringify(pinned));
  await page.evaluate(() => window.scrollTo(0, 0));
  // visible focus + skip link
  await page.keyboard.press("Tab");
  const skip = await page.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return { text: e.textContent, vis: e.getBoundingClientRect().width > 1, outline: cs.outlineStyle }; });
  check("Skip link is first tab stop and becomes visible", /Skip to main/.test(skip.text) && skip.vis);
  await page.keyboard.press("Enter");
  check("Skip link moves focus to main content", (await page.evaluate(() => document.activeElement?.id)) === "main-content");
  let focusRing = true;
  for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); const o = await page.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2; }); if (!o) focusRing = false; }
  check("Visible focus ring on the first 12 tab stops", focusRing);
  // Drawer: keyboard open, focus in, trap, Escape, return
  const sig = page.locator('[data-testid="signal-SIG-ENR-01"]');
  await sig.focus(); await page.keyboard.press("Enter");
  await page.waitForSelector('dialog[open][aria-labelledby="record-drawer-title"]');
  await page.waitForTimeout(150);
  check("Drawer takes focus on open", await inDialog());
  let trapped = true;
  for (let i = 0; i < 60; i++) { await page.keyboard.press("Tab"); if (!(await inDialog())) { trapped = false; break; } }
  check("Tab stays trapped inside the drawer (60 tab presses)", trapped);
  let trappedBack = true;
  for (let i = 0; i < 30; i++) { await page.keyboard.press("Shift+Tab"); if (!(await inDialog())) { trappedBack = false; break; } }
  check("Shift+Tab stays trapped inside the drawer", trappedBack);
  await escClose(page);
  await page.waitForTimeout(250);
  check("Escape closes drawer and focus returns to the opening signal button", (await activeId()) === "signal-SIG-ENR-01", await activeId());
  // drawer via mouse then close button
  await page.locator('[data-testid="metric-MET-ENR-01"]').click();
  await page.waitForSelector('dialog[open][aria-labelledby="record-drawer-title"]');
  await page.getByRole("button", { name: "Close detail" }).click();
  await page.waitForTimeout(250);
  check("Close button returns focus to the opening metric card", (await activeId()) === "metric-MET-ENR-01", await activeId());
  // drawer-to-drawer navigation does not change what focus returns to
  await sig.click(); await page.waitForSelector('dialog[open][aria-labelledby="record-drawer-title"]');
  await page.locator('dialog[open][aria-labelledby="record-drawer-title"]').getByRole("button", { name: /Wadi hub concentration/ }).first().click();
  await drawerId(page, "CAS-ENR-01");
  await escClose(page); await page.waitForTimeout(250);
  check("Focus returns to the original opener after navigating signal → case", (await activeId()) === "signal-SIG-ENR-01", await activeId());
  // About + Reset dialogs
  const about = page.getByRole("button", { name: "About this prototype" });
  await about.focus(); await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "About this prototype" }).waitFor();
  check("About dialog takes focus", await inDialog());
  let t2 = true; for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); if (!(await inDialog())) t2 = false; }
  check("About dialog traps Tab", t2);
  await escClose(page); await page.waitForTimeout(200);
  check("Escape closes About and focus returns to the About button", (await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "About this prototype");
  const resetBtn = page.getByRole("button", { name: "Reset demonstration" }).first();
  await resetBtn.focus(); await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "Reset demonstration?" }).waitFor();
  check("Reset dialog takes focus", await inDialog());
  await escClose(page); await page.waitForTimeout(200);
  check("Escape cancels Reset and returns focus to the Reset button", (await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim())) === "Reset demonstration");
  // Menus
  await page.getByRole("button", { name: /Sector/ }).first().click();
  await escClose(page);
  check("Escape closes sector menu and returns focus to its button", /Sector/.test(await page.evaluate(() => document.activeElement?.textContent ?? "")));
  // Search keyboard
  const input = page.getByLabel("Search seeded demonstration records");
  await input.focus(); await page.keyboard.type("Rimal"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await page.waitForSelector('dialog[open][aria-labelledby="record-drawer-title"]');
  await escClose(page); await page.waitForTimeout(250);
  check("Search (keyboard) → drawer → Escape returns focus to the search box", (await page.evaluate(() => document.activeElement?.getAttribute("role"))) === "combobox");
  // Persistence of sector, role and notifications, and reset
  await page.goto(BASE + "/sector/insurance");
  await page.getByLabel("Simulated demonstration role").selectOption("Approver");
  await page.getByRole("button", { name: /Notifications/ }).click();
  await page.getByRole("button", { name: "Mark all read" }).click();
  await escClose(page);
  await page.goto(BASE + "/workspaces");
  await page.reload();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Simulated demonstration role"]')?.value === "Approver");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("tigeris.demo.v2") || "null"));
  check("Persisted state survives reload (role, sector, notifications)", stored?.schemaVersion === 2 && stored?.ui?.role === "Approver" && stored?.ui?.sectorId === "insurance" && stored?.ui?.readIds?.length === 19, JSON.stringify(stored?.ui));
  check("Workspaces shows persisted last-selected sector (Insurance)", (await page.locator('[data-testid="workspace-insurance"]').innerText()).includes("Last selected"));
  check("Unread badge hidden when all read", (await page.getByTestId("unread-count").count()) === 0);
  await page.getByRole("button", { name: "Reset demonstration" }).first().click();
  await page.getByRole("dialog", { name: "Reset demonstration?" }).getByRole("button", { name: "Reset demonstration" }).click();
  await page.waitForTimeout(400);
  const afterReset = await page.evaluate(() => localStorage.getItem("tigeris.demo.v2") ?? localStorage.getItem("tigeris.demo.v1"));
  check("Reset clears persisted demo state from localStorage", afterReset === null, String(afterReset));
  check("Reset restores seeded UI state (Analyst, 19 unread, Energy last selected)", (await page.getByLabel("Simulated demonstration role").inputValue()) === "Analyst" && (await page.getByTestId("unread-count").textContent()) === "19" && (await page.locator('[data-testid="workspace-energy"]').innerText()).includes("Last selected"));
  await ctx.close();
}


// ---- Modal drawer: background isolation, focus containment, Escape, focus restoration, linked-record navigation
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  const DRAWER = 'dialog[open][aria-labelledby="record-drawer-title"]';
  const state = () => page.evaluate(() => {
    const dlg = [...document.querySelectorAll("dialog[open]")];
    const d = dlg[0];
    const lab = d?.getAttribute("aria-labelledby");
    const title = lab ? document.getElementById(lab)?.textContent?.trim() : null;
    return {
      open: dlg.length, modal: !!d && d.matches(":modal"), title,
      inert: document.getElementById("app-root")?.inert === true,
      focusInside: !!document.activeElement?.closest("dialog[open]"),
      focusOnDialog: document.activeElement === d,
      activeTestId: document.activeElement?.getAttribute("data-testid") ?? null,
      activeLabel: document.activeElement?.getAttribute("aria-label") ?? null,
    };
  });
  const settle = (ms = 250) => page.waitForTimeout(ms);
  await page.goto(BASE + "/sector/energy");
  await page.waitForSelector("figure svg");
  await page.waitForFunction(() => document.querySelector('select[aria-label="Simulated demonstration role"]')?.value);

  // A. Open from a signal: semantics, isolation, containment
  const sig = page.locator('[data-testid="signal-SIG-ENR-01"]');
  await sig.click(); await page.waitForSelector(DRAWER); await settle();
  let st = await state();
  check("Drawer is a native modal <dialog> (matches :modal), exactly one open", st.open === 1 && st.modal);
  check("Drawer has an accessible name from its visible title (aria-labelledby)", st.title === "Wadi Processing Hub carries 60.4% of production" && (await page.getByRole("dialog", { name: "Wadi Processing Hub carries 60.4% of production" }).count()) === 1, String(st.title));
  check("Background (#app-root) is inert while the drawer is open", st.inert);
  check("Drawer takes focus on open", st.focusOnDialog || st.focusInside);
  await page.evaluate(() => document.querySelector('[data-testid="metric-MET-ENR-01"]').focus());
  check("Background controls cannot be focused programmatically", (await state()).focusInside);
  // The sticky top bar is always on screen, so its sector selector is a reliable background control to probe.
  const SECTOR_BTN = '[data-testid="sector-selector"]';
  const bgHit = await page.evaluate((sel) => { const b = document.querySelector(sel); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { tag: el?.tagName, isControl: !!el?.closest(sel) }; }, SECTOR_BTN);
  check("Pointer hit-testing over a background control lands on the drawer backdrop, not the control", bgHit.tag === "DIALOG" && !bgHit.isControl, JSON.stringify(bgHit));
  let held = true;
  for (let i = 0; i < 60; i++) { await page.keyboard.press("Tab"); if (!(await state()).focusInside) { held = false; break; } }
  for (let i = 0; i < 30 && held; i++) { await page.keyboard.press("Shift+Tab"); if (!(await state()).focusInside) { held = false; break; } }
  check("Tab (60×) and Shift+Tab (30×) never leave the drawer", held);
  await page.locator(DRAWER).getByRole("heading", { level: 2 }).click();
  await settle(150);
  check("Clicking inside the drawer does not close it", (await state()).open === 1);

  // B. Escape: closes, background restored, focus back on opener, background usable
  await escClose(page); await settle();
  st = await state();
  check("Escape closes the drawer and removes the dialog", st.open === 0);
  check("Background is no longer inert after close", !st.inert);
  check("Focus returns to the element that opened the drawer", st.activeTestId === "signal-SIG-ENR-01", String(st.activeTestId));
  await page.evaluate(() => document.querySelector('[data-testid="metric-MET-ENR-01"]').focus());
  check("Background controls can be focused again", (await state()).activeTestId === "metric-MET-ENR-01");
  await page.locator('[data-testid="metric-MET-ENR-02"]').click();
  check("Background control works again (click opens its drawer)", (await drawerId(page, "MET-ENR-02")) === "MET-ENR-02");
  await escClose(page); await settle();

  // C. Backdrop click closes without activating whatever is behind it
  await sig.click(); await page.waitForSelector(DRAWER); await settle();
  const pt = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, SECTOR_BTN);
  await page.mouse.click(pt.x, pt.y); await settle();
  st = await state();
  const menuOpen = await page.evaluate((sel) => document.querySelector(sel)?.getAttribute("aria-expanded") === "true", SECTOR_BTN);
  check("Clicking the backdrop over a background control closes the drawer without activating that control", st.open === 0 && !menuOpen, `open=${st.open} menuOpen=${menuOpen}`);
  check("Focus restored to the opener and background interactive after backdrop close", st.activeTestId === "signal-SIG-ENR-01" && !st.inert, String(st.activeTestId));

  // D. Navigation between linked record drawers (signal → case → decision → signal), then browser Back
  await sig.click(); await page.waitForSelector(DRAWER); await settle();
  const trail = [];
  const note = async (expectedId) => { await drawerId(page, expectedId); await settle(150); const s2 = await state(); trail.push(`${expectedId}:${s2.open}/${s2.inert}/${s2.focusInside}`); return s2; };
  let s1 = await state(); const t1 = s1.title;
  await page.locator(DRAWER).getByRole("button", { name: /Wadi hub concentration and export redundancy/ }).first().click();
  let s2 = await note("CAS-ENR-01");
  check("Signal → case: still exactly one modal, background inert, title updated, focus in drawer", s2.open === 1 && s2.modal && s2.inert && s2.focusInside && s2.title !== t1 && s2.title === "Wadi hub concentration and export redundancy", String(s2.title));
  await page.locator(DRAWER).getByRole("button", { name: /Approve feasibility study/ }).first().click();
  let s3 = await note("DEC-ENR-01");
  check("Case → decision: one modal, inert, title updated, focus in drawer", s3.open === 1 && s3.inert && s3.focusInside && s3.title === "Approve feasibility study for a Wadi hub bypass link", String(s3.title));
  check("Navigating between drawers moves focus to the new drawer content (dialog is focused)", s3.focusOnDialog);
  await page.locator(DRAWER).locator("nav[aria-label='Signal to case to decision path']").getByRole("button", { name: "SIG-ENR-03" }).click();
  let s4 = await note("SIG-ENR-03");
  check("Decision → linked signal via path control: one modal, inert, focus in drawer", s4.open === 1 && s4.inert && s4.focusInside && /single-route assets/.test(s4.title ?? ""), String(s4.title));
  await page.goBack(); let b1 = await note("DEC-ENR-01");
  await page.goBack(); let b2 = await note("CAS-ENR-01");
  await page.goBack(); let b3 = await note("SIG-ENR-01");
  check("Browser Back steps through the drawers while keeping the background inert", b1.inert && b2.inert && b3.inert && b1.open === 1 && b2.open === 1 && b3.open === 1, trail.join(" | "));
  await page.goBack(); await settle();
  st = await state();
  check("Back past the first drawer closes it, restores the background and returns focus to the original opener", st.open === 0 && !st.inert && st.activeTestId === "signal-SIG-ENR-01", JSON.stringify(st));
  // Escape from a deep drawer still restores to the original opener
  await sig.click(); await page.waitForSelector(DRAWER); await settle();
  await page.locator(DRAWER).getByRole("button", { name: /Wadi hub concentration and export redundancy/ }).first().click(); await drawerId(page, "CAS-ENR-01");
  await escClose(page); await settle();
  st = await state();
  check("Escape from a second-level drawer restores focus to the original opener and the background", st.open === 0 && !st.inert && st.activeTestId === "signal-SIG-ENR-01", JSON.stringify(st));

  // E. About and Reset dialogs use the same primitive
  for (const [btnName, dlgName] of [["About this prototype", "About this prototype"], ["Reset demonstration", "Reset demonstration?"]]) {
    const btn = page.getByRole("button", { name: btnName }).first();
    await btn.focus(); await page.keyboard.press("Enter");
    await page.getByRole("dialog", { name: dlgName }).waitFor(); await settle(150);
    const m = await state();
    check(`${dlgName.replace("?", "")} dialog: native modal, named, background inert`, m.open === 1 && m.modal && m.inert && m.title === dlgName, JSON.stringify(m));
    await page.evaluate(() => document.querySelector('select[aria-label="Simulated demonstration role"]')?.focus());
    check(`${dlgName.replace("?", "")} dialog: background controls cannot take focus`, (await state()).focusInside);
    await escClose(page); await settle(150);
    const m2 = await state();
    check(`${dlgName.replace("?", "")} dialog: Escape closes, background restored, focus back on opener`, m2.open === 0 && !m2.inert && (m2.activeLabel === btnName || (await page.evaluate(() => document.activeElement?.textContent?.trim())) === btnName), JSON.stringify(m2));
  }
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
  const mob = await page.evaluate(() => ({ modal: !!document.querySelector("dialog[open]")?.matches(":modal"), inert: document.getElementById("app-root")?.inert === true, inside: !!document.activeElement?.closest("dialog[open]") }));
  check("Mobile drawer: native modal, background inert, focus inside", mob.modal && mob.inert && mob.inside, JSON.stringify(mob));
  await escClose(page); await page.waitForTimeout(250);
  check("Mobile drawer: Escape closes and background is restored", (await page.evaluate(() => document.querySelectorAll("dialog[open]").length === 0 && document.getElementById("app-root")?.inert === false)));
  await page.goto(BASE + "/entry/energy"); await page.screenshot({ path: `${SHOTS}/mobile-entry-energy.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
const filtered = errors.filter((e) => !/favicon/.test(e));
check("No console or page errors", filtered.length === 0, filtered.slice(0, 5).join(" | "));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
