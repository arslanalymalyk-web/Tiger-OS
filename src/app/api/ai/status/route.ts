import { getProviderStatus } from "@/lib/stage3/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Reports whether a provider is configured and which model name is set. Never returns any credential. */
export function GET() {
  return Response.json(getProviderStatus(), { headers: { "Cache-Control": "no-store" } });
}
