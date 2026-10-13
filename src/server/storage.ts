import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { uploadDir } from "./env";

// Storage driver interface. Local disk is the only implemented driver; an S3-compatible
// driver (private bucket, server-side encryption) must implement the same two methods.
export interface BlobStore {
  put(companyId: string, data: Buffer): Promise<string>;
  get(key: string): Promise<Buffer>;
}

class LocalStore implements BlobStore {
  private root = () => resolve(/*turbopackIgnore: true*/ process.cwd(), uploadDir());
  private path(key: string) {
    const p = resolve(this.root(), key);
    if (!p.startsWith(this.root() + "/")) throw new Error("invalid storage key"); // path traversal guard
    return p;
  }
  async put(companyId: string, data: Buffer) {
    const key = `${companyId}/${randomUUID()}`; // random key; the user's filename is never used on disk
    await mkdir(dirname(this.path(key)), { recursive: true });
    await writeFile(this.path(key), data, { flag: "wx", mode: 0o600 });
    return key;
  }
  get(key: string) { return readFile(this.path(key)); }
}
export const blobStore: BlobStore = new LocalStore();

/** Allowed upload types, detected from file content, not from the client-declared type or extension. */
export function sniffMime(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (b.length >= 5 && b.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}
