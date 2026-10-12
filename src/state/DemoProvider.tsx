"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Role, SectorId } from "@/lib/types";
import { demoNow } from "@/lib/stage2/mutations";
import { DEFAULT_UI, KEY, KEY_V1, KEY_V2, ROLES, clearPersisted, isDefaultState, loadPersisted, serialize, type UiState } from "@/lib/stage2/persist";
import { emptyWork, type Ctx, type Result, type WorkState } from "@/lib/stage2/types";
import { buildWorld, type World } from "@/lib/stage2/world";

export interface Recovery { reason: string; source: "v1" | "v2" | "v3" }

interface Ctxt extends UiState {
  hydrated: boolean;
  unreadCount: number;
  /** Current world: seeded records plus local Stage 2 changes. Before hydration it equals the seed. */
  world: World;
  setSector: (id: SectorId) => void;
  setRole: (r: Role) => void;
  enter: (role: Role, sectorId?: SectorId) => void;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  markAllRead: () => void;
  /** Run a validated mutation against the current work state and persist the result. */
  act: <T>(fn: (work: WorkState, ctx: Ctx) => Result<T>) => Result<T>;
  recovery: Recovery | null;
  migrationNotice: string | null;
  dismissMigration: () => void;
  /** Clears saved data (both keys) and returns to the seeded state. */
  reset: () => void;
}
const DemoCtx = createContext<Ctxt | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [ui, setUi] = useState<UiState>(DEFAULT_UI);
  const [work, setWork] = useState<WorkState>(emptyWork);
  const [hydrated, setHydrated] = useState(false);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);
  // A sector page may report its route before localStorage has been read; keep that choice and apply it after hydration.
  const early = useRef<SectorId | null>(null);
  const hydratedRef = useRef(false);
  const workRef = useRef<WorkState>(work);
  const uiRef = useRef<UiState>(ui);
  const recoveryRef = useRef<Recovery | null>(null);
  const migratedRef = useRef(false);

  useEffect(() => {
    queueMicrotask(() => {
      const res = loadPersisted(localStorage);
      let nextUi = DEFAULT_UI;
      if (res.status === "ok") {
        nextUi = res.ui;
        workRef.current = res.work; setWork(res.work);
        if (res.migrated) { setMigrationNotice(res.migrated); migratedRef.current = true; }
      } else if (res.status === "invalid") {
        // Do not overwrite the unreadable data until the user chooses to reset it.
        const rec = { reason: res.reason, source: res.source };
        recoveryRef.current = rec; setRecovery(rec);
      }
      if (early.current) nextUi = { ...nextUi, sectorId: early.current };
      uiRef.current = nextUi; setUi(nextUi);
      hydratedRef.current = true;
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated || recovery) return;
    try {
      if (isDefaultState(ui, work)) { localStorage.removeItem(KEY); if (!migratedRef.current) { localStorage.removeItem(KEY_V2); localStorage.removeItem(KEY_V1); } }
      else {
        localStorage.setItem(KEY, serialize(ui, work));
        if (migratedRef.current) { localStorage.removeItem(KEY_V2); localStorage.removeItem(KEY_V1); migratedRef.current = false; }
      }
    } catch { /* storage unavailable: state is session-only */ }
  }, [ui, work, hydrated, recovery]);

  const patchUi = useCallback((fn: (u: UiState) => UiState) => setUi((u) => { const n = fn(u); uiRef.current = n; return n; }), []);
  const setSector = useCallback((sectorId: SectorId) => {
    if (!hydratedRef.current) early.current = sectorId;
    patchUi((s) => (s.sectorId === sectorId ? s : { ...s, sectorId }));
  }, [patchUi]);
  const setRole = useCallback((role: Role) => patchUi((s) => ({ ...s, role })), [patchUi]);
  const enter = useCallback((role: Role, sectorId?: SectorId) => patchUi((s) => ({ ...s, role, entered: true, sectorId: sectorId ?? s.sectorId })), [patchUi]);
  const markRead = useCallback((id: string) => patchUi((s) => (s.readIds.includes(id) ? s : { ...s, readIds: [...s.readIds, id] })), [patchUi]);
  const markUnread = useCallback((id: string) => patchUi((s) => ({ ...s, readIds: s.readIds.filter((x) => x !== id) })), [patchUi]);
  const world = useMemo(() => buildWorld(work), [work]);
  const worldRef = useRef(world);
  useEffect(() => { worldRef.current = world; }, [world]);
  const markAllRead = useCallback(() => patchUi((s) => ({ ...s, readIds: worldRef.current.notifications.map((n) => n.id) })), [patchUi]);

  const act = useCallback(<T,>(fn: (w: WorkState, c: Ctx) => Result<T>): Result<T> => {
    if (recoveryRef.current) return { ok: false, errors: ["Saved demonstration data could not be read. Reset the saved state (see the notice at the top of the page) before making changes."] };
    const res = fn(workRef.current, { role: uiRef.current.role, now: demoNow() });
    if (res.ok) { workRef.current = res.work; setWork(res.work); }
    return res;
  }, []);

  const reset = useCallback(() => {
    clearPersisted(localStorage);
    recoveryRef.current = null; migratedRef.current = false;
    workRef.current = emptyWork(); uiRef.current = DEFAULT_UI;
    setRecovery(null); setMigrationNotice(null); setWork(emptyWork()); setUi(DEFAULT_UI);
  }, []);

  const unreadCount = useMemo(() => world.notifications.filter((n) => !ui.readIds.includes(n.id)).length, [world, ui.readIds]);
  const value = useMemo<Ctxt>(
    () => ({ ...ui, hydrated, unreadCount, world, setSector, setRole, enter, markRead, markUnread, markAllRead, act, recovery, migrationNotice, dismissMigration: () => setMigrationNotice(null), reset }),
    [ui, hydrated, unreadCount, world, setSector, setRole, enter, markRead, markUnread, markAllRead, act, recovery, migrationNotice, reset],
  );
  return <DemoCtx.Provider value={value}>{children}</DemoCtx.Provider>;
}

export function useDemo(): Ctxt {
  const c = useContext(DemoCtx);
  if (!c) throw new Error("useDemo must be used within DemoProvider");
  return c;
}
export { ROLES };
