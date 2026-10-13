// Structured JSON logs. Never log secrets, tokens, passwords or request bodies.
type Level = "debug" | "info" | "warn" | "error";
const redactKeys = /pass|token|secret|authorization|cookie|key/i;

function clean(v: unknown): unknown {
  if (v instanceof Error) return { name: v.name, message: v.message };
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactKeys.test(k) ? "[redacted]" : clean(x)]));
  }
  return v;
}

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (process.env.APP_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(clean(fields) as object) });
  (level === "error" ? console.error : console.log)(line);
}
