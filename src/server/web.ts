import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { errorCode, type Actor } from "./actor";
import { resolveSession, type SessionInfo } from "./auth";
import { isProdLike } from "./env";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/i18n";
import { log } from "./log";

export const SESSION_COOKIE = isProdLike() ? "__Host-st_session" : "st_session";

export const getSession = cache(async (): Promise<SessionInfo | null> => resolveSession((await cookies()).get(SESSION_COOKIE)?.value));

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: isProdLike(), path: "/", maxAge: 7 * 24 * 3600 });
}
export async function clearSessionCookie() { (await cookies()).delete(SESSION_COOKIE); }

export async function currentToken() { return (await cookies()).get(SESSION_COOKIE)?.value; }

export async function guestLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : "en";
}

/** For pages: require a fully authenticated session (MFA satisfied when enrolled). */
export async function requireSession(): Promise<SessionInfo> {
  const s = await getSession();
  if (!s) redirect("/app/login");
  if (s.mfaEnabled && !s.mfaVerified) redirect("/app/mfa");
  return s;
}
export async function requireActor(): Promise<Actor> { return (await requireSession()).actor; }

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}

export type FormState = { error?: string; ok?: boolean; note?: string };

/** Wraps a server action body: unexpected errors are logged and returned as a generic message, never a stack trace. */
export async function guarded(fn: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
    const code = errorCode(e);
    if (code === "unexpected") log("error", "action_failed", { error: e as Error });
    return { error: code };
  }
}
