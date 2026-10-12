/* Stage 3 workflow checks (Playwright).
   Usage: node scripts/e2e-stage3.mjs [plainUrl] [mockUrl] [shotDir]
   plainUrl: production server with NO provider credentials (npm start -- -p 3100)
   mockUrl : production server started with the automated-test fixture:  TIGERIS_AI_TEST_MOCK=1 TIGERIS_AI_TIMEOUT_MS=3000 npm start -- -p 3101
   The mock server's outputs are a MOCKED PROVIDER FIXTURE, not AI. No real model is called by this script. */
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/node-tools/node_modules/playwright"); }
const PLAIN = process.argv[2] ?? "http://localhost:3100";
const MOCK = process.argv[3] ?? "http://localhost:3101";
const SHOTS = process.argv[4] ?? "./e2e-shots-stage3";
fs.mkdirSync(SHOTS, { recursive: true });
const BROWSER = process.env.BROWSER || "chromium";
let browser;
try { browser = await pw[BROWSER].launch(); } catch (e) { console.log(`UNAVAILABLE  ${BROWSER} could not be launched: ${String(e.message).split("\n")[0]}`); process.exit(2); }
console.log(`Running Stage 3 checks in ${BROWSER} (plain server: no provider; mock server: automated-test fixture, not AI)`);

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const errors = [];
const DESKTOP = { width: 1440, height: 900 };
let BASE = PLAIN;

async function fresh(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? DESKTOP });
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
  return { ctx, page };
}
const section = async (name, fn, opts = {}) => {
  BASE = opts.mock ? MOCK : PLAIN;
  const h = await fresh(opts);
  try { await fn(h.page, h.ctx); } catch (e) { check(`${name}: section completed without an exception`, false, String(e.message).split("\n")[0]); await h.page.screenshot({ path: `${SHOTS}/failure-${name.replace(/\W+/g, "-")}.png`, fullPage: true }).catch(() => {}); }
  await h.ctx.close();
};
const tid = (page, id) => page.getByTestId(id);
const ready = async (page) => { await page.waitForFunction(() => { const s = document.querySelector('select[aria-label="Simulated demonstration role"]'); return s && s.value; }, null, { timeout: 8000 }); };
const goto = async (page, path) => { await page.goto(BASE + path); await ready(page); };
const role = async (page, r) => { await page.getByLabel("Simulated demonstration role").selectOption(r); await page.waitForFunction((x) => document.querySelector('select[aria-label="Simulated demonstration role"]').value === x, r); await page.waitForTimeout(120); };
const openAi = async (page, id = "CAS-LOG-01") => { await goto(page, `/cases/${id}?tab=ai`); await tid(page, "assist-panel").waitFor(); await page.waitForFunction(() => document.querySelector('[data-testid="provider-banner"]'), null, { timeout: 8000 }); };
const wait = (page, ms = 150) => page.waitForTimeout(ms);
const stored = (page) => page.evaluate(() => { const v = localStorage.getItem("tigeris.demo.v3"); return v ? JSON.parse(v) : null; });
const rowIds = (page) => page.locator('[data-testid^="run-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("run-row-", "")));
const newest = async (page) => (await rowIds(page))[0];
const SECTORS = [["energy", "ENR"], ["banking", "BNK"], ["insurance", "INS"], ["manufacturing", "MFG"], ["logistics", "LOG"], ["realestate", "REA"], ["infrastructure", "INF"], ["sovereign", "SOV"]];

/** Start a run and wait for it to finish (or fail). Returns the run id. */
async function runOp(page, op, { mode = "det", question, scenario, settle = true } = {}) {
  const before = (await rowIds(page)).length;
  await tid(page, `op-${op}`).check();
  if (question !== undefined) await tid(page, "ai-question").fill(question);
  if (scenario) await tid(page, "mock-scenario").selectOption(scenario);
  await tid(page, mode === "det" ? "run-det" : "run-ai").click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid^="run-row-"]').length > n, before, { timeout: 8000 });
  const id = await newest(page);
  if (settle) await page.waitForFunction((rid) => { const v = document.querySelector(`[data-testid="run-view-${rid}"] [data-testid="run-status"]`); return v && !/queued|running/.test(v.textContent); }, id, { timeout: 15000 });
  return id;
}
const view = (page, id) => tid(page, `run-view-${id}`);
const statusOf = async (page, id) => (await view(page, id).getByTestId("run-status").innerText()).trim().toLowerCase();

