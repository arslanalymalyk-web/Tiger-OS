import { ar } from "./ar";
import { en, type MessageKey } from "./en";

export type Locale = "en" | "ar";
export const LOCALES: Locale[] = ["en", "ar"];
export const LOCALE_COOKIE = "st_lang";
export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");
export const isLocale = (v: unknown): v is Locale => v === "en" || v === "ar";
export type { MessageKey };

const dict: Record<Locale, Record<MessageKey, string>> = { en, ar };

export function tr(locale: Locale, key: MessageKey | string, params: Record<string, string | number> = {}): string {
  const raw = (dict[locale] as Record<string, string>)[key] ?? (en as Record<string, string>)[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

export const messagesWithPrefix = (locale: Locale, prefix: string): Record<string, string> =>
  Object.fromEntries(Object.entries(dict[locale]).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));

/** Locale-correct date/time. Arabic uses the Gregorian calendar with Arabic-Indic digits, rendered right-to-left by the page. */
export function fmtDateTime(d: Date | string | null | undefined, locale: Locale): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: process.env.APP_TIMEZONE ?? "UTC" }).format(new Date(d));
}
export function fmtNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-GB").format(n);
}
/** Human duration such as "2 d 3 h" / "٢ ي ٣ س". */
export function fmtDuration(ms: number, locale: Locale): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  const u = (k: "days" | "hours" | "minutes", v: number) => `${fmtNumber(v, locale)} ${tr(locale, `dash.${k}`)}`;
  if (d) return [u("days", d), h ? u("hours", h) : ""].filter(Boolean).join(" ");
  if (h) return [u("hours", h), m ? u("minutes", m) : ""].filter(Boolean).join(" ");
  return u("minutes", m);
}
