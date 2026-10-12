/* Logic checks for the Stage 2 store: seeds, mutations, state machine, brief staleness, persistence, migration. Run: npm run verify:store */
import { SEEDS, SECTOR_IDS, PEOPLE_BY_ID } from "../src/data";
import { evidenceRefs, versionOf } from "../src/data/stage2/blocks";
import { SEED_CASES } from "../src/lib/stage2/seed";
import { EVIDENCE_BY_ID, SIGNAL_BY_ID } from "../src/lib/stage2/catalog";
import { activeLinks, basisOf, isBriefStale, latestBrief, staleReasons } from "../src/lib/stage2/brief";
import { checkTransition, openReviews, reviewState, can } from "../src/lib/stage2/rules";
import * as M from "../src/lib/stage2/mutations";
import { buildWorld, groupCounts, searchWorld, sectorCounts } from "../src/lib/stage2/world";
import { emptyWork, type Ctx, type CaseAggregate, type WorkState } from "../src/lib/stage2/types";
import { DEFAULT_UI, KEY_V1, loadPersisted, parseSaved, serialize, isDefaultState } from "../src/lib/stage2/persist";
import type { Role } from "../src/lib/types";

let failures = 0, checks = 0;
const ok = (c: boolean, msg: string) => { checks++; if (!c) { failures++; console.error("FAIL:", msg); } };
const ctx = (role: Role, n = 1): Ctx => ({ role, now: `2026-10-12T${String(9 + Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}` });
let tick = 0;
const C = (role: Role = "Analyst") => ctx(role, ++tick);
const apply = <T,>(w: WorkState, r: { ok: true; work: WorkState; value: T } | { ok: false; errors: string[] }): WorkState => (r.ok ? r.work : w);
type Res = { ok: boolean; work?: WorkState; value?: unknown; errors?: string[] };
const run = <T,>(w: WorkState, r: Res, msg: string): { work: WorkState; value: T } => {
  if (r.ok) return { work: r.work as WorkState, value: r.value as T };
  ok(false, `${msg} — ${(r.errors ?? []).join("; ")}`); return { work: w, value: undefined as T };
};
const fails = (r: { ok: boolean; errors?: string[] }, re: RegExp, msg: string) => ok(!r.ok && (r.errors ?? []).some((e) => re.test(e)), `${msg} (got ${r.ok ? "ok" : (r.errors ?? []).join(" | ")})`);