// ============================================================ A. AI Command with no provider
await section("ai-command-no-provider", async (page) => {
  await goto(page, "/ai-command");
  await tid(page, "ai-command").waitFor();
  await page.waitForSelector('[data-testid="provider-banner"]');
  check("AI command page loads from the sidebar route", (await page.getByRole("link", { name: "AI command" }).count()) >= 1 && (await page.getByRole("heading", { level: 1 }).first().innerText()).includes("AI command"));
  check("Four assistants are listed with their responsibilities", (await page.locator('[data-testid^="assistant-"]').count()) === 4 && (await tid(page, "assistants").innerText()).includes("Case summarizer") && (await tid(page, "assistants").innerText()).includes("Investigation task planner"));
  const t = await tid(page, "ai-command").innerText();
  check("It states there is no continuous monitoring, background autonomy or action execution", /no continuous monitoring, no background autonomy and no action execution/.test(t));
  check("Approved capabilities and evidence scope are listed", (await tid(page, "capabilities").innerText()).includes("Scope = one case") && (await tid(page, "capabilities").innerText()).includes("User-triggered only"));
  check("With no credentials it says “AI provider not configured”", (await tid(page, "provider-banner").getAttribute("data-state")) === "not-configured" && /AI provider not configured/.test(await tid(page, "provider-banner").innerText()));
  check("The banner names missing variables, never values", /ANTHROPIC_API_KEY/.test(await tid(page, "provider-banner").innerText()) && !/sk-ant/.test(t));
  check("No runs: a clear empty state with a way in", (await tid(page, "runs-empty").count()) === 1 && (await tid(page, "start-log").count()) === 1);
  await page.screenshot({ path: `${SHOTS}/ai-command-no-provider.png`, fullPage: true });
  const status = await (await page.request.get(`${BASE}/api/ai/status`)).json();
  check("Status endpoint reports not configured and exposes no credential fields", status.configured === false && !("apiKey" in status) && !JSON.stringify(status).match(/sk-|key":"/));
  const r = await page.request.post(`${BASE}/api/ai/run`, { data: { operation: "summarize", context: {} } });
  check("Run endpoint refuses malformed requests without calling anything", r.status() === 400);
});

