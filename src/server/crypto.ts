import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { encryptionKey } from "./env";

const scrypt = (pw: string, salt: Buffer, len: number, o: { N: number; r: number; p: number; maxmem: number }) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw, salt, len, o, (e, k) => (e ? rej(e) : res(k))));

const N = 32768, R = 8, P = 1;

export const MIN_PASSWORD = 12;
export const passwordProblem = (pw: string): string | null =>
  pw.length < MIN_PASSWORD ? "password_short" : pw.length > 200 ? "password_long" : /^(.)\1+$/.test(pw) ? "password_weak" : null;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const k = await scrypt(pw, salt, 32, { N, r: R, p: P, maxmem: 128 * N * R * 2 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${k.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string | null): Promise<boolean> {
  // Always do the work, even for unknown users, to keep timing uniform.
  const dummy = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const [, n, r, p, salt, hash] = (stored ?? dummy).split("$");
  const expect = Buffer.from(hash, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), expect.length, { N: +n, r: +r, p: +p, maxmem: 128 * +n * +r * 2 });
  return stored !== null && timingSafeEqual(got, expect);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

// ── AES-256-GCM for secrets at rest (MFA seeds) ──
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

// ── TOTP (RFC 6238, SHA-1, 6 digits, 30 s) ──
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf: Buffer): string {
  let bits = 0, val = 0, out = "";
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  let bits = 0, val = 0; const out: number[] = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const i = B32.indexOf(ch); if (i < 0) throw new Error("bad base32");
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export const newTotpSecret = () => base32Encode(randomBytes(20));
export function totpAt(secret: string, atMs: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30000)));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[19] & 15;
  const code = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1_000_000).padStart(6, "0");
}
export function verifyTotp(secret: string, code: string, nowMs: number): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((w) => {
    const exp = Buffer.from(totpAt(secret, nowMs + w * 30000));
    return timingSafeEqual(exp, Buffer.from(code));
  });
}
export const totpUri = (secret: string, account: string) =>
  `otpauth://totp/ServiceTrace:${encodeURIComponent(account)}?secret=${secret}&issuer=ServiceTrace`;
