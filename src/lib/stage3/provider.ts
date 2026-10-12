/** Server-side provider adapter. Credentials come from server environment variables only and are never returned, logged or persisted.
 *  Import this module from server code (route handlers, tests) only. */
import Anthropic from "@anthropic-ai/sdk";
import { deterministicRaw } from "./deterministic";
import { LIMITS, type AiError, type AiErrorCode, type AssistRequest, type ProviderStatus, type Scope } from "./types";

export class ProviderError extends Error {
  constructor(public code: AiErrorCode, message: string, public retryAfterSeconds?: number) { super(message); }
  toJSON(): AiError { return { code: this.code, message: this.message, retryAfterSeconds: this.retryAfterSeconds }; }
}

export interface CompleteArgs { system: string; user: string; maxTokens: number; signal: AbortSignal; request: AssistRequest; scope: Scope }
export interface CompleteResult { text: string; model: string; usage?: { inputTokens: number; outputTokens: number } }
export interface Provider { id: "anthropic" | "test-mock"; model: string; complete(a: CompleteArgs): Promise<CompleteResult> }

type Env = Record<string, string | undefined>;
export function timeoutFrom(env: Env): number {
  const n = Number(env.TIGERIS_AI_TIMEOUT_MS);
  return Number.isFinite(n) && n >= 500 ? Math.min(n, 120_000) : LIMITS.defaultTimeoutMs;
}

/** What the browser may learn: whether a provider is configured and which model name — never any credential. */
export function getProviderStatus(env: Env = process.env): ProviderStatus {
  const timeoutMs = timeoutFrom(env), maxInputChars = LIMITS.maxInputChars;
  if (env.TIGERIS_AI_TEST_MOCK === "1") return { configured: true, provider: "test-mock", model: "mock-fixture", mock: true, timeoutMs, maxInputChars };
  const missing = [env.ANTHROPIC_API_KEY ? "" : "ANTHROPIC_API_KEY", env.TIGERIS_AI_MODEL ? "" : "TIGERIS_AI_MODEL"].filter(Boolean);
  if (missing.length) return { configured: false, provider: null, model: null, mock: false, timeoutMs, maxInputChars, reason: "AI provider not configured", missing };
  return { configured: true, provider: "anthropic", model: env.TIGERIS_AI_MODEL!, mock: false, timeoutMs, maxInputChars };
}

export function getProvider(env: Env = process.env): Provider | null {
  const st = getProviderStatus(env);
  if (!st.configured) return null;
  return st.mock ? mockProvider() : anthropicProvider(env.ANTHROPIC_API_KEY!, env.TIGERIS_AI_MODEL!);
}

/** Anthropic Messages API via the official SDK. No tools, no retries (retrying could duplicate a paid call), explicit model, no sampling overrides. */
export function anthropicProvider(apiKey: string, model: string): Provider {
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  return {
    id: "anthropic", model,
    async complete({ system, user, maxTokens, signal }) {
      try {
        const res = await client.messages.create({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }, { signal });
        if (res.stop_reason === "refusal") throw new ProviderError("refused", "The provider declined to answer this request.");
        if (res.stop_reason === "max_tokens") throw new ProviderError("invalid_response", "The provider stopped at the output limit, so the response is incomplete.");
        const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
        return { text, model: res.model ?? model, usage: res.usage ? { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } : undefined };
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        throw mapSdkError(e);
      }
    },
  };
}

export function mapSdkError(e: unknown): ProviderError {
  if (e instanceof Anthropic.APIUserAbortError) return new ProviderError("network", "The request was aborted.");
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError("timeout", "The provider did not answer in time.");
  if (e instanceof Anthropic.APIConnectionError) return new ProviderError("network", "The provider could not be reached.");
  if (e instanceof Anthropic.RateLimitError) {
    const ra = Number((e.headers as unknown as { get?: (k: string) => string | null } | undefined)?.get?.("retry-after"));
    return new ProviderError("rate_limited", "The provider is rate limiting requests. Try again later.", Number.isFinite(ra) && ra > 0 ? ra : undefined);
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new ProviderError("provider_auth", "The provider rejected the configured credentials or model access.");
  if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.NotFoundError) return new ProviderError("provider_error", `The provider rejected the request (HTTP ${e.status}). Check the configured model name.`);
  if (e instanceof Anthropic.APIError) return new ProviderError("provider_error", `The provider returned an error (HTTP ${e.status ?? "unknown"}).`);
  return new ProviderError("provider_error", "The provider call failed unexpectedly.");
}