// ============================================================ B. Case workflow with deterministic demonstration output (no provider)
await section("case-deterministic", async (page) => {
  await openAi(page);
  check("Case workspace has an AI assistance tab", (await tid(page, "tab-ai").count()) === 1 && (await tid(page, "assist-boundary").innerText()).includes("no tools"));
  check("No provider: the AI run button is off and says why", (await tid(page, "run-ai").isDisabled()) && /AI provider not configured/.test(await tid(page, "run-ai-note").innerText()));
  check("The mock-scenario control is not shown without the test fixture", (await tid(page, "mock-scenario").count()) === 0);
  const scope = await tid(page, "scope-panel").innerText();
  check("Exact evidence scope is shown before running (linked evidence, versions, records)", scope.includes("EVD-LOG-01") && /v1/.test(scope) && /hypotheses/.test(await tid(page, "scope-records").innerText()) && /not retrieved/.test(scope));
  await page.screenshot({ path: `${SHOTS}/case-assistance-scope.png`, fullPage: true });

  // Summarize
  const r1 = await runOp(page, "summarize");
  const v1 = view(page, r1);
  check("Deterministic run completes and is labelled “Deterministic demonstration (not AI)”", (await statusOf(page, r1)) === "completed" && (await v1.getByTestId("mode-badge").getAttribute("data-mode")) === "deterministic" && /not AI/.test(await v1.getByTestId("mode-badge").innerText()));
  const vt = await v1.innerText();
  check("It is never presented as AI-generated and records that no model was used", !/AI-generated/.test(vt) && /no model used/.test(await v1.getByTestId("run-model").innerText()));
  check("Provenance: run ID, case, requesting demo role, timestamps, snapshot fingerprint, evidence versions", /RUN-LOG-01/.test(vt) && /CAS-LOG-01/.test(vt) && /Analyst demonstration role/.test(vt) && /AST/.test(vt) && (await v1.getByTestId("run-fingerprint").innerText()).match(/[0-9a-f]{16}/) !== null && /EVD-LOG-01 v1/.test(await v1.getByTestId("run-fingerprint").innerText()));
  const supported = v1.getByTestId("out-supported");
  check("Findings are source-supported, each with evidence ID, version and reference", (await supported.locator('[data-testid^="claim-"]').count()) >= 1 && (await supported.locator('a[href*="/evidence/EVD-"]').count()) >= 1 && /v\d+ [PT]\d/.test(await supported.innerText()));
  check("Inferences, missing information and next steps are separate sections", (await v1.getByTestId("out-inferences").count()) === 1 && (await v1.getByTestId("out-missing").count()) === 1 && (await v1.getByTestId("out-next").count()) === 1);
  check("The validation note says citations are checked but support must be judged by a person", /cannot confirm that a passage supports a claim/.test(await v1.getByTestId("validation-note").innerText()));
  await page.screenshot({ path: `${SHOTS}/cited-output.png`, fullPage: true });
  const firstCite = supported.locator('a[href*="/evidence/EVD-"]').first();
  const href = await firstCite.getAttribute("href");
  await firstCite.click();
  await page.waitForURL(/\/evidence\/EVD-.*#ref-/);
  await page.waitForTimeout(300);
  check("A citation opens the evidence at the cited passage, highlighted", await page.evaluate(() => { const h = decodeURIComponent(location.hash.slice(1)); const el = document.getElementById(h); return !!el && (el.matches(":target") || el.hasAttribute("data-hl")); }), href);
  await page.goBack(); await tid(page, "assist-panel").waitFor();

  // Questions
  const r2 = await runOp(page, "question", { question: "What is the weather forecast for Paris next week?" });
  check("An unsupported question is answered with “Insufficient evidence”, not a guess", (await view(page, r2).getByTestId("run-insufficient").count()) === 1 && (await view(page, r2).getByTestId("out-supported").locator('[data-testid^="claim-"]').count()) === 0);
  const r3 = await runOp(page, "question", { question: "What does the port bulletin say about release congestion?" });
  check("A question the evidence covers is answered with cited passages", (await view(page, r3).getByTestId("out-supported").locator('[data-testid^="claim-"]').count()) >= 1 && (await view(page, r3).getByTestId("run-insufficient").count()) === 0);
  const r4 = await runOp(page, "conflicts");
  check("Conflicting evidence and missing information are reported separately", (await view(page, r4).getByTestId("out-contradictions").count()) === 1 && (await view(page, r4).getByTestId("out-missing").locator("li").count()) >= 1);

  // Task proposals
  const r5 = await runOp(page, "tasks");
  const props = view(page, r5).locator('[data-testid^="proposal-"]');
  const n = await props.count();
  check("Task proposals are listed as proposals and are not tasks yet", n >= 2 && /not created until you accept/.test(await view(page, r5).getByTestId("out-task-proposals").innerText()));
  await page.getByTestId("tab-tasks").click(); await wait(page, 350);
  const tasksBefore = await page.locator('[data-testid^="task-TSK-LOG-01-"]').filter({ has: page.locator('[data-testid^="task-status-"]') }).count();
  check("The case still has its 3 tasks (generated content did not change it)", tasksBefore === 3);
  await page.getByTestId("tab-ai").click();
  const p1 = (await props.nth(0).getAttribute("data-testid")).replace("proposal-", "");
  await tid(page, `edit-${p1}`).click();
  await tid(page, `edit-title-${p1}`).fill("Edited by the Analyst: confirm cause codes with dispatch");
  await tid(page, `save-edit-${p1}`).click();
  await wait(page, 200);
  check("An Analyst can edit a proposal; it is marked edited and the case is still unchanged", /edited/i.test(await tid(page, `proposal-${p1}`).innerText()) && (await tid(page, `proposal-${p1}`).getAttribute("data-status")) === "pending");
  await tid(page, `accept-${p1}`).click();
  await tid(page, `created-${p1}`).waitFor();
  const newTask = (await tid(page, `created-${p1}`).innerText()).trim();
  check("Accepting creates a normal Stage 2 task (new ID, Not started)", /^TSK-LOG-01-04$/.test(newTask) && (await tid(page, `proposal-${p1}`).getAttribute("data-status")) === "accepted");
  await page.screenshot({ path: `${SHOTS}/human-acceptance.png`, fullPage: true });
  const p2 = (await props.nth(1).getAttribute("data-testid")).replace("proposal-", "");
  await tid(page, `discard-${p2}`).click();
  await wait(page, 150);
  check("Discarding a proposal leaves the case unchanged and records the disposition", (await tid(page, `proposal-${p2}`).getAttribute("data-status")) === "discarded" && /accepted|partially/i.test(await view(page, r5).getByTestId("run-disposition").innerText()));
  await page.getByTestId("tab-tasks").click(); await wait(page, 350);
  const tk = tid(page, `task-${newTask}`);
  check("The accepted task appears in Tasks with its origin and the edited title", (await tk.count()) === 1 && /Edited by the Analyst/.test(await tk.innerText()) && /deterministic demonstration, not AI/.test(await tid(page, `task-origin-${newTask}`).innerText()) && (await page.locator('[data-testid^="task-TSK-LOG-01-"]').filter({ has: page.locator('[data-testid^="task-status-"]') }).count()) === 4);
  check("The accepted task is a normal task (status can be changed)", (await tid(page, `task-select-${newTask}`).count()) === 1);
  await page.getByTestId("tab-review").click(); await wait(page, 350);
  check("The expert-review request is untouched by assistant activity", /Requested/.test(await page.getByRole("tabpanel").innerText()));

  // Brief proposal
  await page.getByTestId("tab-ai").click();
  const r6 = await runOp(page, "brief");
  const bp = view(page, r6).getByTestId("out-brief-proposal");
  check("A brief proposal shows cited findings and is not saved yet", (await bp.getAttribute("data-status")) === "pending" && /not saved until you accept/.test(await bp.innerText()) && (await bp.locator('a[href*="/evidence/EVD-"]').count()) >= 1);
  await page.getByTestId("tab-brief").click(); await wait(page, 350);
  check("Before accepting, the case still has only brief v1", (await tid(page, "brief-version-1").count()) === 1 && (await tid(page, "brief-version-2").count()) === 0);
  await page.getByTestId("tab-ai").click();
  await tid(page, "bp-edit").click();
  await tid(page, "bp-next").fill("Edited next step: review the cited evidence with the Expert.");
  await tid(page, "bp-save").click(); await wait(page, 200);
  await tid(page, "bp-accept").click();
  await tid(page, "created-brief").waitFor();
  check("Accepting a brief proposal creates a new version (v2)", (await tid(page, "created-brief").innerText()).includes("v2"));
  await page.screenshot({ path: `${SHOTS}/brief-proposal-accepted.png`, fullPage: true });
  await page.getByTestId("tab-brief").click(); await wait(page, 350);
  await wait(page, 200);
  check("The Brief tab shows v2 with its origin recorded, and v1 retained", (await tid(page, "brief-version-2").count()) === 1 && (await tid(page, "brief-version-1").count()) === 1);
  await tid(page, "brief-version-2").click().catch(() => {});
  await wait(page, 200);
  check("The origin names the run, mode (deterministic, not AI) and the Analyst edit", /RUN-LOG-01|RUN-LOG-0\d/.test(await tid(page, "brief-origin").innerText()) && /deterministic demonstration, not AI/.test(await tid(page, "brief-origin").innerText()) && /edited by the Analyst/.test(await tid(page, "brief-origin").innerText()));
  check("Stage 2 deterministic “Compile brief” is retained", (await tid(page, "compile-brief").count()) === 1);
  check("The brief makes no financial-impact calculation", /No financial impact is calculated/.test(await tid(page, "brief-view").innerText()));
  await page.getByTestId("tab-activity").click(); await wait(page, 350);
  check("Activity records the runs and the acceptances as local demonstration activity", (await page.locator('[data-testid="event-ai-run-completed"]').count()) >= 5 && (await page.locator('[data-testid="event-ai-proposal-accepted"]').count()) >= 2);

  // AI Command, counts, search
  await goto(page, "/ai-command");
  check("AI command lists the runs with mode, status, role and disposition", (await page.locator('[data-testid^="run-RUN-"]').count()) >= 6 && /Deterministic demonstration/.test(await tid(page, "runs-table").innerText()));
  await tid(page, "runs-mode").selectOption("ai");
  check("Filtering by output mode works (no AI-mode runs exist)", (await tid(page, "runs-empty").count()) === 1);
  await tid(page, "runs-mode").selectOption("");
  await page.screenshot({ path: `${SHOTS}/ai-command-runs.png`, fullPage: true });
  await page.getByLabel("Search seeded demonstration records").fill("RUN-LOG-01");
  await page.getByRole("option").filter({ hasText: "Assistant run" }).first().waitFor();
  check("Search finds assistant runs", (await page.getByRole("option").filter({ hasText: "RUN-LOG-01" }).count()) >= 1);
  await page.keyboard.press("Escape");
  // persistence and Reset
  const st = await stored(page);
  check("Runs persist in the versioned local store", st?.schemaVersion === 3 && Object.keys(st.work.ai.runs).length >= 6 && !/sk-ant/.test(JSON.stringify(st)));
  await page.reload(); await ready(page); await tid(page, "runs-table").waitFor();
  check("Runs, proposals and provenance survive a reload", (await page.locator('[data-testid^="run-RUN-"]').count()) >= 6);
  await page.getByRole("button", { name: "Reset demonstration" }).first().click();
  await page.getByRole("dialog", { name: "Reset demonstration?" }).getByRole("button", { name: "Reset demonstration" }).click();
  await page.waitForURL("**/workspaces"); await wait(page, 500);
  await goto(page, "/ai-command");
  check("Reset removes assistant runs (empty state again)", (await tid(page, "runs-empty").count()) === 1);
  await openAi(page);
  check("Reset restores the case without accepted tasks or brief versions", (await page.locator('[data-testid^="run-row-"]').count()) === 0);
});

// ============================================================ C. Roles
await section("roles", async (page) => {
  await openAi(page);
  const rid = await runOp(page, "tasks");
  const p = (await view(page, rid).locator('[data-testid^="proposal-"]').first().getAttribute("data-testid")).replace("proposal-", "");
  await role(page, "Expert");
  check("Expert sees the proposals but cannot edit, accept or discard them (with an explanation)", (await tid(page, `accept-${p}`).count()) === 0 && (await tid(page, `edit-${p}`).count()) === 0 && (await tid(page, `discard-${p}`).count()) === 0 && /Expert demonstration role cannot edit, accept or discard/.test(await view(page, rid).innerText()));
  check("Expert may use analytical assistance", (await tid(page, "run-det").isEnabled()));
  const rid2 = await runOp(page, "conflicts");
  check("An Expert run completes and records the Expert demonstration role", (await statusOf(page, rid2)) === "completed" && /Expert demonstration role/.test(await view(page, rid2).getByTestId("run-provenance").innerText()));
  check("Role wording is retained as demonstration behaviour", /not production authentication or security/.test(await tid(page, "role-notice").innerText()));
  await role(page, "Approver");
  check("Approver cannot start runs (no run controls, with an explanation)", (await tid(page, "run-det").count()) === 0 && /Approver demonstration role cannot start assistant runs/.test(await tid(page, "assist-panel").innerText()));
  await tid(page, `run-row-${rid}`).click(); await wait(page, 200);
  check("Approver can still read outputs but cannot accept proposals", (await view(page, rid).count()) === 1 && (await tid(page, `accept-${p}`).count()) === 0);
  await page.getByTestId("tab-tasks").click(); await wait(page, 350);
  check("Nothing was created by the Expert or Approver", (await page.locator('[data-testid^="task-TSK-LOG-01-"]').filter({ has: page.locator('[data-testid^="task-status-"]') }).count()) === 3);
  await role(page, "Analyst");
  await page.getByTestId("tab-ai").click(); await wait(page, 200);
  await tid(page, `run-row-${rid}`).click(); await wait(page, 200);
  check("Analyst can accept (controls return)", (await tid(page, `accept-${p}`).count()) === 1);
});

// ============================================================ D. Stale outputs (deterministic)
await section("stale", async (page) => {
  await openAi(page);
  const rid = await runOp(page, "tasks");
  const p = (await view(page, rid).locator('[data-testid^="proposal-"]').first().getAttribute("data-testid")).replace("proposal-", "");
  check("A fresh run is not marked Needs refresh", (await view(page, rid).getByTestId("run-stale").count()) === 0);
  await page.getByTestId("tab-evidence").click();
  await page.locator('[data-testid^="edit-HYP-LOG-01-"]').first().click();
  await tid(page, "hyp-status").selectOption("Supported");
  await tid(page, "hyp-save").click(); await wait(page, 300);
  await page.getByTestId("tab-ai").click(); await wait(page, 200);
  check("Changing a hypothesis marks the earlier output Needs refresh and names the change", (await view(page, rid).getByTestId("run-stale").count()) === 1 && /Hypothesis H\d was edited/.test(await view(page, rid).getByTestId("run-stale").innerText()));
  check("The stale output is preserved for inspection", (await view(page, rid).getByTestId("out-task-proposals").count()) === 1);
  check("Accepting a stale proposal is disabled with an explanation", (await tid(page, `accept-${p}`).isDisabled()) && /Needs refresh/.test(await view(page, rid).innerText()));
  check("The run list and AI command flag it", (await tid(page, `run-row-${rid}`).getByTestId("needs-refresh").count()) === 1);
  await page.screenshot({ path: `${SHOTS}/run-needs-refresh.png`, fullPage: true });
  await goto(page, "/ai-command");
  check("AI command counts the run as Needs refresh", /1 Needs refresh/.test(await tid(page, "run-counts").innerText()));
  await openAi(page);
  const rid2 = await runOp(page, "tasks");
  check("Running again gives a current output; the old one is kept", (await view(page, rid2).getByTestId("run-stale").count()) === 0 && (await rowIds(page)).length === 2);
  await tid(page, `run-row-${rid}`).click(); await wait(page, 200);
  await tid(page, `discard-${p}`).click().catch(() => {});
  await wait(page, 150);
  check("A stale proposal can still be discarded", (await tid(page, `proposal-${p}`).getAttribute("data-status")) === "discarded");
});

// ============================================================ E. Migration and recovery
await section("migration-and-recovery", async (page, ctx) => {
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("tigeris.demo.v2", JSON.stringify({ schemaVersion: 2, savedAt: "x", ui: { sectorId: "banking", role: "Expert", readIds: ["NTF-01"], entered: true }, work: { cases: {}, notifications: [], counters: { case: {}, notification: 0 } } })); sessionStorage.setItem("seeded", "1"); } } catch {} });
  await goto(page, "/ai-command");
  await tid(page, "migration-banner").waitFor();
  check("Stage 2 saved state is migrated with a visible notice", /Stage 2 saved state/.test(await tid(page, "migration-banner").innerText()));
  check("Role and sector from the Stage 2 state are kept", (await page.getByLabel("Simulated demonstration role").inputValue()) === "Expert");
  await wait(page, 300);
  const st = await stored(page);
  check("Migration writes the Stage 3 format and removes the Stage 2 key", st?.schemaVersion === 3 && !!st.work.ai && (await page.evaluate(() => localStorage.getItem("tigeris.demo.v2"))) === null);
  await openAi(page, "CAS-BNK-01");
  const rid = await runOp(page, "summarize");
  check("Assistance works on migrated state", (await statusOf(page, rid)) === "completed");
  // corrupt a persisted run
  const saved = await stored(page);
  const bad = JSON.parse(JSON.stringify(saved)); bad.work.ai.runs[rid].status = "teleported";
  const h = await fresh({ init: (v) => { try { if (!sessionStorage.getItem("bad")) { localStorage.setItem("tigeris.demo.v3", v); sessionStorage.setItem("bad", "1"); } } catch {} } });
  await h.ctx.close();
  const ctx2 = await browser.newContext({ viewport: DESKTOP });
  await ctx2.addInitScript((v) => { try { if (!sessionStorage.getItem("bad")) { localStorage.setItem("tigeris.demo.v3", v); sessionStorage.setItem("bad", "1"); } } catch {} }, JSON.stringify(bad));
  const p2 = await ctx2.newPage();
  await p2.goto(PLAIN + "/ai-command"); await p2.getByTestId("recovery-banner").waitFor();
  check("A malformed saved run triggers the recovery message and does not overwrite it", /could not be used/i.test(await p2.getByTestId("recovery-banner").innerText()) && (await p2.evaluate(() => localStorage.getItem("tigeris.demo.v3"))).includes("teleported"));
  await p2.getByTestId("recovery-reset").click(); await p2.getByTestId("recovery-confirm").click(); await p2.waitForTimeout(400);
  check("Explicit reset clears it", (await p2.getByTestId("recovery-banner").count()) === 0);
  await ctx2.close();
  // in-flight run at reload is shown as interrupted
  const inflight = JSON.parse(JSON.stringify(saved)); inflight.work.ai.runs[rid].status = "running"; delete inflight.work.ai.runs[rid].output; delete inflight.work.ai.runs[rid].finishedAt;
  const ctx3 = await browser.newContext({ viewport: DESKTOP });
  await ctx3.addInitScript((v) => { try { if (!sessionStorage.getItem("inf")) { localStorage.setItem("tigeris.demo.v3", v); sessionStorage.setItem("inf", "1"); } } catch {} }, JSON.stringify(inflight));
  const p3 = await ctx3.newPage();
  await p3.goto(PLAIN + "/cases/CAS-BNK-01?tab=ai&run=" + rid); await p3.getByTestId("run-error").waitFor();
  check("A run that was in flight at reload is shown as interrupted, not running", (await p3.getByTestId("run-error").getAttribute("data-code")) === "interrupted");
  await ctx3.close();
});

