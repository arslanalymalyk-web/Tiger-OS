"use client";
/** Orchestrates one assistant run in the browser: create → running → (provider call | deterministic) → validate → complete/fail/cancel.
 *  Generated output is saved only as a run record; it never modifies a case until an Analyst accepts a proposal. */
import { useCallback, useEffect, useState } from "react";
import { useDemo } from "./DemoProvider";
import { getCase } from "@/lib/stage2/rules";
import { demoNow } from "@/lib/stage2/mutations";
import { buildContext, scopeOf } from "@/lib/stage3/context";
import { deterministicRaw } from "@/lib/stage3/deterministic";
import { validateRaw } from "@/lib/stage3/validate";
import { cancelRun, completeRun, createRun, failRun, markRunning } from "@/lib/stage3/mutations";
import { fetchProviderStatus, postAssist } from "@/lib/stage3/client";
import type { AiOperation, ProviderStatus } from "@/lib/stage3/types";

const controllers = new Map<string, AbortController>();
const guard = new Set<string>();
const DEFAULT_TIMEOUT = 45_000;

let statusCache: Promise<ProviderStatus | null> | null = null;
export function loadStatus(force = false) { if (force || !statusCache) statusCache = fetchProviderStatus(); return statusCache; }

/** Provider status from the server; `undefined` while loading, `null` if the status endpoint could not be read. */
export function useProviderStatus(): ProviderStatus | null | undefined {
  const [st, setSt] = useState<ProviderStatus | null | undefined>(undefined);
  useEffect(() => { let live = true; loadStatus().then((s) => { if (live) setSt(s); }); return () => { live = false; }; }, []);
  return st;
}

export interface StartInput { caseId: string; operation: AiOperation; question?: string; mode: "ai" | "deterministic"; status: ProviderStatus | null | undefined; mockScenario?: string; onCreated?: (runId: string) => void }
export interface StartResult { ok: boolean; errors: string[]; runId?: string }

export function useAssistant() {
  const { act } = useDemo();

  const start = useCallback(async (i: StartInput): Promise<StartResult> => {
    const q = (i.question ?? "").trim();
    const key = `${i.caseId}|${i.operation}|${i.operation === "question" ? q : ""}`;
    if (guard.has(key)) return { ok: false, errors: ["This request is already being submitted."] };
    if (i.mode === "ai" && !(i.status && i.status.configured)) return { ok: false, errors: ["AI provider not configured. Use the deterministic demonstration instead, or configure a provider (see README)."] };
    guard.add(key);
    try {
      const mode = i.mode === "deterministic" ? "deterministic" : i.status?.mock ? "mock-provider" : "ai";
      const created = act((w, c) => createRun(w, c, { caseId: i.caseId, operation: i.operation, question: q, mode }));
      if (!created.ok) return { ok: false, errors: created.errors };
      const runId = created.value.runId;
      const running = act((w, c) => markRunning(w, c, runId));
      if (!running.ok) return { ok: false, errors: running.errors, runId };
      i.onCreated?.(runId);
      const c0 = getCase(created.work, i.caseId)!;
      const ctx0 = buildContext(c0), scope0 = scopeOf(ctx0);
      const opts = { operation: i.operation, now: demoNow(), question: q };

      if (mode === "deterministic") {
        const v = validateRaw(deterministicRaw(i.operation, ctx0, scope0, q), ctx0, scope0, opts);
        if (!v.ok) act((w, c) => failRun(w, c, runId, { code: "invalid_response", message: v.error }));
        else act((w, c) => completeRun(w, c, runId, v.output, {}));
        return { ok: true, errors: [], runId };
      }

      const ctl = new AbortController();
      controllers.set(runId, ctl);
      const t0 = Date.now();
      const res = await postAssist({ operation: i.operation, question: q || undefined, context: ctx0, mockScenario: i.status?.mock ? i.mockScenario : undefined }, ctl.signal, i.status?.timeoutMs ?? DEFAULT_TIMEOUT);
      controllers.delete(runId);
      if (ctl.signal.aborted) return { ok: true, errors: [], runId }; // cancelled locally; a late result is not saved
      if (!res.ok) { act((w, c) => failRun(w, c, runId, res.error, { durationMs: Date.now() - t0 })); return { ok: true, errors: [], runId }; }
      const v = validateRaw(res.raw, ctx0, scope0, opts);
      if (!v.ok) { act((w, c) => failRun(w, c, runId, { code: "invalid_response", message: `${v.error} Nothing was saved from it.` }, { provider: res.meta.provider, model: res.meta.model })); return { ok: true, errors: [], runId }; }
      const output = { ...v.output, warnings: [...res.meta.warnings, ...v.output.warnings] };
      act((w, c) => completeRun(w, c, runId, output, { provider: res.meta.provider, model: res.meta.model, promptVersion: res.meta.promptVersion, usage: res.meta.usage, durationMs: res.meta.durationMs }));
      return { ok: true, errors: [], runId };
    } finally { guard.delete(key); }
  }, [act]);

  const cancel = useCallback((runId: string) => {
    const r = act((w, c) => cancelRun(w, c, runId));
    if (r.ok) controllers.get(runId)?.abort();
    return r;
  }, [act]);

  return { start, cancel };
}
