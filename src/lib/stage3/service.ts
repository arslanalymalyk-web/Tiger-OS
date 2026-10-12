/** Server-side orchestration of one assistance request: bound inputs, call the provider, bound and parse the output.
 *  Citation/claim validation happens in validate.ts (run by the app against the same supplied scope). */
import { PEOPLE } from "@/data";
import { scopeOf } from "./context";
import { buildUserMessage, PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt";
import { ProviderError, type Provider } from "./provider";
import { instructionWarnings } from "./validate";
import { AI_OPERATIONS, LIMITS, type AiError, type AssistRequest, type AssistResponse } from "./types";

export function parseRequest(body: unknown): { ok: true; req: AssistRequest } | { ok: false; error: AiError } {
  const bad = (message: string): { ok: false; error: AiError } => ({ ok: false, error: { code: "bad_request", message } });
  if (typeof body !== "object" || body === null) return bad("The request body must be a JSON object.");
  const b = body as Record<string, unknown>;
  if (!AI_OPERATIONS.includes(b.operation as never)) return bad("Unknown operation.");
  const c = b.context as Record<string, unknown> | undefined;
  if (!c || typeof c !== "object" || typeof c.caseId !== "string" || !/^CAS-[A-Z]{3}-\d{2,}$/.test(c.caseId) || typeof c.sectorId !== "string") return bad("The case context is missing or malformed.");
  for (const k of ["hypotheses", "links", "tasks", "findings", "notes"]) if (!Array.isArray(c[k])) return bad(`The case context is missing “${k}”.`);
  if ((c.links as unknown[]).length > LIMITS.maxLinks) return bad("Too many evidence links in scope.");
  const q = typeof b.question === "string" ? b.question.trim() : "";
  if (b.operation === "question" && q.length < 5) return bad("Enter a question of at least 5 characters.");
  if (q.length > LIMITS.maxQuestionChars) return { ok: false, error: { code: "input_too_large", message: `The question is longer than ${LIMITS.maxQuestionChars} characters.` } };
  return { ok: true, req: { operation: b.operation as AssistRequest["operation"], question: q || undefined, context: b.context as AssistRequest["context"], mockScenario: typeof b.mockScenario === "string" ? b.mockScenario : undefined } };
}

export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1];
  const a = t.indexOf("{"), z = t.lastIndexOf("}");
  if (a < 0 || z <= a) throw new SyntaxError("no JSON object");
  return JSON.parse(t.slice(a, z + 1));
}

export interface RunDeps { provider: Provider; timeoutMs: number; signal?: AbortSignal; mode: "ai" | "mock-provider" }

export async function runAssist(req: AssistRequest, deps: RunDeps): Promise<AssistResponse> {
  const started = Date.now();
  const scope = scopeOf(req.context);
  if (scope.tooLarge) return { ok: false, error: { code: "input_too_large", message: `The evidence scope is ${scope.totalChars.toLocaleString("en-US")} characters; the limit is ${LIMITS.maxInputChars.toLocaleString("en-US")}.` } };
  if (!scope.evidence.length) return { ok: false, error: { code: "bad_request", message: "No readable evidence is linked to this case, so there is nothing to ground a response on." } };
  const people = PEOPLE.filter((p) => p.sectorId === req.context.sectorId).map((p) => ({ id: p.id, name: p.name, title: p.title }));
  const user = buildUserMessage(req, scope, people);

  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, deps.timeoutMs);
  const onAbort = () => ctl.abort();
  if (deps.signal) { if (deps.signal.aborted) ctl.abort(); else deps.signal.addEventListener("abort", onAbort, { once: true }); }
  try {
    const res = await deps.provider.complete({ system: SYSTEM_PROMPT, user, maxTokens: LIMITS.maxOutputTokens, signal: ctl.signal, request: req, scope });
    if (res.text.length > LIMITS.maxRawChars) return { ok: false, error: { code: "invalid_response", message: `The response was longer than the ${LIMITS.maxRawChars.toLocaleString("en-US")}-character limit and was discarded.` } };
    let raw: unknown;
    try { raw = extractJson(res.text); } catch { return { ok: false, error: { code: "invalid_response", message: "The provider returned text that is not valid JSON. Nothing was saved from it." } }; }
    const warnings = instructionWarnings(scope).map((w) => `Passage ${w.evidenceId} v${w.version} ${w.ref} contains instruction-like text. It was supplied as untrusted data and cannot support a claim.`);
    return { ok: true, raw, meta: { provider: deps.provider.id, model: res.model || deps.provider.model, promptVersion: PROMPT_VERSION, usage: res.usage, durationMs: Date.now() - started, mode: deps.mode, warnings } };
  } catch (e) {
    if (timedOut) return { ok: false, error: { code: "timeout", message: `The provider did not answer within ${Math.round(deps.timeoutMs / 1000)} seconds. The request was abandoned; the provider may still have processed it.` } };
    if (deps.signal?.aborted) return { ok: false, error: { code: "network", message: "The request was cancelled." } };
    if (e instanceof ProviderError) return { ok: false, error: e.toJSON() };
    return { ok: false, error: { code: "provider_error", message: "The provider call failed unexpectedly." } };
  } finally {
    clearTimeout(timer);
    deps.signal?.removeEventListener("abort", onAbort);
  }
}