// ---------------------------------------------------------------- A. Seeds: one complete investigation per sector
for (const s of SEEDS) {
  const id = s.sector.id;
  const code = s.sector.code;
  const c = SEED_CASES[`CAS-${code}-01`];
  ok(!!c, `${id}: primary case exists`);
  if (!c) continue;
  ok(c.status === "Expert review", `${id}: seeded primary case is in Expert review`);
  const links = activeLinks(c);
  const evIds = [...new Set(links.map((l) => l.evidenceId))];
  ok(evIds.length >= 3, `${id}: ≥3 distinct evidence items linked (${evIds.length})`);
  ok(links.some((l) => l.stance === "contradicts"), `${id}: has contradicting evidence`);
  ok(links.some((l) => l.stance === "supports"), `${id}: has supporting evidence`);
  ok(c.hypotheses.length >= 2 && c.hypotheses.some((h) => h.kind === "alternative"), `${id}: hypotheses incl. an alternative`);
  ok(c.tasks.length >= 3 && c.tasks.some((t) => t.status === "Done") && c.tasks.some((t) => t.status !== "Done"), `${id}: ≥3 tasks, mixed status`);
  ok(c.tasks.every((t) => PEOPLE_BY_ID[t.assigneeId]?.sectorId === id), `${id}: tasks have named in-sector assignees`);
  ok(openReviews(c).length === 1, `${id}: one open expert-review request`);
  ok(c.briefs.length === 1 && !isBriefStale(c), `${id}: draft brief v1, not stale`);
  ok(c.assumptions.length > 0 && c.missing.length > 0 && c.questions.length > 0, `${id}: assumptions, missing info and open questions`);
  for (const l of c.links) {
    const ev = EVIDENCE_BY_ID[l.evidenceId];
    const v = ev && versionOf(ev, l.version);
    ok(!!v, `${l.id}: evidence version exists`);
    const refs = new Set(v ? evidenceRefs(v).map((r) => r.ref) : []);
    ok(l.refs.every((r) => refs.has(r)), `${l.id}: refs valid (${l.refs.join(",")})`);
    ok(!l.hypothesisId || c.hypotheses.some((h) => h.id === l.hypothesisId), `${l.id}: hypothesis exists`);
  }
  const readable = s.evidence.filter((e) => e.versions?.length);
  ok(readable.length >= 3, `${id}: ≥3 readable evidence items (${readable.length})`);
  ok(s.evidence.every((e) => e.versions?.length), `${id}: every evidence item has readable content`);
  for (const e of readable) {
    ok(e.versions!.every((v) => v.sourceDate && v.limitations.length > 0 && v.blocks.length > 0), `${e.id}: dates, limitations and content present`);
    ok(e.asOf === e.versions![e.versions!.length - 1].sourceDate, `${e.id}: asOf equals newest version date`);
    ok(!!e.entityIds && e.entityIds.length > 0, `${e.id}: entities listed`);
  }
  const untriaged = s.signals.filter((g) => !g.caseId);
  ok(untriaged.length >= 1, `${id}: has an untriaged (case-less) signal`);
  // Stage 1 relationships preserved
  for (const g of s.signals.filter((x) => x.caseId)) ok(SEED_CASES[g.caseId!]?.signalIds.includes(g.id), `${g.id}: Stage 1 signal→case backlink preserved`);
  for (const d of s.decisions) ok(SEED_CASES[d.caseId]?.decisionIds.includes(d.id), `${d.id}: Stage 1 case→decision backlink preserved`);
}
// LOG numbers agree with Stage 1 (single source of truth)
{
  const v2 = versionOf(EVIDENCE_BY_ID["EVD-LOG-01"], 2)!;
  const causeTable = v2.blocks.filter((b) => b.type === "table")[2];
  const total = causeTable && causeTable.type === "table" ? causeTable.rows.reduce((a, r) => a + Number(r[1]), 0) : -1;
  ok(total === 520, `EVD-LOG-01 v2 cause codes add up to the Stage 1 Western-lane delayed count (${total})`);
  const ins = EVIDENCE_BY_ID["EVD-INS-04"].versions![0].blocks[0];
  ok(ins.type === "table" && ins.rows.reduce((a, r) => a + Number(r[1]), 0) === 1030 && ins.rows.reduce((a, r) => a + Number(r[2]), 0) === 1150, "EVD-INS-04 accident-year reserves add up to the Stage 1 Engineering totals");
}

// ---------------------------------------------------------------- B. Case creation, duplicates, roles
let w = emptyWork();
const dup = M.createCase(w, C(), { sectorId: "logistics", title: "Duplicate attempt", question: "", summary: "", ownerId: "PER-LOG-01", priority: "High", dueDate: "2026-11-01", signalIds: ["SIG-LOG-01"], entityIds: [], objectiveIds: [] });
ok(!dup.ok && dup.code === "DUPLICATE_ACTIVE_CASE" && dup.caseId === "CAS-LOG-01", "creating from a signal that has an active case is blocked and points at the existing case");
for (const role of ["Expert", "Approver"] as Role[]) fails(M.createCase(w, C(role), { sectorId: "logistics", title: "Role test case", question: "", summary: "", ownerId: "PER-LOG-01", priority: "High", dueDate: "2026-11-01", signalIds: [], entityIds: [], objectiveIds: [] }), /cannot create/, `${role} cannot create cases`);
fails(M.createCase(w, C(), { sectorId: "logistics", title: "x", question: "", summary: "", ownerId: "PER-LOG-03", priority: "High", dueDate: "bad", signalIds: [], entityIds: [], objectiveIds: [] }), /at least 5 characters/, "title validated");
const r = run<{ caseId: string }>(w, M.createCase(w, C(), { sectorId: "logistics", title: "Gateway vessel waiting times", question: "Is the port bulletin evidence of a systemic constraint?", summary: "From SIG-LOG-05", ownerId: "PER-LOG-02", priority: "Medium", dueDate: "2026-11-02", signalIds: ["SIG-LOG-05"], entityIds: ["ENT-LOG-05"], objectiveIds: ["OBJ-LOG-02"] }), "create from signal");
w = r.work; const newId = r.value.caseId;
ok(newId === "CAS-LOG-03", `new case id is stable and sequential (${newId})`);
fails(M.createCase(w, C(), { sectorId: "logistics", title: "Second attempt on same signal", question: "", summary: "", ownerId: "PER-LOG-01", priority: "Low", dueDate: "2026-11-02", signalIds: ["SIG-LOG-05"], entityIds: [], objectiveIds: [] }), /already has an active case/, "second case for the same signal is blocked");
const nc = w.cases[newId];
ok(nc.status === "Draft" && nc.events.length === 1 && w.notifications.length === 1, "new case starts in Draft with an event and a notification");
const wo = buildWorld(w);
ok(sectorCounts(wo, "logistics").cases === 3 && sectorCounts(emptyWorldRef(), "logistics").cases === 2, "dashboard case count follows the store");
function emptyWorldRef() { return buildWorld(emptyWork()); }
ok(groupCounts(wo).untriaged === groupCounts(emptyWorldRef()).untriaged - 1, "untriaged signal count drops after creating a case");
ok(searchWorld(wo, "vessel waiting").some((h) => h.id === newId), "search finds the new case by title");
ok(searchWorld(wo, "quay cranes").some((h) => h.id === "EVD-LOG-04"), "search finds evidence by its readable content");
ok(wo.notifications.some((n) => n.recordId === newId), "notifications include the new case");