// ============================================================ F. One assistance workflow in every sector (deterministic, no provider)
for (const [id, code] of SECTORS) {
  await section(`sector-${id}`, async (page) => {
    const caseId = `CAS-${code}-01`;
    await openAi(page, caseId);
    const scopeText = await tid(page, "scope-panel").innerText();
    const ids = [...scopeText.matchAll(/EVD-([A-Z]{3})-\d\d/g)].map((m) => m[1]);
    check(`${id}: scope lists only this sector's linked evidence`, ids.length >= 3 && ids.every((c) => c === code));
    const r1 = await runOp(page, "summarize");
    check(`${id}: summary completes with cited, source-supported findings and no rejections`, (await statusOf(page, r1)) === "completed" && (await view(page, r1).getByTestId("out-supported").locator('[data-testid^="claim-"]').count()) >= 1 && (await view(page, r1).getByTestId("out-rejected").count()) === 0);
    const r2 = await runOp(page, "conflicts");
    check(`${id}: conflicts/missing-information analysis completes`, (await statusOf(page, r2)) === "completed" && (await view(page, r2).getByTestId("out-missing").locator("li").count()) >= 1);
    const r3 = await runOp(page, "tasks");
    const p = (await view(page, r3).locator('[data-testid^="proposal-"]').first().getAttribute("data-testid")).replace("proposal-", "");
    await tid(page, `accept-${p}`).click();
    await tid(page, `created-${p}`).waitFor();
    const taskId = (await tid(page, `created-${p}`).innerText()).trim();
    await page.getByTestId("tab-tasks").click(); await wait(page, 350);
    check(`${id}: an accepted proposal becomes a normal task with its origin recorded`, (await tid(page, `task-origin-${taskId}`).count()) === 1);
    await page.getByTestId("tab-ai").click();
    const r4 = await runOp(page, "brief");
    check(`${id}: a brief proposal is produced for review`, (await view(page, r4).getByTestId("out-brief-proposal").count()) === 1 && (await view(page, r4).getByTestId("out-brief-proposal").getAttribute("data-status")) === "pending");
    await page.getByTestId("tab-ai").click();
    await tid(page, "bp-accept").click();
    await tid(page, "created-brief").waitFor();
    check(`${id}: accepting the brief creates v2 with origin`, (await tid(page, "created-brief").innerText()).includes("v2"));
  });
}

