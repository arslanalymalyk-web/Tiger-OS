// Central, validated server configuration. Secrets come from the environment only.
export type AppEnv = "development" | "staging" | "production" | "test";

export function appEnv(): AppEnv {
  const v = process.env.APP_ENV ?? (process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development");
  if (v === "development" || v === "staging" || v === "production" || v === "test") return v;
  throw new Error(`APP_ENV must be development, staging, production or test (got "${v}")`);
}

export const isProdLike = () => appEnv() === "production" || appEnv() === "staging";

export function databaseUrl(): string {
  const u = process.env.DATABASE_URL;
  if (!u) throw new Error("DATABASE_URL is not set. See docs/PLATFORM.md (Local setup).");
  return u;
}

/** 32-byte key (base64 or hex) used to encrypt MFA secrets at rest. */
export function encryptionKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    if (isProdLike()) throw new Error("APP_ENCRYPTION_KEY is required in staging/production");
    // Deterministic dev/test key, never acceptable in production.
    return Buffer.alloc(32, 7);
  }
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return buf;
}

export const publicBaseUrl = () => (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const uploadDir = () => process.env.UPLOAD_DIR ?? ".data/uploads";
export const maxUploadBytes = () => Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024);

export const mailConfigured = () => Boolean(process.env.SMTP_URL && process.env.MAIL_FROM);
