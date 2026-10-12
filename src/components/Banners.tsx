"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info, X } from "lucide-react";
import { useDemo } from "@/state/DemoProvider";

/** Visible recovery path when saved data cannot be read, and a one-time notice after migrating Stage 1 state. */
export function Banners() {
  const { recovery, migrationNotice, dismissMigration, reset } = useDemo();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  if (!recovery && !migrationNotice) return null;
  return (
    <div className="space-y-2 px-3 pt-3 sm:px-5">
      {recovery && (
        <div role="alert" className="rounded-lg border border-rd-600/40 bg-rd-100 p-3 text-sm text-rd-800" data-testid="recovery-banner">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} aria-hidden />Saved demonstration data could not be used</p>
          <p className="mt-1">{recovery.reason} The seeded demonstration is shown instead and your saved data has <b>not</b> been overwritten. Changes are paused until you reset the saved state.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!confirm ? <button onClick={() => setConfirm(true)} className="rounded-lg bg-rd-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rd-800" data-testid="recovery-reset">Reset saved state…</button> : (
              <>
                <span className="text-xs">This deletes the unreadable saved data and restores all seeded records.</span>
                <button onClick={() => { reset(); setConfirm(false); router.replace("/workspaces"); }} className="rounded-lg bg-rd-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rd-800" data-testid="recovery-confirm">Confirm reset</button>
                <button onClick={() => setConfirm(false)} className="rounded-lg border border-rd-600/40 bg-white px-3 py-1.5 text-sm font-medium">Cancel</button>
              </>
            )}
          </div>
        </div>
      )}
      {migrationNotice && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-sg-500/40 bg-sg-100 p-3 text-sm text-sg-700" data-testid="migration-banner">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden /><p className="flex-1">{migrationNotice}</p>
          <button onClick={dismissMigration} aria-label="Dismiss notice" className="rounded p-0.5 hover:bg-white/60"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}