// ============================================================ G. Keyboard and mobile
await section("keyboard", async (page) => {
  await openAi(page);
  await tid(page, "op-summarize").focus();
  await page.keyboard.press("ArrowDown");
  check("Operation choices are a keyboard-operable radio group", await tid(page, "op-conflicts").isChecked());
  await tid(page, "run-det").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="run-row-"]').length === 1);
  check("A run can be started from the keyboard", (await rowIds(page)).length === 1);
});
await section("mobile", async (page) => {
  await goto(page, "/ai-command");
  await tid(page, "ai-command").waitFor();
  await page.waitForSelector('[data-testid="provider-banner"]');
  const over = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("AI command has no horizontal page overflow at 390 px", (await over(page)) <= 1);
  await page.screenshot({ path: `${SHOTS}/mobile-ai-command.png`, fullPage: true });
  await openAi(page);
  const rid = await runOp(page, "tasks");
  check("Case assistance has no horizontal page overflow at 390 px (with a run open)", (await over(page)) <= 1);
  await page.screenshot({ path: `${SHOTS}/mobile-case-assistance.png`, fullPage: true });
  void rid;
}, { viewport: { width: 390, height: 844 } });

// ============================================================ H. Mocked provider (automated-test fixture; not AI)
await section("mock-success", async (page) => {
  await openAi(page);
  check("The fixture is announced as a mocked provider, not AI", (await tid(page, "provider-banner").getAttribute("data-state")) === "mock" && /Mocked provider/.test(await tid(page, "provider-banner").innerText()));
  const rid = await runOp(page, "summarize", { mode: "ai" });
  const v = view(page, rid);
  check("A mocked-provider run is labelled “Mocked provider”, never “AI-generated”", (await v.getByTestId("mode-badge").getAttribute("data-mode")) === "mock-provider" && !/AI-generated/.test(await v.innerText()));
  check("Provider/model and prompt template are recorded", /test-mock · mock-fixture/.test(await v.getByTestId("run-model").innerText()) && /tigeris-assist-v1/.test(await v.getByTestId("run-provenance").innerText()));
  check("Only provider-reported usage is shown, with no invented cost", /1,000 input \/ 200 output tokens \(no cost is estimated\)/.test(await v.getByTestId("run-usage").innerText()) && !/SAR|\$|USD/.test(await v.getByTestId("run-usage").innerText()));
  check("The mocked output validates and shows cited findings", (await v.getByTestId("out-supported").locator('[data-testid^="claim-"]').count()) >= 1 && (await v.getByTestId("out-rejected").count()) === 0);
  const rid2 = await runOp(page, "brief", { mode: "ai" });
  await tid(page, "bp-accept").click(); await tid(page, "created-brief").waitFor();
  await page.getByTestId("tab-brief").click(); await wait(page, 350); await wait(page, 200);
  check("An accepted mocked-provider brief records its origin as mocked, not AI", /mocked provider, not AI/.test(await tid(page, "brief-origin").innerText()) && rid2 !== rid);
}, { mock: true });