// ---------------------------------------------------------------- C. Editing, state machine
const edit = M.updateCase(w, C(), newId, { title: "Gateway vessel waiting-time constraint", priority: "High" });
w = apply(w, edit); ok(edit.ok && w.cases[newId].title.includes("waiting-time") && w.cases[newId].revision > nc.revision, "case fields can be edited");
fails(M.updateCase(w, C(), newId, { title: "Gateway vessel waiting-time constraint" }), /No changes/, "no-op edit is reported");
fails(M.updateCase(w, C("Approver"), newId, { title: "Approver attempt to edit" }), /cannot edit/, "Approver cannot edit");
let t = checkTransition(w.cases[newId], "Expert review", "Analyst");
ok(!t.allowed && /cannot move from “Draft” to “Expert review”/.test(t.reasons[0]), "Draft→Expert review is an illegal transition and says why");
t = checkTransition(w.cases[newId], "Brief ready", "Analyst");
ok(!t.allowed && /cannot move from “Draft” to “Brief ready”/.test(t.reasons[0]), "Draft→Brief ready is an illegal transition");
ok(checkTransition(w.cases[newId], "Investigating", "Approver").reasons.some((x) => /cannot change a case's status/.test(x)), "Approver cannot transition");
w = apply(w, M.transitionCase(w, C(), newId, "Investigating"));
ok(w.cases[newId].status === "Investigating", "Draft→Investigating allowed once the case is anchored");
fails(M.transitionCase(w, C(), newId, "Closed"), /closure reason/, "closing needs a reason");
fails(M.transitionCase(w, C(), newId, "Expert review"), /Request expert review/, "Expert review only through a review request");

// hypotheses, evidence links, duplicates, stance
const hy = run<{ id: string }>(w, M.addHypothesis(w, C(), newId, { kind: "primary", statement: "Crane maintenance is the main cause of waiting times.", status: "Open", rationale: "Bulletin." }), "add hypothesis"); w = hy.work;
const hy2 = run<{ id: string }>(w, M.addHypothesis(w, C(), newId, { kind: "alternative", statement: "Seasonal volume peak explains the waiting times.", status: "Open", rationale: "" }), "add alternative"); w = hy2.work;
fails(M.addHypothesis(w, C(), newId, { kind: "primary", statement: "short", status: "Open", rationale: "" }), /at least 10/, "hypothesis validated");
fails(M.linkEvidence(w, C(), newId, { evidenceId: "EVD-LOG-04", stance: "supports", hypothesisId: null, refs: [], note: "" }), /Choose the hypothesis/, "supports/contradicts need a hypothesis");
fails(M.linkEvidence(w, C(), newId, { evidenceId: "EVD-LOG-04", stance: "supports", hypothesisId: hy.value.id, refs: ["P99"], note: "" }), /Unknown reference/, "invalid reference rejected");
fails(M.linkEvidence(w, C(), newId, { evidenceId: "EVD-ENR-01", stance: "context", hypothesisId: null, refs: [], note: "" }), /same sector/, "cross-sector evidence rejected");
const l1 = run<{ id: string }>(w, M.linkEvidence(w, C(), newId, { evidenceId: "EVD-LOG-04", stance: "supports", hypothesisId: hy.value.id, refs: ["P1", "P2"], note: "Cranes out of service." }), "link evidence"); w = l1.work;
fails(M.linkEvidence(w, C(), newId, { evidenceId: "EVD-LOG-04", stance: "supports", hypothesisId: hy.value.id, refs: ["P1"], note: "" }), /already linked/, "duplicate evidence link prevented");
const l2 = run<{ id: string }>(w, M.linkEvidence(w, C(), newId, { evidenceId: "EVD-LOG-04", stance: "contradicts", hypothesisId: hy2.value.id, refs: ["P3"], note: "Backlog is not seasonal." }), "same evidence against another hypothesis"); w = l2.work;
w = apply(w, M.changeStance(w, C(), newId, l1.value.id, "context"));
ok(w.cases[newId].links.find((l) => l.id === l1.value.id)!.history.length === 2, "stance change keeps history");
fails(M.changeStance(w, C(), newId, l1.value.id, "context"), /already has that stance/, "no-op stance rejected");
w = apply(w, M.unlinkEvidence(w, C(), newId, l2.value.id));
ok(w.cases[newId].links.length === 2 && !!w.cases[newId].links.find((l) => l.id === l2.value.id)!.unlinkedAt && activeLinks(w.cases[newId]).length === 1, "unlinking soft-deletes and preserves the record");
ok(w.cases[newId].events.some((e) => e.type === "evidence-unlinked"), "unlink recorded in activity");
w = apply(w, M.linkEvidence(w, C(), newId, { evidenceId: "EVD-LOG-04", stance: "contradicts", hypothesisId: hy2.value.id, refs: ["P3"], note: "Relinked." }));
ok(activeLinks(w.cases[newId]).length === 2, "an unlinked evidence item can be linked again");

// tasks
const tk = run<{ id: string }>(w, M.addTask(w, C(), newId, { title: "Ask the port for crane maintenance schedule", description: "", assigneeId: "PER-LOG-05", dueDate: "2026-10-20", evidenceIds: ["EVD-LOG-04"] }), "add task"); w = tk.work;
fails(M.addTask(w, C(), newId, { title: "Task for someone elsewhere", description: "", assigneeId: "PER-ENR-01", dueDate: "2026-10-20", evidenceIds: [] }), /named assignee from this sector/, "assignee must be in the sector");
fails(M.setTaskStatus(w, C(), newId, tk.value.id, "Done"), /Record the task's findings/, "cannot complete a task without findings");
fails(M.setTaskStatus(w, C("Approver"), newId, tk.value.id, "In progress"), /cannot progress tasks/, "Approver cannot progress tasks");
fails(M.setTaskStatus(w, C("Expert"), newId, M.addTask(w, C(), newId, { title: "Analyst-owned follow-up", description: "", assigneeId: "PER-LOG-02", dueDate: "2026-10-21", evidenceIds: [] }).ok ? "TSK-LOG-03-02" : "", "In progress"), /not to analysts|not found/, "Expert cannot progress analyst-assigned tasks");
w = apply(w, M.setTaskStatus(w, C("Expert"), newId, tk.value.id, "In progress"));
w = apply(w, M.setTaskStatus(w, C(), newId, tk.value.id, "Done", { findings: "Two cranes return to service on 20 October.", completionNote: "Confirmed by the port desk." }));
ok(w.cases[newId].tasks[0].status === "Done" && !!w.cases[newId].tasks[0].completedAt, "task completes with findings and a note");

// review: requirements, expert findings, revision, history retained
fails(M.requestReview(w, C("Expert"), newId, { assigneeId: "PER-LOG-03", scope: "Please review the case.", dueDate: "2026-10-30" }), /cannot request expert review/, "Expert cannot request review");
fails(M.requestReview(w, C(), newId, { assigneeId: "PER-LOG-01", scope: "Please review the evidence for this case.", dueDate: "2026-10-30" }), /named expert/, "reviewer must be an expert");
const rq = run<{ requestId: string; round: number }>(w, M.requestReview(w, C(), newId, { assigneeId: "PER-LOG-03", scope: "Please review whether crane maintenance explains the waiting times.", dueDate: "2026-10-30" }), "request review"); w = rq.work;
ok(w.cases[newId].status === "Expert review" && openReviews(w.cases[newId]).length === 1, "requesting review moves the case to Expert review");
fails(M.requestReview(w, C(), newId, { assigneeId: "PER-LOG-03", scope: "Please review whether crane maintenance explains the waiting times.", dueDate: "2026-10-30" }), /already in progress|open review/, "second concurrent request blocked");
const linkVersion = activeLinks(w.cases[newId])[0];
const cite = { evidenceId: linkVersion.evidenceId, version: linkVersion.version, ref: "P1" };
fails(M.submitReview(w, C("Analyst"), newId, { requestId: rq.value.requestId, outcome: "Reviewed", note: "", findings: [{ type: "Finding", text: "Looks reasonable overall.", citations: [cite] }] }), /cannot submit review findings/, "Analyst cannot submit expert findings");
fails(M.submitReview(w, C("Expert"), newId, { requestId: rq.value.requestId, outcome: "Reviewed", note: "", findings: [] }), /at least one finding/, "review needs a finding");
fails(M.submitReview(w, C("Expert"), newId, { requestId: rq.value.requestId, outcome: "Reviewed", note: "", findings: [{ type: "Finding", text: "No citation provided here.", citations: [] }] }), /cite at least one/, "finding needs a citation");
fails(M.submitReview(w, C("Expert"), newId, { requestId: rq.value.requestId, outcome: "Reviewed", note: "", findings: [{ type: "Finding", text: "Cites something not on the case.", citations: [{ evidenceId: "EVD-LOG-01", version: 1, ref: "P1" }] }] }), /not linked to this case/, "citation must be linked to the case");
fails(M.submitReview(w, C("Expert"), newId, { requestId: rq.value.requestId, outcome: "Reviewed", note: "", findings: [{ type: "Finding", text: "Bad reference on a linked item.", citations: [{ ...cite, ref: "P42" }] }] }), /has no reference P42/, "citation reference must exist");
fails(M.submitReview(w, C("Expert"), newId, { requestId: rq.value.requestId, outcome: "Revision requested", note: "", findings: [{ type: "Finding", text: "Valid finding text here.", citations: [cite] }] }), /Explain what must be revised/, "revision needs a note");
const sub1 = run<{ outcome: string; findingIds: string[] }>(w, M.submitReview(w, C("Expert"), newId, { requestId: rq.value.requestId, outcome: "Revision requested", note: "Add the Eastern Terminal capacity evidence before relying on this.", findings: [{ type: "Finding", text: "Port bulletin supports the crane hypothesis.", citations: [cite] }, { type: "Caveat", text: "Operator-reported figures are not audited.", citations: [cite] }] }), "expert returns revision requested"); w = sub1.work;
ok(w.cases[newId].status === "Investigating", "revision requested returns the case to Investigating");
ok(reviewState(w.cases[newId].reviews[0]) === "Revision requested", "review state is Revision requested");
const rq2 = run<{ requestId: string; round: number }>(w, M.requestReview(w, C(), newId, { assigneeId: "PER-LOG-03", scope: "Revised: added capacity evidence, please re-review.", dueDate: "2026-11-05" }), "request revised review"); w = rq2.work;
ok(rq2.value.requestId === rq.value.requestId && rq2.value.round === 2, "revised request is round 2 of the same request");
ok(w.cases[newId].reviews[0].rounds[0].submission!.findings.length === 2, "earlier findings are retained after a revised review is requested");
const sub2 = run<{ outcome: string }>(w, M.submitReview(w, C("Expert"), newId, { requestId: rq2.value.requestId, outcome: "Reviewed", note: "", findings: [{ type: "Disagreement", text: "I disagree with the proposed priority; it should stay Medium.", citations: [cite] }] }), "expert returns reviewed"); w = sub2.work;
ok(reviewState(w.cases[newId].reviews[0]) === "Reviewed" && w.cases[newId].status === "Expert review", "Reviewed leaves the case in Expert review (Reviewed ≠ approved, no auto-advance)");
ok(!w.cases[newId].events.some((e) => /approved/i.test(e.text) && !/does not mean approved|not an approval|no approval|approved or executed/i.test(e.text)), "no event claims approval");

// brief: compile, versions, stale
t = checkTransition(w.cases[newId], "Brief ready", "Analyst");
ok(!t.allowed && t.reasons.some((x) => /Compile a decision brief/.test(x)), "Brief ready needs a compiled brief");
const bf = run<{ version: number }>(w, M.compileBriefMut(w, C(), newId), "compile brief"); w = bf.work;
ok(bf.value.version === 1 && !isBriefStale(w.cases[newId]), "brief v1 compiled and current");
const b1 = latestBrief(w.cases[newId])!;
ok(b1.content.options.some((o) => /monitor/i.test(o.label)) && b1.content.options.some((o) => /no action/i.test(o.label)), "brief options include monitoring and no action");
ok(b1.content.expertFindings.length === 3 && b1.content.expertFindings.some((f) => f.type === "Disagreement") && b1.content.expertFindings.some((f) => f.round === 1), "brief includes all expert findings, disagreements and earlier rounds");
ok(/No financial impact is calculated/.test(b1.content.financialImpactNote), "brief states that no financial impact is calculated");
ok(b1.basis.links.length === 2 && b1.basis.findings.length === 3, "brief records the evidence versions and findings used");
fails(M.compileBriefMut(w, C(), newId), /already reflects/, "cannot compile an identical brief");
w = apply(w, M.transitionCase(w, C(), newId, "Brief ready")); ok(w.cases[newId].status === "Brief ready", "Expert review→Brief ready after a current brief");
// stale: change a hypothesis
w = apply(w, M.updateHypothesis(w, C(), newId, hy.value.id, { kind: "primary", statement: "Crane maintenance is the main cause of the longer waiting times.", status: "Supported", rationale: "Bulletin and task finding." }));
ok(isBriefStale(w.cases[newId]) && latestBrief(w.cases[newId])!.version === 1, "editing a hypothesis marks the saved brief Needs refresh and keeps v1");
ok(staleReasons(w.cases[newId], b1).some((x) => /Hypothesis .* was edited/.test(x)), "stale reasons name the changed hypothesis");
fails(M.transitionCase(w, C(), newId, "Closed", { reason: "No action required", note: "Closing the case without a decision." }), /Needs refresh/, "cannot close a Brief ready case whose brief needs refresh");
w = apply(w, M.transitionCase(w, C(), newId, "Investigating"));
const bf2 = run<{ version: number }>(w, M.compileBriefMut(w, C(), newId), "recompile"); w = bf2.work;
ok(bf2.value.version === 2 && w.cases[newId].briefs.length === 2 && !isBriefStale(w.cases[newId]), "recompiling creates v2 and retains v1");
// evidence change → stale; adopting a newer version is a change
let lw = emptyWork();
const lg = SEED_CASES["CAS-LOG-01"];
ok(!isBriefStale(lg), "seeded LOG brief is current");
const l01 = lg.links.find((l) => l.evidenceId === "EVD-LOG-01")!;
lw = apply(lw, M.adoptEvidenceVersion(lw, C(), "CAS-LOG-01", l01.id));
ok(lw.cases["CAS-LOG-01"].links.find((l) => l.id === l01.id)!.version === 2 && isBriefStale(lw.cases["CAS-LOG-01"]), "adopting evidence v2 marks the brief stale");
fails(M.adoptEvidenceVersion(lw, C(), "CAS-LOG-01", l01.id), /latest version/, "cannot adopt twice");
const lw2 = apply(emptyWork(), M.linkEvidence(emptyWork(), C(), "CAS-LOG-01", { evidenceId: "EVD-LOG-03", stance: "context", hypothesisId: null, refs: ["T1R2"], note: "Jeddah DC cover is low." }));
ok(isBriefStale(lw2.cases["CAS-LOG-01"]), "linking new evidence marks the brief stale");
// brief editing
const edited = { ...latestBrief(w.cases[newId])!.content, nextStep: "Take the brief to the Approver after the capacity evidence arrives." };
const eb = run<{ version: number }>(w, M.editBrief(w, C(), newId, edited, "Clarified next step"), "edit brief"); w = eb.work;
ok(eb.value.version === 3 && w.cases[newId].briefs[2].source === "edited" && w.cases[newId].briefs.length === 3, "editing saves a new version");
fails(M.editBrief(w, C(), newId, { ...edited, options: edited.options.filter((o) => !/monitor/i.test(o.label)) }, ""), /include monitoring/, "brief must keep a monitoring option");
fails(M.editBrief(w, C("Expert"), newId, edited, ""), /cannot edit briefs/, "Expert cannot edit the brief");
// close
fails(M.transitionCase(w, C(), newId, "Brief ready"), /cannot move from “Investigating” to “Brief ready”/, "Investigating→Brief ready is illegal");
const cl = M.transitionCase(w, C(), newId, "Closed", { reason: "No action required", note: "Waiting times normalised after crane maintenance." });
w = apply(w, cl);
ok(w.cases[newId].status === "Closed" && !!w.cases[newId].closure && /does not record that any decision was approved/.test(w.cases[newId].events.at(-1)!.text), "closing records a reason and states it is not an approval");
fails(M.updateCase(w, C(), newId, { title: "Edit after closing the case" }), /closed and read-only/, "closed cases are read-only");
const sigFree = M.createCase(w, C(), { sectorId: "logistics", title: "Fresh case on same signal", question: "", summary: "", ownerId: "PER-LOG-01", priority: "Low", dueDate: "2026-11-02", signalIds: ["SIG-LOG-05"], entityIds: [], objectiveIds: [] });
ok(sigFree.ok, "after closing, the signal can have a new case");
w = apply(w, M.transitionCase(w, C(), newId, "Investigating"));
ok(w.cases[newId].status === "Investigating" && !w.cases[newId].closure, "a closed case can be reopened to Investigating");
ok(can("Analyst", "case.edit") && !can("Approver", "case.edit") && !can("Expert", "brief.compile"), "permission table matches the stated roles");

// ---------------------------------------------------------------- D. Persistence, migration, recovery
const ui = { ...DEFAULT_UI, role: "Expert" as Role, sectorId: "logistics" as const, readIds: ["NTF-01", "NTF-W-0001"], entered: true };
const text = serialize(ui, w);
const back = parseSaved(text, "v2");
ok(back.status === "ok" && back.status === "ok" && JSON.stringify(back.work) === JSON.stringify(w) && back.ui.role === "Expert", "save/load round trip preserves Stage 2 work and UI state");
const store: Record<string, string> = { [KEY_V1]: JSON.stringify({ sectorId: "insurance", role: "Approver", readIds: ["NTF-01", "NTF-02"], entered: true }) };
const mem = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] };
const mig = loadPersisted(mem);
ok(mig.status === "ok" && mig.migrated !== undefined && mig.ui.role === "Approver" && mig.ui.sectorId === "insurance" && mig.ui.readIds.length === 2 && Object.keys(mig.work.cases).length === 0, "Stage 1 state migrates without discarding role, sector or read state");
ok(/migrated/.test((mig as { migrated?: string }).migrated ?? ""), "migration produces a user-visible notice");
const inval = (s: string, src: "v1" | "v2" = "v2") => parseSaved(s, src);
ok(inval("{not json").status === "invalid", "malformed JSON is reported as invalid");
ok(inval(JSON.stringify({ schemaVersion: 99, ui: ui, work: emptyWork() })).status === "invalid", "a newer schema is reported as unsupported");
ok(inval(JSON.stringify({ schemaVersion: 2, ui: { ...ui, role: "Admin" }, work: emptyWork() })).status === "invalid", "unsupported role is rejected");
{
  const clone = JSON.parse(text);
  clone.work.cases[newId].status = "Teleported";
  ok(inval(JSON.stringify(clone)).status === "invalid", "invalid case status is rejected");
  const clone2 = JSON.parse(text); clone2.work.cases[newId].links[0].refs = ["P777"];
  ok(inval(JSON.stringify(clone2)).status === "invalid", "evidence reference that does not exist is rejected");
  const clone3 = JSON.parse(text); delete clone3.work.cases[newId].tasks;
  ok(inval(JSON.stringify(clone3)).status === "invalid", "missing task list is rejected");
  const clone4 = JSON.parse(text); clone4.work.cases["CAS-LOG-77"] = { ...clone4.work.cases[newId], id: "CAS-ENR-77" };
  ok(inval(JSON.stringify(clone4)).status === "invalid", "case key/id mismatch is rejected");
}
ok(isDefaultState(DEFAULT_UI, emptyWork()) && !isDefaultState(ui, w), "default state is detected so Reset leaves no stored data");
void SECTOR_IDS; void SIGNAL_BY_ID; void basisOf; void (null as unknown as CaseAggregate);

console.log(`Stage 2 store checks: ${checks - failures}/${checks} passed`);
if (failures) { console.error(`${failures} store check(s) failed`); process.exit(1); }
