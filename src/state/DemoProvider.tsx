"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Role, SectorId } from "@/lib/types";
import { NOTIFICATIONS, isSectorId } from "@/data";

const KEY = "tigeris.demo.v1";
const ROLES: Role[] = ["Analyst", "Expert", "Approver"];

interface Persisted {
  sectorId: SectorId;
  role: Role;
  /** Notification ids the user has read. Unread is the seeded default. */
  readIds: string[];
  entered: boolean;
}
const DEFAULTS: Persisted = { sectorId: "energy", role: "Analyst", readIds: [], entered: false };

interface Ctx extends Persisted {
  hydrated: boolean;
  unreadCount: number;
  setSector: (id: SectorId) => void;
  setRole: (r: Role) => void;
  enter: (role: Role, sectorId?: SectorId) => void;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  markAllRead: () => void;
  reset: () => void;
}
const DemoCtx = createContext<Ctx | null>(null);

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<Persisted>;
    const valid = new Set(NOTIFICATIONS.map((n) => n.id));
    return {
      sectorId: p.sectorId && isSectorId(p.sectorId) ? p.sectorId : DEFAULTS.sectorId,
      role: p.role && ROLES.includes(p.role) ? p.role : DEFAULTS.role,
      readIds: Array.isArray(p.readIds) ? p.readIds.filter((x) => valid.has(x)) : [],
      entered: !!p.entered,
    };
  } catch {
    return DEFAULTS;
  }
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount (server render always uses defaults, avoiding mismatches).
  useEffect(() => {
    queueMicrotask(() => {
      setState(load());
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable: state is session-only */
    }
  }, [state, hydrated]);

  const setSector = useCallback((sectorId: SectorId) => setState((s) => (s.sectorId === sectorId ? s : { ...s, sectorId })), []);
  const setRole = useCallback((role: Role) => setState((s) => ({ ...s, role })), []);
  const enter = useCallback((role: Role, sectorId?: SectorId) => setState((s) => ({ ...s, role, entered: true, sectorId: sectorId ?? s.sectorId })), []);
  const markRead = useCallback((id: string) => setState((s) => (s.readIds.includes(id) ? s : { ...s, readIds: [...s.readIds, id] })), []);
  const markUnread = useCallback((id: string) => setState((s) => ({ ...s, readIds: s.readIds.filter((x) => x !== id) })), []);
  const markAllRead = useCallback(() => setState((s) => ({ ...s, readIds: NOTIFICATIONS.map((n) => n.id) })), []);
  const reset = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setState(DEFAULTS);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      ...state,
      hydrated,
      unreadCount: NOTIFICATIONS.filter((n) => !state.readIds.includes(n.id)).length,
      setSector, setRole, enter, markRead, markUnread, markAllRead, reset,
    }),
    [state, hydrated, setSector, setRole, enter, markRead, markUnread, markAllRead, reset],
  );
  return <DemoCtx.Provider value={value}>{children}</DemoCtx.Provider>;
}

export function useDemo(): Ctx {
  const c = useContext(DemoCtx);
  if (!c) throw new Error("useDemo must be used within DemoProvider");
  return c;
}
export { ROLES };