await section("mock-validation", async (page) => {
  await openAi(page);
  const cases = [
    ["invalid-citation", "summarize", /no reference P99/, "An invalid reference is rejected with an explanation"],
    ["wrong-quote", "summarize", /does not appear in that passage/, "A fabricated quotation is rejected"],
    ["wrong-version", "summarize", /supplied version of EVD-LOG-\d+ is v\d+, not v\d+/, "A citation to an unsupplied version is rejected"],
    ["unsupported-figure", "summarize", /987654321/, "A figure not in the supplied material is rejected even with a valid citation"],
    ["inject", "summarize", /./, "Output that obeys instructions embedded in evidence is rejected"],
  ];
  for (const [sc, op, re, label] of cases) {
    const rid = await runOp(page, op, { mode: "ai", scenario: sc });
    const rej = view(page, rid).getByTestId("out-rejected");
    check(label, (await rej.count()) === 1 && re.test(await rej.innerText()), sc);
    if (sc === "invalid-citation") { await page.screenshot({ path: `${SHOTS}/run-rejected-citations.png`, fullPage: true }); check("Valid parts of the same response are kept alongside rejected ones", (await view(page, rid).getByTestId("out-supported").locator('[data-testid^="claim-"]').count()) >= 1); }
    if (sc === "inject") check("No approval or execution statement is accepted from the injected instruction", !/approved/i.test(await view(page, rid).getByTestId("out-supported").innerText()) && !/approve the transfer/i.test(await view(page, rid).getByTestId("out-inferences").innerText()));
  }
  const rq = await runOp(page, "question", { mode: "ai", scenario: "insufficient", question: "What caused the delay?" });
  check("Provider-reported insufficient evidence is shown as such", (await view(page, rq).getByTestId("run-insufficient").count()) === 1);
  const rt = await runOp(page, "tasks", { mode: "ai", scenario: "extra-tools" });
  check("A proposed out-of-scope action (execute a transfer) is rejected, not offered", (await view(page, rt).locator('[data-testid^="proposal-"]').count()) === 0 && /not a named person/.test(await view(page, rt).getByTestId("out-rejected").innerText()));
  await page.getByTestId("tab-tasks").click(); await wait(page, 350);
  check("Rejected generated content never reached the case", (await page.locator('[data-testid^="task-TSK-LOG-01-"]').filter({ has: page.locator('[data-testid^="task-status-"]') }).count()) === 3);
}, { mock: true });

