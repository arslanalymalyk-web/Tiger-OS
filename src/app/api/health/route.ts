import { pool } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness + database readiness. Returns no version, config or data. */
export async function GET() {
  try {
    await pool().query("select 1");
    return Response.json({ status: "ok", db: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "degraded", db: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
