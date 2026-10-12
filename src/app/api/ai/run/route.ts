import { getProvider, getProviderStatus, timeoutFrom } from "@/lib/stage3/provider";
import { parseRequest, runAssist } from "@/lib/stage3/service";
import { fingerprintOf } from "@/lib/stage3/context";
import type { AiErrorCode, AssistResponse } from "@/lib/stage3/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 130;

const MAX_BODY = 300_000;
const HTTP: Record<AiErrorCode, number> = {
  not_configured: 503, rate_limited: 429, provider_error: 502, provider_auth: 502, timeout: 504, invalid_response: 502, refused: 422,
  input_too_large: 413, duplicate_in_flight: 409, interrupted: 500, network: 499, bad_request: 400,
};
// Duplicate-submit guard for this server process (a second tab or a double click). Per-process only.
const inflight: Set<string> = ((globalThis as unknown as { __tigerisInflight?: Set<string> }).__tigerisInflight ??= new Set());

function send(res: AssistResponse) {
  const status = res.ok ? 200 : HTTP[res.error.code] ?? 500;
  return Response.json(res, { status, headers: { "Cache-Control": "no-store", ...(!res.ok && res.error.retryAfterSeconds ? { "Retry-After": String(res.error.retryAfterSeconds) } : {}) } });
}

export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return send({ ok: false, error: { code: "input_too_large", message: "The request is larger than the allowed size." } });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return send({ ok: false, error: { code: "bad_request", message: "The request body is not valid JSON." } }); }
  const parsed = parseRequest(body);
  if (!parsed.ok) return send({ ok: false, error: parsed.error });
  const status = getProviderStatus();
  const provider = getProvider();
  if (!provider || !status.configured) return send({ ok: false, error: { code: "not_configured", message: "AI provider not configured. No request was sent anywhere." } });
  const req = parsed.req;
  if (!status.mock) req.mockScenario = undefined;
  const key = `${req.context.caseId}|${req.operation}|${req.question ?? ""}|${fingerprintOf(req.context)}`;
  if (inflight.has(key)) return send({ ok: false, error: { code: "duplicate_in_flight", message: "An identical request is already in progress on the server. Wait for it to finish." } });
  inflight.add(key);
  try {
    const res = await runAssist(req, { provider, timeoutMs: timeoutFrom(process.env), signal: request.signal, mode: status.mock ? "mock-provider" : "ai" });
    if (!res.ok) console.error(`[ai] run ${req.operation} failed: ${res.error.code}`);
    return send(res);
  } finally { inflight.delete(key); }
}
