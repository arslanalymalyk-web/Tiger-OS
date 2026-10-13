import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { dirOf, isLocale, LOCALE_COOKIE, tr } from "@/i18n";
import { getSession } from "@/server/web";
import "./platform.css";

export const metadata: Metadata = {
  title: "ServiceTrace",
  description: "Maintenance traceability for contractors and their customers.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function PlatformRoot({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = s?.actor.locale ?? (isLocale(c) ? c : "en");
  return (
    <html lang={locale} dir={dirOf(locale)} className="h-full antialiased">
      <body className="min-h-full">
        <a className="skip" href="#main">{tr(locale, "nav.skip")}</a>
        {children}
      </body>
    </html>
  );
}
