/* Credential-gated smoke test of the REAL provider path. Not part of automated verification.
   Run: ANTHROPIC_API_KEY=... TIGERIS_AI_MODEL=<model id> npx tsx scripts/smoke-provider.ts
   Makes ONE small request (Logistics, "summarize") and validates the answer. Without credentials it does nothing and says so. */
import { SEED_CASES } from "../src/lib/stage2/seed";
import { buildContext, scopeOf } from "../src/lib/stage3/context";
import { getProvider, getProviderStatus } from "../src/lib/stage3/provider";
import { runAssist } from "../src/lib/stage3/service";
import { validateRaw } from "../src/lib/stage3/validate";

async function main() {
  const st = getProviderStatus();
  if (!st.configured || st.mock) {
    console.log(`NOT PERFORMED: no real provider is configured (${st.reason ?? "mock fixture is enabled"}${st.missing ? `; missing ${st.missing.join(", ")}` : ""}). No request was made.`);
    return;
  }
  const ctx = buildContext(SEED_CASES["CAS-LOG-01"]);
  const scope = scopeOf(ctx);
  console.log(`Calling ${st.provider} model ${st.model} with ${scope.totalChars} characters of fictional evidence…`);
  const res = await runAssist({ operation: "summarize", context: ctx }, { provider: getProvider()!, timeoutMs: st.timeoutMs, mode: "ai" });
  if (!res.ok) { console.log(`FAILED: ${res.error.code} — ${res.error.message}`); process.exitCode = 1; return; }
  const v = validateRaw(res.raw, ctx, scope, { operation: "summarize", now: "2026-10-12T09:00" });
  if (!v.ok) { console.log(`Response was not usable: ${v.error}`); process.exitCode = 1; return; }
  const o = v.output;
  console.log(`OK model=${res.meta.model} usage=${JSON.stringify(res.meta.usage)} durationMs=${res.meta.durationMs}`);
  console.log(`source-supported=${o.sourceSupported.length} inferences=${o.inferences.length} missing=${o.missing.length} rejected=${o.rejected.length} insufficient=${o.insufficient ?? "no"}`);
  for (const r of o.rejected) console.log(`  rejected [${r.section}] ${r.reasons.join(" | ")}`);
}
main().catch((e) => { console.error("Smoke test error:", e instanceof Error ? e.message : "unknown"); process.exitCode = 1; });
