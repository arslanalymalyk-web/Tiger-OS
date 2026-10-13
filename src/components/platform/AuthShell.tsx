import { guestLocale } from "@/server/web";
import { viewFor } from "@/server/view";
import { setLanguage } from "@/app/(platform)/app/actions";

export async function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  const locale = await guestLocale();
  const v = viewFor(locale);
  const other = locale === "ar" ? "en" : "ar";
  return (
    <main id="main" tabIndex={-1} className="mx-auto grid min-h-screen max-w-md content-center gap-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <p className="text-2xl font-extrabold text-[color:var(--color-brand-700)]">{v.t("app.name")}</p>
        <form action={setLanguage}><input type="hidden" name="locale" value={other} /><button className="btn btn-secondary" lang={other}>{v.t("nav.language")}</button></form>
      </div>
      <div className="card p-6">
        <h1 className="mb-4 text-xl font-bold">{title}</h1>
        {children}
      </div>
      <p className="hint">{v.t("app.demo_notice")}</p>
    </main>
  );
}
