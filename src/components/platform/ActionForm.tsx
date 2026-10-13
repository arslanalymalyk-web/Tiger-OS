"use client";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/server/web";

type Props = {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  /** localized error messages keyed by code, plus "unexpected" and "validation" */
  errors: Record<string, string>;
  okText?: string;
  confirmText?: string;
  resetOnSuccess?: boolean;
  className?: string;
  children: React.ReactNode;
};

/** Form wired to a server action: pending state, accessible error/success messages, optional confirmation for consequential actions. */
export function ActionForm({ action, errors, okText, confirmText, resetOnSuccess = true, className, children }: Props) {
  const [state, run, pending] = useActionState(action, {} as FormState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok && resetOnSuccess) ref.current?.reset(); }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={run}
      className={className ?? "grid gap-3"}
      onSubmit={(e) => { if (confirmText && !window.confirm(confirmText)) e.preventDefault(); }}
      aria-busy={pending}
    >
      {children}
      <div aria-live="polite">
        {state.error && <p role="alert" className="alert-error">{errors[state.error] ?? errors.unexpected}</p>}
        {state.ok && okText && <p className="alert-ok">{okText}</p>}
      </div>
    </form>
  );
}

export function Submit({ children, danger, secondary }: { children: React.ReactNode; danger?: boolean; secondary?: boolean }) {
  return <SubmitInner danger={danger} secondary={secondary}>{children}</SubmitInner>;
}
function SubmitInner({ children, danger, secondary }: { children: React.ReactNode; danger?: boolean; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={`btn ${danger ? "btn-danger" : secondary ? "btn-secondary" : ""}`}>{pending ? "…" : children}</button>;
}

/** datetime-local that submits an unambiguous UTC ISO value computed from the user's device time zone. */
export function LocalTimeField({ name, label, defaultNow, hint }: { name: string; label: string; defaultNow?: boolean; hint?: string }) {
  const visible = useRef<HTMLInputElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const sync = () => { hidden.current!.value = visible.current!.value ? new Date(visible.current!.value).toISOString() : ""; };
  useEffect(() => {
    if (!defaultNow || !visible.current || visible.current.value) return;
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    visible.current.value = d.toISOString().slice(0, 16);
    sync();
  }, [defaultNow]);
  return (
    <div>
      <label className="label" htmlFor={`${name}-local`}>{label}</label>
      <input ref={visible} id={`${name}-local`} type="datetime-local" className="field" onChange={sync} />
      <input ref={hidden} type="hidden" name={name} defaultValue="" />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
