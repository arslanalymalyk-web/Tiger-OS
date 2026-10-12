"use client";

import { useEffect, useRef } from "react";

/**
 * Modal dialog built on the native <dialog> element opened with showModal(), the platform's accessible dialog primitive
 * (no dialog library exists in this project). The browser makes everything outside the dialog inert, contains Tab focus,
 * fires `cancel` on Escape, and exposes role=dialog with `aria-labelledby` as its accessible name.
 * On top of that this component:
 *  - wraps Tab/Shift+Tab at the first/last control so focus cannot leave to the browser UI;
 *  - sets `inert` on #app-root (the whole application) while open, so isolation is explicit and testable;
 *  - focuses the dialog itself on open (so its title is announced) and when `focusKey` changes (drawer record navigation);
 *  - returns focus to the element that was focused when the dialog mounted (the opener), falling back to <main>;
 *  - closes on Escape and on backdrop click via `onClose`.
 */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** A native modal dialog keeps focus on the page but lets Tab escape to the browser UI at either end; wrap instead. */
function wrapTab(e: React.KeyboardEvent<HTMLDialogElement>) {
  if (e.key !== "Tab") return;
  const dialog = e.currentTarget;
  const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
  if (items.length === 0) { e.preventDefault(); dialog.focus(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === dialog)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
}

export function ModalDialog({
  labelledBy, onClose, className, children, focusKey,
}: { labelledBy: string; onClose: () => void; className: string; children: React.ReactNode; focusKey?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    const root = document.getElementById("app-root");
    if (!dialog.open) dialog.showModal();
    root?.setAttribute("inert", "");
    dialog.focus();
    return () => {
      root?.removeAttribute("inert");
      if (dialog.open) dialog.close();
      const target = opener && opener !== document.body && document.contains(opener) ? opener : document.getElementById("main-content");
      target?.focus();
    };
  }, []);

  // Move focus back to the dialog when its content changes (e.g. navigating between linked record drawers).
  useEffect(() => {
    if (focusKey !== undefined) { ref.current?.focus(); ref.current?.scrollTo({ top: 0 }); }
  }, [focusKey]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      tabIndex={-1}
      className={className}
      onCancel={(e) => { e.preventDefault(); onCloseRef.current(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onCloseRef.current(); }}
      onKeyDown={wrapTab}
    >
      {children}
    </dialog>
  );
}
