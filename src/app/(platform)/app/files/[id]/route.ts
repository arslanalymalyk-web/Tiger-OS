import { errorCode } from "@/server/actor";
import { readEvidence } from "@/server/cases";
import { resolveSession } from "@/server/auth";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE } from "@/server/web";

export const dynamic = "force-dynamic";

/** Authorised evidence download. Tenant, role, customer-visibility and integrity are enforced in readEvidence(). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s || (s.mfaEnabled && !s.mfaVerified)) return new Response("Unauthorized", { status: 401 });
  try {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const f = await readEvidence(s.actor, id, ip);
    const inline = f.mime.startsWith("image/");
    return new Response(new Uint8Array(f.data), {
      headers: {
        "Content-Type": f.mime,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    const code = errorCode(e);
    return new Response(code === "not_found" ? "Not found" : code === "integrity_failure" ? "Integrity check failed" : "Error", { status: code === "not_found" ? 404 : code === "integrity_failure" ? 500 : 400 });
  }
}