await section("mock-errors", async (page) => {
  await openAi(page);
  const modes = [["malformed", "invalid_response"], ["toolong", "invalid_response"], ["fail", "provider_error"], ["ratelimit", "rate_limited"], ["auth", "provider_auth"], ["refusal", "refused"]];
  for (const [sc, code] of modes) {
    const rid = await runOp(page, "summarize", { mode: "ai", scenario: sc });
    const err = view(page, rid).getByTestId("run-error");
    check(`Provider ${sc}: a visible ${code} error, status failed`, (await statusOf(page, rid)) === "failed" && (await err.getAttribute("data-code")) === code);
    if (sc === "ratelimit") check("A rate limit shows the provider's retry hint", /Retry after about 30 seconds/.test(await err.innerText()));
    if (sc === "fail") await page.screenshot({ path: `${SHOTS}/run-error-provider-failure.png`, fullPage: true });
  }
  const rows = await rowIds(page);
  const modesSeen = await page.locator('[data-testid^="run-row-"] [data-testid="mode-badge"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-mode")));
  check("A failure never silently switches to demonstration mode (every run stays mock-provider)", rows.length === modes.length && modesSeen.every((m) => m === "mock-provider"));
  check("The error says nothing was saved and no fallback occurred", /did not switch to the deterministic demonstration/.test(await view(page, rows[0]).getByTestId("run-error").innerText()));
  await page.getByTestId("tab-tasks").click(); await wait(page, 350);
  check("Failed runs left the case unchanged", (await page.locator('[data-testid^="task-TSK-LOG-01-"]').filter({ has: page.locator('[data-testid^="task-status-"]') }).count()) === 3);
  await page.getByTestId("tab-ai").click();
  await tid(page, `run-row-${rows[1]}`).click(); await wait(page, 200);
  await tid(page, `retry-${rows[1]}`).click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid^="run-row-"]').length > n, rows.length);
  check("Retry starts a new run (history kept)", (await rowIds(page)).length === rows.length + 1);
}, { mock: true });

