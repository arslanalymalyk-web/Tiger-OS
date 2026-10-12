/** Focus helpers shared by the drawer, modals and menus. */

let drawerTrigger: HTMLElement | null = null;

/** Remember what opened the record drawer so focus can return there on close. Ignored while the drawer is already open. */
export function rememberDrawerTrigger() {
  if (typeof document === "undefined") return;
  if (document.querySelector('[role="dialog"][aria-label="Record detail"]')) return;
  const el = document.activeElement as HTMLElement | null;
  drawerTrigger = el && el !== document.body ? el : null;
}

export function restoreDrawerFocus() {
  const el = drawerTrigger;
  drawerTrigger = null;
  if (el && document.contains(el)) { el.focus(); return; }
  // The trigger may have unmounted (e.g. a search result): fall back to the page heading.
  const h = document.getElementById("main-content");
  h?.focus();
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Keep Tab/Shift+Tab inside a dialog container. */
export function trapTab(e: React.KeyboardEvent | KeyboardEvent, container: HTMLElement | null) {
  if (e.key !== "Tab" || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null || x === document.activeElement);
  if (!items.length) { e.preventDefault(); container.focus(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === container)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
}
