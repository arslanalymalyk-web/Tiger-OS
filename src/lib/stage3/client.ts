/** Browser-side calls to the server adapter. Only provider status and the bounded request/response cross this boundary. */
import type { AssistRequest, AssistResponse, ProviderStatus } from "./types";

export async function fetchProviderStatus(signal?: AbortSignal): Promise<ProviderStatus | null> {
  try {
    const r = await fetch("/api/ai/status", { cache: "no-store", signal });
    if (!r.ok) return null;
    return (await r.json()) as ProviderStatus;
  } catch { return null; }
}

/** Sends one request. `signal` cancels the wait locally; the provider may still finish processing. */
export async function postAssist(req: AssistRequest, signal: AbortSignal, timeoutMs: number): Promise<AssistResponse> {
  const guard = new AbortController();
  let timedOut = false;
  const t = setTimeout(() => { timedOut = true; guard.abort(); }, timeoutMs + 5000);
  const onAbort = () => guard.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const r = await fetch("/api/ai/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req), signal: guard.signal, cache: "no-store" });
    try { return (await r.json()) as AssistResponse; } catch { return { ok: false, error: { code: "provider_error", message: `The server returned an unreadable response (HTTP ${r.status}).` } }; }
  } catch {
    if (timedOut) return { ok: false, error: { code: "timeout", message: "No response arrived in time. The request was abandoned; the provider may still have processed it." } };
    if (signal.aborted) return { ok: false, error: { code: "network", message: "Cancelled." } };
    return { ok: false, error: { code: "network", message: "The server could not be reached." } };
  } finally { clearTimeout(t); signal.removeEventListener("abort", onAbort); }
}
