import Link from "next/link";
import { can, type Role } from "@/server/rbac";
import { unreadCount } from "@/server/cases";
import { requireSession } from "@/server/web";
import { viewFor } from "@/server/view";
import { logoutAction, setLanguage } from "../actions";

function navFor(role: Role): { href: string; key: string }[] {
  switch (role) {
    case "platform_admin": return [{ href: "/app/platform", key: "nav.companies" }];
    case "field_technician": return [{ href: "/app/cases?mine=1", key: "nav.jobs" }];
    case "customer_approver": return [{ href: "/app/portal", key: "nav.portal" }];
    default: {
      const l = [{ href: "/app/dashboard", key: "nav.dashboard" }, { href: "/app/cases", key: "nav.cases" }];
      if (can(role, "case.create")) l.push({ href: "/app/cases/new", key: "nav.new_case" });
      if (can(role, "user.manage")) l.push({ href: "/app/admin/users", key: "nav.admin_users" }, { href: "/app/admin/data", key: "nav.admin_data" });
      if (can(role, "audit.view")) l.push({ href: "/app/admin/audit", key: "nav.admin_audit" });
      return l;
    }
  }
}

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const v = viewFor(s.actor.locale);
  const unread = s.actor.companyId ? await unreadCount(s.actor) : 0;
  const other = s.actor.locale === "ar" ? "en" : "ar";
  return (
    <div className="min-h-screen">
      <header className="border-b border-[color:var(--color-line)] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <Link href="/app" className="text-lg font-extrabold text-[color:var(--color-brand-700)]">{v.t("app.name")}</Link>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="hidden sm:inline text-[color:var(--color-mute)]">{s.actor.name} · {v.t(`role.${s.actor.role}`)}</span>
            {s.actor.companyId && (
              <Link href="/app/notifications" className="btn btn-secondary" aria-label={`${v.t("nav.notifications")}${unread ? ` (${v.n(unread)})` : ""}`}>
                {v.t("nav.notifications")}{unread > 0 && <span className="badge badge-bad">{v.n(unread)}</span>}
              </Link>
            )}
            <form action={setLanguage}><input type="hidden" name="locale" value={other} /><button className="btn btn-secondary" lang={other}>{v.t("nav.language")}</button></form>
            <Link href="/app/settings" className="btn btn-secondary">{v.t("nav.settings")}</Link>
            <form action={logoutAction}><button className="btn btn-secondary">{v.t("nav.signout")}</button></form>
          </div>
        </div>
        <nav aria-label="Primary" className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex gap-1 pb-2">
            {navFor(s.actor.role).map((n) => (
              <li key={n.href}><Link href={n.href} className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 font-semibold text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-brand-50)]">{v.t(n.key)}</Link></li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-sm text-[color:var(--color-mute)]">{v.t("case.responsibility_note")}</footer>
    </div>
  );
}