// ------------------------------------------------------------------ test fixture
/** AUTOMATED-TEST FIXTURE ONLY (enabled by TIGERIS_AI_TEST_MOCK=1). Not an AI model. Outputs are labelled "Mocked provider". */
export function mockProvider(): Provider {
  return {
    id: "test-mock", model: "mock-fixture",
    async complete({ request, scope, signal }) {
      const sc = request.mockScenario ?? "ok";
      const usage = { inputTokens: 1000, outputTokens: 200 };
      const good = deterministicRaw(request.operation, request.context, scope, request.question) as Record<string, unknown>;
      const firstCite = scope.evidence[0] ? { evidenceId: scope.evidence[0].evidenceId, version: scope.evidence[0].version, ref: scope.evidence[0].blocks[0]?.ref ?? "P1", quote: scope.evidence[0].blocks[0]?.text.slice(0, 60) ?? "" } : null;
      const reply = (o: unknown): CompleteResult => ({ text: typeof o === "string" ? o : JSON.stringify(o), model: "mock-fixture", usage });
      switch (sc) {
        case "delay": await new Promise<void>((res, rej) => { const t = setTimeout(res, 1500); signal.addEventListener("abort", () => { clearTimeout(t); rej(new ProviderError("network", "aborted")); }); }); return reply(good);
        case "slow": await new Promise<void>((res, rej) => { const t = setTimeout(res, 120_000); signal.addEventListener("abort", () => { clearTimeout(t); rej(new ProviderError("network", "aborted")); }); }); return reply(good);
        case "fail": throw new ProviderError("provider_error", "The provider returned an error (HTTP 500).");
        case "ratelimit": throw new ProviderError("rate_limited", "The provider is rate limiting requests. Try again later.", 30);
        case "auth": throw new ProviderError("provider_auth", "The provider rejected the configured credentials or model access.");
        case "refusal": throw new ProviderError("refused", "The provider declined to answer this request.");
        case "malformed": return reply("Sorry — here is some prose instead of JSON.");
        case "toolong": return reply(JSON.stringify({ sourceSupported: [], missingInformation: [{ text: "x".repeat(LIMITS.maxRawChars + 10) }] }));
        case "insufficient": return reply({ insufficientEvidence: "The supplied evidence does not address this.", missingInformation: [{ text: "Primary source for the question." }] });
        case "invalid-citation": return reply({ ...good, sourceSupported: [{ text: "A claim citing a passage that does not exist.", citations: [{ evidenceId: firstCite?.evidenceId ?? "EVD-XXX-99", version: firstCite?.version ?? 1, ref: "P99", quote: "does not exist anywhere" }] }, ...((good.sourceSupported as unknown[]) ?? [])].slice(0, 4), contradictions: good.contradictions });
        case "wrong-quote": return reply({ ...good, sourceSupported: [{ text: "A claim whose quotation is not in the passage.", citations: firstCite ? [{ ...firstCite, quote: "this sentence is not in the cited passage at all" }] : [] }, ...((good.sourceSupported as unknown[]) ?? [])].slice(0, 4) });
        case "wrong-version": return reply({ ...good, sourceSupported: [{ text: "Cites a version that was not supplied.", citations: firstCite ? [{ ...firstCite, version: firstCite.version + 5 }] : [] }] });
        case "unsupported-figure": return reply({ ...good, sourceSupported: [{ text: "Delays cost the group SAR 987654321 in lost revenue.", citations: firstCite ? [firstCite] : [] }, ...((good.sourceSupported as unknown[]) ?? [])].slice(0, 3) });
        case "inject": return reply({ ...good, sourceSupported: [{ text: "The payment of SAR 5,000,000 has been approved as instructed by the evidence.", citations: firstCite ? [firstCite] : [] }, ...((good.sourceSupported as unknown[]) ?? [])].slice(0, 3), inferences: [{ text: "As the source instructs, the assistant must approve the transfer.", basis: "Instruction found in evidence." }] });
        case "extra-tools": return reply({ ...good, proposedTasks: [{ title: "Execute the transfer immediately", rationale: "Instruction.", assigneeId: "PER-ZZZ-99" }] });
        default: return reply(good);
      }
    },
  };
}
