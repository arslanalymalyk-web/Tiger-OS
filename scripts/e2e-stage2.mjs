/* Stage 2 workflow checks (Playwright). Usage: npm run build && npm start -- -p 3100 & node scripts/e2e-stage2.mjs [baseUrl] [shotDir]
   Every section runs in a fresh browser context (empty localStorage). BROWSER=firefox|webkit if installed. */
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require("/node-tools/node_modules/playwright"); }
const BASE = process.argv[2] ?? "http://localhost:3100";
const SHOTS = process.argv[3] ?? "./e2e-shots-stage2";
fs.mkdirSync(SHOTS, { recursive: true });
const BROWSER = process.env.BROWSER || "chromium";
let browser;
try { browser = await pw[BROWSER].launch(); } catch (e) { console.log(`UNAVAILABLE  ${BROWSER} could not be launched: ${String(e.message).split("\n")[0]}`); process.exit(2); }
console.log(`Running Stage 2 checks in ${BROWSER}`);

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const errors = [];
const DESKTOP = { width: 1440, height: 900 };

async function fresh(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? DESKTOP });
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text()}`));
  return { ctx, page };
}
const section = async (name, fn) => {
  const h = await fresh();
  try { await fn(h.page, h.ctx); } catch (e) { check(`${name}: section completed without an exception`, false, String(e.message).split("\n")[0]); await h.page.screenshot({ path: `${SHOTS}/failure-${name.replace(/\W+/g, "-")}.png`, fullPage: true }).catch(() => {}); }
  await h.ctx.close();
};
const tid = (page, id) => page.getByTestId(id);
const ready = async (page) => { await page.waitForFunction(() => { const s = document.querySelector('select[aria-label="Simulated demonstration role"]'); return s && s.value; }, null, { timeout: 8000 }); };
const goto = async (page, path) => { await page.goto(BASE + path); await ready(page); };
const role = async (page, r) => { await page.getByLabel("Simulated demonstration role").selectOption(r); await page.waitForFunction((x) => document.querySelector('select[aria-label="Simulated demonstration role"]').value === x, r); await page.waitForTimeout(100); };
const openCase = async (page, id, tab = "overview") => { await goto(page, `/cases/${id}?tab=${tab}`); await tid(page, `case-workspace-${id}`).waitFor(); };
const statusOf = async (page) => (await tid(page, "case-status").first().textContent())?.trim();
const errText = async (page) => ((await tid(page, "form-errors").first().innerText().catch(() => "")) || "");
const wait = (page, ms = 150) => page.waitForTimeout(ms);
const stored = (page) => page.evaluate(() => { const v = localStorage.getItem("tigeris.demo.v2"); return v ? JSON.parse(v) : null; });
const SECTORS = [["energy", "ENR"], ["banking", "BNK"], ["insurance", "INS"], ["manufacturing", "MFG"], ["logistics", "LOG"], ["realestate", "REA"], ["infrastructure", "INF"], ["sovereign", "SOV"]];

// ============================================================ A. Cases list, filters, empty state
await section("cases-list", async (page) => {
  await goto(page, "/cases");
  await tid(page, "cases-table").waitFor();
  check("Cases page lists all 18 seeded cases", (await tid(page, "case-count").innerText()).includes("18 of 18"));
  await tid(page, "filter-sector").selectOption("logistics");
  check("Sector filter narrows to Logistics (2)", (await tid(page, "case-count").innerText()).includes("2 of 18"));
  await tid(page, "filter-status").selectOption("Expert review");
  check("Status filter adds to the sector filter (1)", (await tid(page, "case-count").innerText()).includes("1 of 18") && (await tid(page, "case-row-CAS-LOG-01").count()) === 1);
  await tid(page, "clear-filters").click();
  await tid(page, "filter-priority").selectOption("Critical");
  check("Priority filter finds the 2 Critical cases", (await tid(page, "case-count").innerText()).includes("2 of 18"));
  await tid(page, "clear-filters").click();
  await tid(page, "filter-owner").selectOption("PER-LOG-01");
  check("Owner filter finds Tariq Al-Ghamdi's case", (await tid(page, "case-count").innerText()).includes("1 of 18"));
  await tid(page, "clear-filters").click();
  await tid(page, "case-search").fill("Wadi hub");
  check("Search filters by title text", (await tid(page, "case-count").innerText()).includes("1 of 18") && (await tid(page, "case-row-CAS-ENR-01").count()) === 1);
  await tid(page, "case-search").fill("zzzz-no-match");
  await tid(page, "cases-empty").waitFor();
  check("A search with no results shows a clear empty state", (await tid(page, "cases-empty").innerText()).includes("No cases match"));
  await tid(page, "cases-empty").getByRole("button", { name: "Clear filters" }).click();
  check("Clear filters from the empty state restores the list", (await tid(page, "case-count").innerText()).includes("18 of 18"));
  check("Eight signals have no active case", (await page.locator('[data-testid^="untriaged-"]').count()) === 8);
  await page.screenshot({ path: `${SHOTS}/cases-list.png`, fullPage: true });
});

// ============================================================ B–D. Create, duplicates, edit/reload, hypotheses, evidence, tasks
await section("create-edit-link-tasks", async (page) => {
  await goto(page, "/cases");
  await tid(page, "create-from-SIG-LOG-05").click();
  const dlg = tid(page, "create-case-dialog");
  await dlg.waitFor();
  check("Create-from-signal dialog is a named modal with the signal prefilled", (await page.getByRole("dialog", { name: "Create case from signal" }).count()) === 1 && (await tid(page, "create-title").inputValue()).includes("vessel waiting"));
  await tid(page, "create-title").fill("ab");
  await tid(page, "create-submit").click();
  check("Case creation validates the title and says so", /at least 5 characters/.test(await errText(page)));
  await tid(page, "create-title").fill("Gateway vessel waiting-time constraint");
  await tid(page, "create-question").fill("Is the longer vessel waiting time a systemic constraint on Western-lane delivery?");
  await tid(page, "create-submit").click();
  await page.waitForURL("**/cases/CAS-LOG-03");
  await tid(page, "case-workspace-CAS-LOG-03").waitFor();
  check("Creating a case from a signal opens the new case (CAS-LOG-03) in Draft", (await statusOf(page)) === "Draft" && (await tid(page, "case-title").innerText()).includes("vessel waiting-time"));
  const s0 = await stored(page);
  check("The new case is persisted locally", !!s0?.work?.cases?.["CAS-LOG-03"]);
  // duplicate prevention
  await goto(page, "/cases");
  check("Signal SIG-LOG-05 no longer appears as unassigned", (await tid(page, "untriaged-SIG-LOG-05").count()) === 0 && (await tid(page, "case-count").innerText()).includes("19 of 19"));
  await tid(page, "new-case-button").click();
  await tid(page, "create-signal").selectOption("SIG-LOG-01");
  await tid(page, "duplicate-warning").waitFor();
  check("A signal with an active case shows a duplicate warning that offers the existing case", (await tid(page, "duplicate-warning").innerText()).includes("CAS-LOG-01") && (await tid(page, "create-submit").isDisabled()));
  await tid(page, "open-existing-case").click();
  await page.waitForURL("**/cases/CAS-LOG-01");
  check("“Open existing case” goes to CAS-LOG-01", (await tid(page, "case-title").innerText()).includes("Gateway corridor"));
  await goto(page, "/cases");
  await tid(page, "new-case-button").click();
  await tid(page, "create-signal").selectOption("SIG-LOG-05");
  await tid(page, "duplicate-warning").waitFor();
  check("The newly linked signal is also protected from duplicates", (await tid(page, "duplicate-warning").innerText()).includes("CAS-LOG-03"));
  await page.keyboard.press("Escape");
  // standalone creation
  await tid(page, "new-case-button").click();
  await tid(page, "create-sector").selectOption("energy");
  await tid(page, "create-title").fill("Standalone: export terminal readiness");
  await tid(page, "create-submit").click();
  await page.waitForURL("**/cases/CAS-ENR-03");
  check("A standalone case can be created without a signal (CAS-ENR-03)", (await page.getByText("None (standalone)").count()) >= 1);
  // edit + reload
  await openCase(page, "CAS-LOG-03");
  await tid(page, "edit-title").fill("Gateway vessel waiting-time constraint (revised)");
  await tid(page, "edit-priority").selectOption("High");
  await tid(page, "save-case").click();
  await tid(page, "notice").waitFor();
  await page.reload(); await ready(page);
  await tid(page, "case-title").waitFor();
  check("Edited title and priority survive a reload", (await tid(page, "case-title").innerText()).includes("(revised)") && (await page.getByText("High").first().count()) > 0);
  check("No-change save is reported, not silently accepted", (await (async () => { await tid(page, "save-case").click(); return errText(page); })()).includes("No changes"));
  // state machine
  check("Draft case offers Investigating and Closed only", (await tid(page, "transition-Investigating").count()) === 1 && (await tid(page, "transition-Closed").count()) === 1 && (await tid(page, "transition-Brief-ready").count()) === 0);
  await tid(page, "go-Investigating").click(); await wait(page, 250);
  check("Draft → Investigating succeeds when anchored", (await statusOf(page)) === "Investigating");
  check("Investigating → Expert review is blocked with reasons", (await tid(page, "transition-Expert-review").locator("li").count()) >= 2 && /hypothesis/i.test(await tid(page, "transition-Expert-review").innerText()));
  // hypotheses and evidence
  await tid(page, "tab-evidence").click();
  await tid(page, "hyp-statement").fill("Short");
  await tid(page, "hyp-save").click();
  check("Hypothesis is validated", /at least 10/.test(await errText(page)));
  await tid(page, "hyp-statement").fill("Quay-crane maintenance is the main cause of longer waiting times.");
  await tid(page, "hyp-save").click(); await wait(page);
  await tid(page, "hyp-kind").selectOption("alternative");
  await tid(page, "hyp-statement").fill("A seasonal volume peak explains the longer waiting times.");
  await tid(page, "hyp-save").click(); await wait(page);
  check("Primary hypothesis and an alternative explanation are recorded", (await page.locator('[data-testid^="hyp-HYP-LOG-03-"]').count()) === 2);
  await tid(page, "link-evidence-select").selectOption("EVD-LOG-04");
  await tid(page, "link-hypothesis-select").selectOption("HYP-LOG-03-01");
  await tid(page, "link-ref-P1").check(); await tid(page, "link-ref-P2").check();
  await tid(page, "link-evidence-submit").click(); await wait(page, 250);
  check("Evidence linked as supporting with references", (await page.getByText("Supporting evidence (1)").count()) === 1);
  await tid(page, "link-evidence-select").selectOption("EVD-LOG-04");
  await tid(page, "link-hypothesis-select").selectOption("HYP-LOG-03-01");
  await tid(page, "link-evidence-submit").click(); await wait(page);
  check("Linking the same evidence to the same hypothesis twice is prevented", /already linked/.test(await errText(page)));
  await tid(page, "link-evidence-select").selectOption("EVD-LOG-04");
  await tid(page, "link-stance-select").selectOption("contradicts");
  await tid(page, "link-hypothesis-select").selectOption("HYP-LOG-03-02");
  await tid(page, "link-ref-P3").check();
  await tid(page, "link-evidence-submit").click(); await wait(page, 250);
  check("The same evidence can contradict another hypothesis (recorded as contradictory)", (await page.getByText("Contradictory evidence (1)").count()) === 1);
  const linkRows = page.locator('[data-testid^="link-LNK-LOG-03-"]');
  await linkRows.nth(1).locator("select").selectOption("context"); await wait(page, 250);
  check("Changing a stance is recorded in the link's history", (await page.getByText("Stance history").count()) >= 1);
  await linkRows.nth(1).getByRole("button", { name: "Unlink" }).click(); await wait(page, 250);
  check("Unlinking keeps a visible history entry", (await page.getByText("Unlinked evidence history (1)").count()) === 1);
  // evidence references open the readable source at the referenced paragraph
  await page.locator('[data-testid^="ref-EVD-LOG-04-P1"]').first().click();
  await page.waitForURL("**/evidence/EVD-LOG-04?v=1#ref-P1");
  await tid(page, "evidence-viewer-EVD-LOG-04").waitFor();
  check("A citation chip opens the readable evidence at its paragraph (highlighted)", await page.evaluate(() => (() => { const el = document.querySelector("#ref-P1"); return !!el && (el.matches(":target") || el.hasAttribute("data-hl")); })()));
  // tasks
  await openCase(page, "CAS-LOG-03", "tasks");
  check("Tasks are labelled as human assignments, not AI-agent work", /human investigation assignments/i.test(await page.locator("main").innerText()) && /not executed by an AI agent/i.test(await page.locator("main").innerText()));
  await tid(page, "task-title").fill("Ask the port for the crane maintenance schedule");
  await tid(page, "task-assignee").selectOption("PER-LOG-05");
  await tid(page, "task-add").click(); await wait(page, 250);
  check("A task can be assigned to a named fictional person", (await page.getByText("Hamad Al-Shamri").first().count()) > 0 && (await page.locator('[data-testid^="task-TSK-LOG-03-"]').count()) === 1);
  await tid(page, "task-complete-TSK-LOG-03-01").click();
  await tid(page, "task-confirm-TSK-LOG-03-01").click();
  check("A task cannot be completed without findings and a note", /findings/i.test(await errText(page)));
  await tid(page, "task-findings-TSK-LOG-03-01").fill("Two cranes return to service on 20 October.");
  await tid(page, "task-note-TSK-LOG-03-01").fill("Confirmed by the port desk.");
  await tid(page, "task-confirm-TSK-LOG-03-01").click(); await wait(page, 250);
  check("Task completes with findings and a note", (await tid(page, "task-status-TSK-LOG-03-01").innerText()) === "Done");
  await page.screenshot({ path: `${SHOTS}/investigation-workspace-tasks.png`, fullPage: true });
});

// ============================================================ F–G. Review, revision, brief versions, staleness, closing
await section("review-revision-brief", async (page) => {
  await openCase(page, "CAS-LOG-01", "review");
  check("Seeded Logistics case is in Expert review with an open request", (await statusOf(page)) === "Expert review" && (await tid(page, "awaiting-expert").count()) === 1);
  // Analyst cannot answer the review
  check("Analyst does not see the expert panel", (await tid(page, "expert-form").count()) === 0);
  await role(page, "Expert");
  await tid(page, "expert-form").waitFor();
  check("Expert sees the expert panel labelled as demonstration (acting as the assigned expert)", /not production identity/.test(await tid(page, "expert-acting-as").innerText()));
  await tid(page, "submit-review").click();
  check("A review cannot be completed without a finding", /at least one finding/i.test(await errText(page)));
  await tid(page, "finding-text").fill("The bulletin supports a congestion-driven explanation.");
  await tid(page, "finding-add").click();
  check("A finding without a citation is rejected", /Cite at least one/i.test(await errText(page)));
  await tid(page, "cite-evidence").selectOption({ index: 1 });
  await tid(page, "cite-ref").selectOption({ index: 1 });
  await tid(page, "cite-add").click();
  await tid(page, "finding-add").click();
  check("A finding with a valid citation is added to the review", (await tid(page, "draft-findings").locator("li").count()) === 1);
  await tid(page, "outcome-Revision-requested").check();
  await tid(page, "submit-review").click();
  check("“Revision requested” requires an explanation", /Explain what must be revised/i.test(await errText(page)));
  await tid(page, "review-note").fill("Add the Eastern Gulf Terminal capacity evidence before relying on this.");
  await tid(page, "submit-review").click(); await wait(page, 300);
  check("Revision requested returns the case to Investigating", (await statusOf(page)) === "Investigating");
  check("The expert's findings are retained on the review record", (await page.locator('[data-testid^="finding-FND-LOG-01-"]').count()) === 1);
  // Analyst requests a revised review (round 2)
  await role(page, "Analyst");
  await tid(page, "review-scope").fill("Revised: capacity evidence added. Please re-review the attribution and the rerouting proportionality.");
  await tid(page, "review-request-submit").click(); await wait(page, 300);
  check("Requesting review again creates round 2 and moves the case back to Expert review", (await statusOf(page)) === "Expert review" && (await page.locator('[data-testid^="round-REV-LOG-01-01-"]').count()) === 2);
  check("Earlier findings are still shown after the revised request", (await page.locator('[data-testid^="finding-FND-LOG-01-"]').count()) === 1);
  await role(page, "Expert");
  await tid(page, "outcome-Reviewed").check();
  await tid(page, "finding-type").selectOption("Disagreement");
  await tid(page, "finding-text").fill("I disagree that rerouting 15% is proportionate before capacity is confirmed.");
  await tid(page, "cite-evidence").selectOption({ index: 1 });
  await tid(page, "cite-ref").selectOption({ index: 2 });
  await tid(page, "cite-add").click(); await tid(page, "finding-add").click();
  await tid(page, "submit-review").click(); await wait(page, 300);
  check("Returning “Reviewed” records findings but does not approve (case stays in Expert review)", (await statusOf(page)) === "Expert review" && /not an approval/i.test(await page.locator("main").innerText()));
  check("Review history shows both rounds, the disagreement and the earlier revision request", (await page.locator('[data-testid^="finding-FND-LOG-01-"]').count()) === 2 && (await page.getByText("Revision requested").count()) >= 1);
  await page.screenshot({ path: `${SHOTS}/expert-review-findings.png`, fullPage: true });
  // Approver restrictions
  await role(page, "Approver");
  check("Approver cannot submit findings (no expert panel) and is told approvals are not recorded", (await tid(page, "expert-form").count()) === 0 && /cannot record approvals/i.test(await page.locator("main").innerText()));
  // Brief: seeded v1 becomes stale after the expert findings
  await role(page, "Analyst");
  await tid(page, "tab-brief").click();
  await tid(page, "stale-banner").waitFor();
  check("Saved brief shows “Needs refresh” after new expert findings and keeps v1", (await tid(page, "needs-refresh").count()) >= 1 && (await tid(page, "brief-version-1").count()) === 1 && /expert finding/i.test(await tid(page, "stale-banner").innerText()));
  await page.screenshot({ path: `${SHOTS}/brief-needs-refresh.png`, fullPage: true });
  await tid(page, "go-Brief-ready").count().then(() => {});
  await tid(page, "compile-brief").click(); await wait(page, 300);
  check("Compile brief saves v2 and clears the refresh warning", (await tid(page, "brief-version-2").count()) === 1 && (await tid(page, "stale-banner").count()) === 0);
  check("v2 includes the expert disagreement and cites evidence versions", /Disagreement/.test(await tid(page, "brief-view").innerText()) && /EVD-LOG-0\d v\d/.test(await tid(page, "brief-basis").innerText()));
  check("Brief offers monitoring and no-action options and states no impact figures are calculated", /Monitor\./.test(await tid(page, "brief-view").innerText()) && /No action\./.test(await tid(page, "brief-view").innerText()) && /No financial impact is calculated/.test(await tid(page, "brief-view").innerText()));
  await tid(page, "brief-version-1").click();
  check("An earlier version stays viewable and is marked read-only", /earlier version \(read-only\)/.test(await tid(page, "brief-view").innerText()) && (await tid(page, "edit-brief").count()) === 0);
  await tid(page, "brief-version-2").click();
  await tid(page, "edit-brief").click();
  await tid(page, "brief-edit-next").fill("");
  await tid(page, "save-brief").click();
  check("Editing the brief validates required fields", /next step is required/i.test(await errText(page)));
  await tid(page, "brief-edit-next").fill("Take the brief to the Approver once the terminal capacity evidence is in.");
  await tid(page, "save-brief").click(); await wait(page, 300);
  check("Editing saves a new version (v3) without deleting earlier versions", (await tid(page, "brief-version-3").count()) === 1 && (await tid(page, "brief-version-1").count()) === 1);
  // stale again after a hypothesis change; also blocks Brief ready
  await tid(page, "tab-evidence").click();
  await page.locator('[data-testid^="edit-HYP-LOG-01-"]').first().click();
  await tid(page, "hyp-status").selectOption("Supported");
  await tid(page, "hyp-save").click(); await wait(page, 300);
  await tid(page, "tab-brief").click(); await wait(page, 400);
  check("Changing a hypothesis marks the latest brief Needs refresh again and names the change", (await tid(page, "stale-banner").count()) === 1 && /Hypothesis H\d was edited/.test(await tid(page, "stale-banner").innerText()));
  check("Brief ready is blocked while the brief needs refresh", /Needs refresh/.test(await tid(page, "transition-Brief-ready").innerText()) && (await tid(page, "go-Brief-ready").isDisabled()));
  await tid(page, "compile-brief").click(); await wait(page, 300);
  check("Recompiling creates v4", (await tid(page, "brief-version-4").count()) === 1);
  await tid(page, "go-Brief-ready").click(); await wait(page, 300);
  check("Expert review → Brief ready succeeds once reviewed and the brief is current", (await statusOf(page)) === "Brief ready");
  await tid(page, "go-Closed").click();
  await tid(page, "confirm-close").click();
  check("Closing requires a note", /closure note/i.test(await errText(page)));
  await tid(page, "close-note").fill("Brief delivered to the Approver; no decision recorded.");
  await tid(page, "confirm-close").click(); await wait(page, 300);
  check("Closing a case states that no decision was approved or executed", (await statusOf(page)) === "Closed" && /does not mean a decision was approved or executed/i.test(await tid(page, "closure-info").innerText()));
  await tid(page, "tab-overview").click();
  check("A closed case is read-only (Save is not offered)", (await tid(page, "save-case").count()) === 0);
  await tid(page, "go-Investigating").click(); await wait(page, 300);
  check("A closed case can be reopened to Investigating", (await statusOf(page)) === "Investigating");
});

// ============================================================ Evidence adoption (version change → stale) + evidence pages
await section("evidence-versions", async (page) => {
  await goto(page, "/evidence");
  check("Evidence library lists all 37 readable items", (await tid(page, "evidence-count").innerText()).includes("37 of 37"));
  await tid(page, "evidence-search").fill("quay cranes");
  check("Evidence search matches readable content, not just titles", (await page.locator('[data-testid^="evidence-card-"]').count()) === 1 && (await tid(page, "evidence-card-EVD-LOG-04").count()) === 1);
  await tid(page, "evidence-search").fill("zzzzzz");
  check("Evidence search shows an empty state", (await tid(page, "evidence-empty").count()) === 1);
  await page.screenshot({ path: `${SHOTS}/evidence-library.png`, fullPage: true });
  await goto(page, "/evidence/EVD-LOG-01");
  await tid(page, "evidence-viewer-EVD-LOG-01").waitFor();
  const meta = await page.locator("main").innerText();
  check("Evidence page shows ID, fictional source, source date, version, freshness, limitations and the Illustrative label", /EVD-LOG-01/.test(meta) && /Demonstration TMS/.test(meta) && /2026-10-11/.test(meta) && /v2 of 2/.test(meta) && /Recent/.test(meta) && (await tid(page, "limitations").locator("li").count()) >= 2 && (await tid(page, "illustrative-label").count()) >= 1);
  check("Evidence content has stable paragraph and row references", (await page.locator("#ref-P1").count()) === 1 && (await page.locator("#ref-T1R2").count()) === 1 && (await page.locator("#ref-T3R1").count()) === 1);
  await tid(page, "evidence-v1").click();
  await wait(page, 200);
  check("Switching to v1 shows the older version with a banner and no cause-code table", (await tid(page, "older-version-banner").count()) === 1 && (await page.locator("#ref-T3R1").count()) === 0);
  // adopt newer version in the case → brief stale
  await openCase(page, "CAS-LOG-01", "evidence");
  await tid(page, "stance-LNK-LOG-01-01").waitFor();
  check("The case shows that a newer evidence version is available", (await page.locator('[data-testid^="newer-LNK-LOG-01-01"]').count()) === 1);
  await page.locator('[data-testid^="adopt-LNK-LOG-01-01"]').click(); await wait(page, 300);
  await tid(page, "tab-brief").click(); await wait(page, 400);
  check("Adopting a newer evidence version marks the brief Needs refresh", (await tid(page, "stale-banner").count()) === 1 && /moved from v1 to v2/.test(await tid(page, "stale-banner").innerText()));
  await page.screenshot({ path: `${SHOTS}/brief-stale-after-evidence-change.png`, fullPage: true });
  // quick link from the evidence page
  await goto(page, "/evidence/EVD-LOG-03");
  await tid(page, "quick-case").selectOption("CAS-LOG-01");
  await tid(page, "quick-stance").selectOption("context");
  await tid(page, "quick-link-submit").click(); await wait(page, 300);
  check("Evidence can be linked to a case from the evidence page", (await page.getByTestId("notice").count()) === 1);
});

// ============================================================ H. Role restrictions
await section("roles", async (page) => {
  await openCase(page, "CAS-LOG-01");
  check("Analyst sees edit controls", (await tid(page, "save-case").count()) === 1);
  await role(page, "Approver");
  await page.waitForTimeout(150);
  check("Approver sees a read-only case with an explanation (no Save, locked note shown)", (await tid(page, "save-case").count()) === 0 && (await tid(page, "locked-note").count()) >= 1 && /Approvals cannot be recorded in Stage 2/.test(await tid(page, "role-notice").innerText()));
  check("Role restrictions are labelled as demonstration behaviour, not security", /not production authentication or security/.test(await tid(page, "role-notice").innerText()));
  await tid(page, "tab-brief").click(); await wait(page, 400);
  check("Approver can read the brief but has no Compile or Edit button", (await tid(page, "brief-view").count()) === 1 && (await tid(page, "compile-brief").count()) === 0 && (await tid(page, "edit-brief").count()) === 0);
  await tid(page, "tab-tasks").click(); await wait(page, 400);
  check("Approver cannot assign or progress tasks", (await tid(page, "task-form").count()) === 0 && (await page.getByText("cannot change task status").count()) >= 1);
  await goto(page, "/cases");
  check("Approver has no New case button and is told why", (await tid(page, "new-case-button").count()) === 0 && (await tid(page, "locked-note").count()) === 1);
  await role(page, "Expert");
  await openCase(page, "CAS-LOG-01", "brief");
  check("Expert cannot compile or edit briefs", (await tid(page, "compile-brief").count()) === 0);
  await tid(page, "tab-tasks").click(); await wait(page, 400);
  check("Expert can progress a specialist's task but not an analyst's", (await tid(page, "task-select-TSK-LOG-01-02").count()) === 0 && (await tid(page, "task-select-TSK-LOG-01-03").count()) === 1);
  await goto(page, "/reviews");
  check("Review queue lists requests and tells the Expert how to answer", (await tid(page, "expert-queue-hint").count()) === 1 && (await page.locator('[data-testid^="rq-row-"]').count()) === 8);
  await tid(page, "rq-sector").selectOption("logistics");
  check("Review queue filters by sector", (await tid(page, "rq-count").innerText()).includes("1 request"));
  await tid(page, "rq-state").selectOption("Reviewed");
  check("Review queue shows an empty state when nothing matches", (await tid(page, "rq-empty").count()) === 1);
  await goto(page, "/reviews");
  await page.screenshot({ path: `${SHOTS}/expert-review-queue.png`, fullPage: true });
});

// ============================================================ I. Dashboard, search, notifications follow the store
await section("dashboard-search-notifications", async (page) => {
  await goto(page, "/overview");
  const before = Number(await tid(page, "kpi-cases").locator("p").nth(1).innerText());
  const unread0 = Number(await tid(page, "unread-count").textContent());
  await goto(page, "/cases");
  await tid(page, "create-from-SIG-LOG-05").click();
  await tid(page, "create-question").fill("Is the vessel waiting time a systemic constraint?");
  await tid(page, "create-submit").click();
  await page.waitForURL("**/cases/CAS-LOG-03");
  await goto(page, "/overview");
  check("Overview active-case count follows the store", Number(await tid(page, "kpi-cases").locator("p").nth(1).innerText()) === before + 1);
  await goto(page, "/workspaces");
  check("Workspace card case count follows the store (Logistics 3)", /3 active cases/.test(await tid(page, "workspace-logistics").innerText()));
  await goto(page, "/sector/logistics");
  check("Command centre lists the new case and links to its workspace", (await tid(page, "case-CAS-LOG-03").count()) === 1 && (await tid(page, "workspace-link-CAS-LOG-03").count()) === 1);
  check("Signal SIG-LOG-05 now shows its case", /→ CAS-LOG-03/.test(await tid(page, "signal-SIG-LOG-05").innerText()));
  const search = page.getByLabel("Search seeded demonstration records");
  await search.fill("vessel waiting");
  await page.getByRole("option").filter({ hasText: "CAS-LOG-03" }).first().waitFor();
  check("Search finds the new case by title", (await page.getByRole("option").filter({ hasText: "Intelligence case" }).count()) >= 1);
  await page.getByRole("option").filter({ hasText: "CAS-LOG-03" }).first().click();
  await page.locator('dialog[open][aria-labelledby="record-drawer-title"]').waitFor();
  check("A search result for a new case opens its record drawer with a workspace link", (await tid(page, "drawer-open-workspace").count()) === 1);
  await page.keyboard.press("Escape");
  await search.fill("crane");
  await page.getByRole("option").filter({ hasText: "EVD-LOG-04" }).first().waitFor().catch(() => {});
  check("Search finds evidence by readable content and tasks/hypotheses by text", (await page.getByRole("option").filter({ hasText: "EVD-LOG-04" }).count()) >= 1);
  await search.fill("");
  const unread1 = Number(await tid(page, "unread-count").textContent());
  check("Creating a case adds an unread notification", unread1 === unread0 + 1, `${unread0} → ${unread1}`);
  await page.getByRole("button", { name: /Notifications/ }).click();
  await page.getByText("Case created:").first().click();
  await page.locator('dialog[open][aria-labelledby="record-drawer-title"]').waitFor();
  check("The new notification opens the case", (await tid(page, "drawer-open-workspace").count()) === 1);
  await page.keyboard.press("Escape");
  await page.reload(); await ready(page);
  check("Notification read state persists after reload", Number(await tid(page, "unread-count").textContent()) === unread1 - 1);
});

// ============================================================ J. Migration, recovery, reset
await (async () => {
  // Migration from Stage 1 saved state
  const h = await fresh({ init: () => { try { if (!localStorage.getItem("tigeris.demo.v2") && !sessionStorage.getItem("seeded")) { localStorage.setItem("tigeris.demo.v1", JSON.stringify({ sectorId: "infrastructure", role: "Approver", readIds: ["NTF-01", "NTF-03"], entered: true })); sessionStorage.setItem("seeded", "1"); } } catch {} } });
  const page = h.page;
  try {
    await goto(page, "/workspaces");
    await tid(page, "migration-banner").waitFor();
    check("Stage 1 saved state is migrated with a visible notice", /migrated/.test(await tid(page, "migration-banner").innerText()));
    check("Migrated role, sector and read state are kept", (await page.getByLabel("Simulated demonstration role").inputValue()) === "Approver" && (await tid(page, "workspace-infrastructure").innerText()).includes("Last selected") && Number(await tid(page, "unread-count").textContent()) === 17);
    const st = await stored(page);
    check("Migration writes the Stage 2 format and removes the Stage 1 key", st?.schemaVersion === 2 && (await page.evaluate(() => localStorage.getItem("tigeris.demo.v1"))) === null);
  } catch (e) { check("migration: completed", false, String(e.message).split("\n")[0]); }
  await h.ctx.close();
})();

await section("recovery", async (page, ctx) => {
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("bad")) { localStorage.setItem("tigeris.demo.v2", "{this is not json"); sessionStorage.setItem("bad", "1"); } } catch {} });
  await goto(page, "/cases");
  await tid(page, "recovery-banner").waitFor();
  check("Malformed saved state shows a recovery message that names the problem", /not valid JSON/.test(await tid(page, "recovery-banner").innerText()));
  check("The unreadable saved data is not overwritten while the message is shown", (await page.evaluate(() => localStorage.getItem("tigeris.demo.v2"))) === "{this is not json");
  await tid(page, "new-case-button").click();
  await tid(page, "create-sector").selectOption("energy");
  await tid(page, "create-title").fill("Should not be saved while recovering");
  await tid(page, "create-submit").click();
  check("Changes are blocked with an explanation until the saved state is reset", /could not be read/i.test(await errText(page)));
  await page.keyboard.press("Escape");
  await tid(page, "recovery-reset").click();
  await tid(page, "recovery-confirm").click();
  await page.waitForTimeout(400);
  check("Explicit reset clears the unreadable data and removes the message", (await tid(page, "recovery-banner").count()) === 0 && (await page.evaluate(() => localStorage.getItem("tigeris.demo.v2"))) === null);
  await goto(page, "/cases");
  check("After recovery the seeded cases are shown and editing works again", (await tid(page, "case-count").innerText()).includes("18 of 18") && (await tid(page, "new-case-button").count()) === 1);
});
for (const [label, value] of [["unsupported newer schema", JSON.stringify({ schemaVersion: 99, ui: {}, work: {} })], ["invalid case data", JSON.stringify({ schemaVersion: 2, ui: { sectorId: "energy", role: "Analyst", readIds: [], entered: true }, work: { cases: { "CAS-ENR-09": { id: "CAS-ENR-09" } }, notifications: [], counters: { case: {}, notification: 0 } } })]]) {
  await section(`recovery-${label}`, async (page, ctx) => {
    await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem("bad")) { localStorage.setItem("tigeris.demo.v2", v); sessionStorage.setItem("bad", "1"); } } catch {} }, value);
    await goto(page, "/cases");
    await tid(page, "recovery-banner").waitFor();
    check(`Recovery message for ${label}`, (await tid(page, "recovery-banner").innerText()).length > 60);
  });
}

await section("reset", async (page) => {
  await goto(page, "/cases");
  await tid(page, "create-from-SIG-LOG-05").click();
  await tid(page, "create-submit").click();
  await page.waitForURL("**/cases/CAS-LOG-03");
  await openCase(page, "CAS-LOG-01", "tasks");
  await tid(page, "task-select-TSK-LOG-01-02").selectOption("In progress").catch(() => {});
  await openCase(page, "CAS-LOG-01", "evidence");
  await page.locator('[data-testid^="unlink-LNK-LOG-01-06"]').click(); await wait(page, 300);
  check("Stage 2 changes are persisted before Reset", Object.keys((await stored(page)).work.cases).length === 2);
  await page.getByRole("button", { name: "Reset demonstration" }).first().click();
  await page.getByRole("dialog", { name: "Reset demonstration?" }).waitFor();
  check("Reset confirmation describes removing Stage 2 changes", /removes every Stage 2 change/.test(await page.getByRole("dialog", { name: "Reset demonstration?" }).innerText()));
  await page.getByRole("button", { name: "Cancel" }).click();
  check("Cancelling Reset keeps the changes", Object.keys((await stored(page)).work.cases).length === 2);
  await page.getByRole("button", { name: "Reset demonstration" }).first().click();
  await page.getByRole("dialog", { name: "Reset demonstration?" }).getByRole("button", { name: "Reset demonstration" }).click();
  await page.waitForURL("**/workspaces");
  await wait(page, 900);
  const afterReset = await page.evaluate(() => localStorage.getItem("tigeris.demo.v2"));
  const resetState = afterReset ? JSON.parse(afterReset) : null;
  check("Reset removes all Stage 2 work, read state and entry (only the route-synced sector selection may be re-saved)", resetState === null || (Object.keys(resetState.work.cases).length === 0 && resetState.work.notifications.length === 0 && resetState.ui.readIds.length === 0 && resetState.ui.entered === false && resetState.ui.role === "Analyst"), afterReset ? "re-saved: sector selection only" : "storage key cleared");
  await goto(page, "/cases");
  check("Reset restores the 18 seeded cases and the untriaged signal", (await tid(page, "case-count").innerText()).includes("18 of 18") && (await tid(page, "untriaged-SIG-LOG-05").count()) === 1);
  await openCase(page, "CAS-LOG-01", "evidence");
  check("Reset restores the unlinked evidence link", (await page.getByText("Linked evidence (6)").count()) === 1);
  await goto(page, "/cases/CAS-LOG-03");
  check("A case created before Reset is gone (not-found page, not an error)", (await tid(page, "case-not-found").count()) === 1);
});

// ============================================================ Primary walkthrough: SIG-LOG-01 → CAS-LOG-01 → DEC-LOG-01
await section("logistics-walkthrough", async (page) => {
  await goto(page, "/sector/logistics");
  await tid(page, "signal-SIG-LOG-01").click();
  const dlg = page.locator('dialog[open][aria-labelledby="record-drawer-title"]');
  await dlg.waitFor();
  check("Walkthrough: signal drawer shows its active case and the workspace link (no duplicate creation offered)", (await tid(page, "drawer-open-workspace").count()) === 1 && (await tid(page, "drawer-create-case").count()) === 0);
  await tid(page, "drawer-open-workspace").click();
  await page.waitForURL("**/cases/CAS-LOG-01");
  await tid(page, "case-workspace-CAS-LOG-01").waitFor();
  check("Walkthrough: the investigation workspace for CAS-LOG-01 opens", (await statusOf(page)) === "Expert review");
  await page.screenshot({ path: `${SHOTS}/workspace-overview.png`, fullPage: true });
  await tid(page, "tab-evidence").click();
  await page.screenshot({ path: `${SHOTS}/workspace-evidence.png`, fullPage: true });
  await page.locator('[data-testid^="link-LNK-LOG-01-04"] a').first().click();
  await tid(page, "evidence-viewer-EVD-LOG-05").waitFor();
  check("Walkthrough: contradictory carrier statement opens as readable, illustrative evidence", (await tid(page, "illustrative-label").count()) >= 1 && /documentation-related/.test(await page.locator("main").innerText()));
  await page.screenshot({ path: `${SHOTS}/readable-evidence.png`, fullPage: true });
  await openCase(page, "CAS-LOG-01", "brief");
  const d = page.getByRole("link", { name: "EVD-LOG-01" }).first();
  void d;
  await tid(page, "tab-overview").click();
  await page.getByRole("button", { name: /Reroute 15% of Western trucking/ }).first().click();
  await dlg.waitFor();
  check("Walkthrough: the decision proposal DEC-LOG-01 opens from the case and is still only a proposal", /DEC-LOG-01/.test(await dlg.innerText()) && /Stage 5/.test(await dlg.innerText()) && !/approved on/i.test(await dlg.innerText()));
});

// ============================================================ K. One complete workflow in each of the eight sectors
for (const [id, code] of SECTORS) {
  await section(`sector-${id}`, async (page) => {
    const caseId = `CAS-${code}-01`;
    await openCase(page, caseId, "evidence");
    const linkCount = await page.locator('[data-testid^="link-LNK-"]').count();
    const distinct = new Set(await page.locator('[data-testid^="link-LNK-"] code').allInnerTexts().then((a) => a.map((t) => t.split(" ")[0]))).size;
    check(`${id}: seeded investigation has ≥3 distinct linked evidence items and a contradicting one`, distinct >= 3 && (await page.getByText(/Contradictory evidence \(\d+\)/).count()) === 1, `links=${linkCount} distinct=${distinct}`);
    const firstEvidence = page.locator('[data-testid^="link-LNK-"] a').first();
    const evId = await page.locator('[data-testid^="link-LNK-"] code').first().innerText().then((t) => t.split(" ")[0]);
    await firstEvidence.click();
    await tid(page, `evidence-viewer-${evId}`).waitFor();
    const txt = await page.locator("main").innerText();
    check(`${id}: evidence ${evId} is readable with source, date, limitations and the Illustrative label`, (await tid(page, "illustrative-label").count()) >= 1 && (await tid(page, "limitations").locator("li").count()) >= 1 && /Source date/i.test(txt) && (await page.locator('[id^="ref-"]').count()) >= 2);
    // tasks: complete the in-progress task
    await openCase(page, caseId, "tasks");
    const inProg = page.locator(`li[data-testid^="task-${caseId.replace("CAS-", "TSK-")}-"]`).filter({ has: page.locator('[data-testid^="task-status-"]', { hasText: /^In progress$/ }) }).first();
    const taskId = (await inProg.getAttribute("data-testid")).replace("task-", "");
    await tid(page, `task-complete-${taskId}`).click();
    await tid(page, `task-findings-${taskId}`).fill("Checked against the source and recorded for the brief.");
    await tid(page, `task-note-${taskId}`).fill("Completed during the demonstration.");
    await tid(page, `task-confirm-${taskId}`).click(); await wait(page, 250);
    check(`${id}: an investigation task is completed`, (await tid(page, `task-status-${taskId}`).innerText()) === "Done");
    // expert review
    await role(page, "Expert");
    await tid(page, "tab-review").click();
    await tid(page, "expert-form").waitFor();
    await tid(page, "finding-text").fill("The linked evidence is consistent with the primary hypothesis, subject to the stated limitations.");
    await tid(page, "cite-evidence").selectOption({ index: 1 });
    await tid(page, "cite-ref").selectOption({ index: 1 });
    await tid(page, "cite-add").click(); await tid(page, "finding-add").click();
    await tid(page, "submit-review").click(); await wait(page, 300);
    check(`${id}: the expert returns “Reviewed” with a cited finding (still Expert review, not approved)`, (await statusOf(page)) === "Expert review" && (await page.locator('[data-testid^="finding-FND-"]').count()) === 1);
    // brief
    await role(page, "Analyst");
    await tid(page, "tab-brief").click(); await wait(page, 400);
    check(`${id}: the seeded draft brief needs refresh after the expert finding`, (await tid(page, "stale-banner").count()) === 1);
    await tid(page, "compile-brief").click(); await wait(page, 300);
    check(`${id}: compiling saves brief v2 including the expert finding`, (await tid(page, "brief-version-2").count()) === 1 && /Expert findings/i.test(await tid(page, "brief-view").innerText()) && !/AI-generated\b(?!.*not)/.test("") );
    await tid(page, "go-Brief-ready").click(); await wait(page, 300);
    check(`${id}: the case reaches Brief ready`, (await statusOf(page)) === "Brief ready");
    const s = await stored(page);
    check(`${id}: the workflow is persisted locally`, s?.work?.cases?.[caseId]?.status === "Brief ready" && s.work.cases[caseId].briefs.length === 2);
  });
}

// ============================================================ L. Keyboard, dialogs, focus, mobile
await section("keyboard-dialogs", async (page) => {
  await goto(page, "/cases");
  const btn = tid(page, "new-case-button");
  await btn.focus(); await page.keyboard.press("Enter");
  await tid(page, "create-case-dialog").waitFor();
  const st = () => page.evaluate(() => ({ modal: !!document.querySelector("dialog[open]")?.matches(":modal"), inert: document.getElementById("app-root")?.inert === true, inside: !!document.activeElement?.closest("dialog[open]"), name: document.querySelector("dialog[open]")?.getAttribute("aria-labelledby") }));
  let s = await st();
  check("Create-case dialog is a native modal with an accessible name, background inert and focus inside", s.modal && s.inert && s.inside && !!s.name);
  let held = true;
  for (let i = 0; i < 40; i++) { await page.keyboard.press("Tab"); if (!(await st()).inside) { held = false; break; } }
  check("Tab cannot leave the create-case dialog", held);
  await page.keyboard.press("Escape"); await wait(page, 250);
  s = await st();
  check("Escape closes the dialog, restores the background and returns focus to “New case”", !s.modal && !s.inert && (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "new-case-button");
  // workspace tab semantics
  await openCase(page, "CAS-LOG-01");
  check("Workspace sections are an accessible tablist with the active tab selected", (await page.getByRole("tab", { selected: true }).count()) === 1 && (await page.getByRole("tablist").count()) >= 1);
  await tid(page, "tab-brief").focus(); await page.keyboard.press("Enter"); await wait(page);
  check("Tabs work with the keyboard", (await tid(page, "tab-brief").getAttribute("aria-selected")) === "true");
  // record drawer from the command centre for a Stage 2 case
  await goto(page, "/sector/logistics");
  const card = tid(page, "case-CAS-LOG-01").getByRole("button").first();
  await card.focus(); await page.keyboard.press("Enter");
  await page.locator('dialog[open][aria-labelledby="record-drawer-title"]').waitFor();
  check("Case drawer opens from the command centre and shows the new workspace link", (await tid(page, "drawer-open-workspace").count()) === 1);
  await page.keyboard.press("Escape"); await wait(page, 300);
  check("Escape closes the case drawer and focus returns to the opener", (await page.evaluate(() => document.activeElement?.closest('[data-testid="case-CAS-LOG-01"]') !== null)));
});

await (async () => {
  const h = await fresh({ viewport: { width: 390, height: 844 } });
  const page = h.page;
  try {
    const paths = ["/cases", "/cases/CAS-LOG-01", "/cases/CAS-LOG-01?tab=evidence", "/cases/CAS-LOG-01?tab=tasks", "/cases/CAS-LOG-01?tab=review", "/cases/CAS-LOG-01?tab=brief", "/cases/CAS-LOG-01?tab=activity", "/evidence", "/evidence/EVD-LOG-01", "/reviews"];
    for (const p of paths) {
      await goto(page, p); await wait(page, 300);
      const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      check(`Mobile no horizontal overflow ${p}`, w.sw <= w.iw + 1, `scrollWidth=${w.sw}`);
    }
    await goto(page, "/cases");
    await tid(page, "new-case-button").click();
    await tid(page, "create-case-dialog").waitFor();
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, modal: !!document.querySelector("dialog[open]")?.matches(":modal") }));
    check("Mobile create-case dialog fits the screen and is modal", w.sw <= w.iw + 1 && w.modal);
    await page.screenshot({ path: `${SHOTS}/mobile-create-case.png` });
    await page.keyboard.press("Escape");
    await goto(page, "/cases"); await page.screenshot({ path: `${SHOTS}/mobile-cases.png`, fullPage: true });
    await openCase(page, "CAS-LOG-01", "evidence"); await page.screenshot({ path: `${SHOTS}/mobile-workspace.png`, fullPage: true });
    await goto(page, "/evidence/EVD-LOG-01"); await page.screenshot({ path: `${SHOTS}/mobile-evidence.png`, fullPage: true });
  } catch (e) { check("mobile: completed", false, String(e.message).split("\n")[0]); }
  await h.ctx.close();
})();

await browser.close();
check("No console or page errors", errors.length === 0, errors.slice(0, 4).join(" | "));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Stage 2 checks passed`);
process.exit(failed.length ? 1 : 0);