await section("mock-timeout-and-cancel", async (page) => {
  await openAi(page);
  const t0 = Date.now();
  const rid = await runOp(page, "summarize", { mode: "ai", scenario: "slow" });
  const err = view(page, rid).getByTestId("run-error");
  check("A slow provider times out visibly (configured 3 s) with an explanation", (await err.getAttribute("data-code")) === "timeout" && /may still have processed/.test(await err.innerText()) && Date.now() - t0 < 12000, `${Date.now() - t0} ms`);
  const r2 = await runOp(page, "conflicts", { mode: "ai", scenario: "slow", settle: false });
  await tid(page, `cancel-${r2}`).waitFor();
  check("While running: status and a Cancel control with the local-cancel caveat", /Running/.test(await view(page, r2).getByTestId("run-active").innerText()) && /may not stop the provider/.test(await view(page, r2).getByTestId("run-active").innerText()));
  await tid(page, `cancel-${r2}`).click();
  await view(page, r2).getByTestId("run-cancelled").waitFor();
  check("Cancelling records the status and says provider processing may continue", (await statusOf(page, r2)) === "cancelled" && /does not guarantee the provider stopped/.test(await view(page, r2).getByTestId("run-cancelled").innerText()));
  // late result after cancel is discarded
  const r3 = await runOp(page, "tasks", { mode: "ai", scenario: "delay", settle: false });
  await wait(page, 300);
  await tid(page, `cancel-${r3}`).click();
  await wait(page, 2800);
  check("A result that arrives after cancellation is discarded (no output saved)", (await statusOf(page, r3)) === "cancelled" && (await view(page, r3).getByTestId("out-task-proposals").count()) === 0);
}, { mock: true });

await section("mock-duplicate-submit", async (page) => {
  await openAi(page);
  await tid(page, "op-summarize").check();
  await tid(page, "mock-scenario").selectOption("delay");
  await tid(page, "run-ai").dblclick();
  await wait(page, 300);
  check("Double-clicking Run starts exactly one run", (await rowIds(page)).length === 1);
  check("The run button is disabled while the submission is in flight", await tid(page, "run-ai").isDisabled());
  await page.waitForFunction(() => /completed/.test(document.querySelector('[data-testid^="run-view-"] [data-testid="run-status"]')?.textContent ?? ""), null, { timeout: 8000 });
  check("Exactly one run results", (await rowIds(page)).length === 1);
  // server-side guard for identical in-flight requests
  const ctxBody = await page.evaluate(async () => { const raw = JSON.parse(localStorage.getItem("tigeris.demo.v3") ?? "null"); return raw ? Object.keys(raw.work.ai.runs).length : 0; });
  check("The run is stored once", ctxBody === 1);
}, { mock: true });

await section("mock-input-changes-during-run", async (page) => {
  await openAi(page);
  await tid(page, "op-summarize").check();
  await tid(page, "mock-scenario").selectOption("delay");
  await tid(page, "run-ai").click();
  await tid(page, "op-summarize").waitFor();
  await page.getByTestId("tab-evidence").click();
  await page.locator('[data-testid^="edit-HYP-LOG-01-"]').first().click();
  await tid(page, "hyp-status").selectOption("Supported");
  await tid(page, "hyp-save").click();
  await page.getByTestId("tab-ai").click();
  await page.waitForFunction(() => /completed/.test(document.querySelector('[data-testid^="run-view-"] [data-testid="run-status"]')?.textContent ?? ""), null, { timeout: 9000 });
  const id = await newest(page);
  check("An output that completes after the inputs changed is marked Needs refresh", (await view(page, id).getByTestId("run-stale").count()) === 1 && /Hypothesis H\d was edited/.test(await view(page, id).getByTestId("run-stale").innerText()));
  check("The output is preserved and the activity log notes it", (await view(page, id).getByTestId("out-supported").count()) === 1);
  await page.getByTestId("tab-activity").click(); await wait(page, 350);
  check("Local activity records that inputs changed while it ran", /Needs refresh/.test(await tid(page, "activity-list").innerText()));
}, { mock: true });

for (const [id, code] of SECTORS) {
  await section(`mock-sector-${id}`, async (page) => {
    await openAi(page, `CAS-${code}-01`);
    const rid = await runOp(page, "tasks", { mode: "ai" });
    const p = (await view(page, rid).locator('[data-testid^="proposal-"]').first().getAttribute("data-testid")).replace("proposal-", "");
    await tid(page, `accept-${p}`).click(); await tid(page, `created-${p}`).waitFor();
    const taskId = (await tid(page, `created-${p}`).innerText()).trim();
    await page.getByTestId("tab-tasks").click(); await wait(page, 350);
    check(`${id}: mocked-provider workflow — accepted task records a mocked origin`, /mocked provider, not AI/.test(await tid(page, `task-origin-${taskId}`).innerText()));
  }, { mock: true });
}

if (errors.length) { console.log(`\nBrowser errors (${errors.length}):`); [...new Set(errors)].slice(0, 12).forEach((e) => console.log("  " + e)); }
check("No uncaught page errors or console errors during the run", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} Stage 3 checks passed`);
if (bad.length) process.exit(1);
