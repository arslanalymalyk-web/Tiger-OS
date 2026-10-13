import { fmtDateTime, fmtDuration, fmtNumber, messagesWithPrefix, tr, type Locale } from "@/i18n";

/** Per-request translation helpers bound to a locale. */
export function viewFor(locale: Locale) {
  return {
    locale,
    t: (key: string, params?: Record<string, string | number>) => tr(locale, key, params),
    dt: (d: Date | string | null | undefined) => fmtDateTime(d, locale),
    dur: (ms: number) => fmtDuration(ms, locale),
    n: (v: number) => fmtNumber(v, locale),
    errors: messagesWithPrefix(locale, "err."),
  };
}
export type View = ReturnType<typeof viewFor>;
