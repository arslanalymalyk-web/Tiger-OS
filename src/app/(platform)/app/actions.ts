"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AppError } from "@/server/actor";
import * as Auth from "@/server/auth";
import * as C from "@/server/cases";
import * as M from "@/server/master";
import { createCompany } from "@/server/platform";
import { isLocale, LOCALE_COOKIE } from "@/i18n";
import { clearSessionCookie, clientIp, currentToken, guarded, requireActor, setSessionCookie, type FormState } from "@/server/web";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => s(fd, k) || undefined;
const date = (fd: FormData, k: string) => { const v = s(fd, k); return v ? new Date(v) : undefined; };

// ── public / session ──
export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  return guarded(async () => {
    const ip = await clientIp();
    const r = await Auth.login(s(fd, "email"), String(fd.get("password") ?? ""), { ip, ua: (await headers()).get("user-agent") });
    if (!r.ok) return { error: r.code };
    await setSessionCookie(r.token);
    redirect(r.mfaRequired ? "/app/mfa" : "/app");
  });
}
export async function mfaAction(_: FormState, fd: FormData): Promise<FormState> {
  return guarded(async () => {
    const token = await currentToken();
    if (!token || !(await Auth.verifyMfaForSession(token, s(fd, "code"), await clientIp()))) return { error: "invalid_code" };
    redirect("/app");
  });
}
export async function logoutAction() {
  const t = await currentToken();
  if (t) await Auth.logout(t);
  await clearSessionCookie();
  redirect("/app/login");
}
export async function forgotAction(_: FormState, fd: FormData): Promise<FormState> {
  return guarded(async () => { await Auth.requestPasswordReset(s(fd, "email"), await clientIp()); return { ok: true }; });
}
export async function tokenPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  return guarded(async () => {
    const kind = s(fd, "kind") === "invite" ? "invite" : "reset";
    const r = await Auth.consumeToken(s(fd, "token"), kind, String(fd.get("password") ?? ""), await clientIp());
    if (!r.ok) return { error: r.code };
    redirect("/app/login?done=1");
  });
}
export async function setLanguage(fd: FormData) {
  const l = s(fd, "locale");
  if (!isLocale(l)) return;
  (await cookies()).set(LOCALE_COOKIE, l, { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  const a = await Auth.resolveSession(await currentToken());
  if (a) await Auth.setLocale(a.actor, l);
  revalidatePath("/app", "layout");
}

// ── settings ──
export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  return guarded(async () => {
    const a = await requireActor();
    const r = await Auth.changePassword(a, String(fd.get("current") ?? ""), String(fd.get("next") ?? ""));
    if (!r.ok) return { error: r.code };
    await clearSessionCookie();
    redirect("/app/login?done=1");
  });
}
export async function beginMfaAction(): Promise<void> { await Auth.beginMfaEnrollment(await requireActor()); revalidatePath("/app/settings"); }
export async function confirmMfaAction(_: FormState, fd: FormData): Promise<FormState> {
  return guarded(async () => {
    if (!(await Auth.confirmMfaEnrollment(await requireActor(), s(fd, "code")))) return { error: "invalid_code" };
    revalidatePath("/app/settings");
  });
}
export async function disableMfaAction(_: FormState, fd: FormData): Promise<FormState> {
  return guarded(async () => {
    if (!(await Auth.disableMfa(await requireActor(), String(fd.get("password") ?? "")))) return { error: "invalid_credentials" };
    revalidatePath("/app/settings");
  });
}
export async function revokeSessionAction(fd: FormData) { await Auth.revokeSession(await requireActor(), s(fd, "id")); revalidatePath("/app/settings"); }

// ── work orders ──
export async function createCaseAction(_: FormState, fd: FormData): Promise<FormState> {
  return guarded(async () => {
    const a = await requireActor();
    const id = await C.createCase(a, {
      type: s(fd, "type") as "corrective", title: s(fd, "title"), description: opt(fd, "description"), siteId: s(fd, "siteId"),
      assetId: opt(fd, "assetId") ?? null, priority: s(fd, "priority") as "low", assignedTo: opt(fd, "assignedTo") ?? null,
    }, await clientIp());
    redirect(`/app/cases/${id}`);
  });
}

export async function caseOp(_: FormState, fd: FormData): Promise<FormState> {
  return guarded(async () => {
    const a = await requireActor();
    const id = s(fd, "caseId");
    const ip = await clientIp();
    switch (s(fd, "op")) {
      case "assign": await C.assignCase(a, id, s(fd, "technicianId"), ip); break;
      case "start": await C.startWork(a, id, ip); break;
      case "submit": await C.submitForReview(a, id, { observation: s(fd, "observation"), observedAt: date(fd, "observedAt") }, ip); break;
      case "return_info": await C.returnForInfo(a, id, s(fd, "reason"), ip); break;
      case "request_approval": await C.requestApproval(a, id, { summary: s(fd, "summary"), dueAt: date(fd, "dueAt"), internalNote: opt(fd, "internalNote") }, ip); break;
      case "respond_query": await C.respondToQuery(a, id, s(fd, "message"), ip); break;
      case "cancel_approval": await C.cancelApproval(a, id, s(fd, "reason"), ip); break;
      case "approve": await C.decideApproval(a, id, "approved", s(fd, "reason"), ip); break;
      case "reject": await C.decideApproval(a, id, "rejected", s(fd, "reason"), ip); break;
      case "request_info": await C.decideApproval(a, id, "info_requested", s(fd, "reason"), ip); break;
      case "defer": await C.deferCase(a, id, s(fd, "reason"), opt(fd, "until"), ip); break;
      case "reopen": await C.reopenCase(a, id, s(fd, "reason"), ip); break;
      case "complete_work": await C.completeWork(a, id, s(fd, "note"), ip); break;
      case "close": await C.closeCase(a, id, s(fd, "reason"), ip); break;
      case "remind": await C.remindApproval(a, id, opt(fd, "note"), ip); break;
      case "notify": await C.notifyCustomer(a, id, s(fd, "message"), ip); break;
      case "comment": await C.addComment(a, id, s(fd, "body"), s(fd, "visibility") === "customer" ? "customer" : "internal", ip); break;
      case "share": await C.shareEvidence(a, s(fd, "evidenceId"), "customer", ip); break;
      case "unshare": await C.shareEvidence(a, s(fd, "evidenceId"), "internal", ip); break;
      default: throw new AppError("forbidden", 403);
    }
    revalidatePath(`/app/cases/${id}`);
    revalidatePath("/app/cases");
    return { ok: true };
  });
}

export async function uploadEvidenceAction(_: FormState, fd: FormData): Promise<FormState> {
  return guarded(async () => {
    const a = await requireActor();
    const f = fd.get("file");
    if (!(f instanceof File) || f.size === 0) return { error: "file_empty" };
    await C.uploadEvidence(a, s(fd, "caseId"), { name: f.name, data: Buffer.from(await f.arrayBuffer()) },
      { caption: opt(fd, "caption"), capturedAt: date(fd, "capturedAt") ?? null, visibility: s(fd, "visibility") === "customer" ? "customer" : "internal" }, await clientIp());
    revalidatePath(`/app/cases/${s(fd, "caseId")}`);
    return { ok: true };
  });
}

export async function markReadAction() { await C.markNotificationsRead(await requireActor()); revalidatePath("/app", "layout"); }

// ── administration ──
export async function inviteAction(_: FormState, fd: FormData): Promise<FormState> {
  return guarded(async () => {
    const a = await requireActor();
    const sites = fd.getAll("siteIds").map(String).filter(Boolean);
    await Auth.inviteUser(a, { email: s(fd, "email"), name: s(fd, "name"), role: s(fd, "role") as "engineer", customerId: opt(fd, "customerId") ?? null, siteIds: sites }, await clientIp());
    revalidatePath("/app/admin/users");
    return { ok: true };
  });
}
export async function deactivateAction(_: FormState, fd: FormData): Promise<FormState> {
  return guarded(async () => { await Auth.deactivateUser(await requireActor(), s(fd, "userId"), await clientIp()); revalidatePath("/app/admin/users"); return { ok: true }; });
}
export async function masterAction(_: FormState, fd: FormData): Promise<FormState> {
  return guarded(async () => {
    const a = await requireActor();
    switch (s(fd, "kind")) {
      case "customer": await M.createCustomer(a, { name: s(fd, "name"), contactEmail: opt(fd, "contactEmail") }); break;
      case "contract": await M.createContract(a, { customerId: s(fd, "customerId"), reference: s(fd, "reference"), name: s(fd, "name") }); break;
      case "site": await M.createSite(a, { customerId: s(fd, "customerId"), contractId: opt(fd, "contractId"), name: s(fd, "name"), address: opt(fd, "address") }); break;
      case "asset": await M.createAsset(a, {
        siteId: s(fd, "siteId"), parentId: opt(fd, "parentId"), tag: s(fd, "tag"), name: s(fd, "name"), assetType: s(fd, "assetType"),
        discipline: s(fd, "discipline") as "mep", make: opt(fd, "make"), model: opt(fd, "model"), serialNumber: opt(fd, "serialNumber"),
        criticality: s(fd, "criticality") as "medium", installedOn: opt(fd, "installedOn"), warrantyUntil: opt(fd, "warrantyUntil"),
      }); break;
      default: throw new AppError("forbidden", 403);
    }
    revalidatePath("/app/admin/data");
    return { ok: true };
  });
}
export async function createCompanyAction(_: FormState, fd: FormData): Promise<FormState> {
  return guarded(async () => {
    await createCompany(await requireActor(), { name: s(fd, "name"), slug: s(fd, "slug"), adminEmail: s(fd, "adminEmail"), adminName: s(fd, "adminName"), locale: s(fd, "locale") === "ar" ? "ar" : "en" });
    revalidatePath("/app/platform");
    return { ok: true };
  });
}
