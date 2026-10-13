import type { Role } from "./rbac";

/** The authenticated principal every service function receives. Built only from a verified session. */
export type Actor = {
  userId: string;
  companyId: string | null;
  role: Role;
  customerId: string | null;
  name: string;
  email: string;
  locale: "en" | "ar";
  /** null = not limited by this kind of grant */
  siteGrants: string[] | null;
  contractGrants: string[] | null;
};

export class AppError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export const forbidden = () => new AppError("forbidden", 403);
export const notFound = () => new AppError("not_found", 404);

/** Maps any thrown error to a stable, non-leaking code (validation errors from zod included). */
export function errorCode(e: unknown): string {
  if (e instanceof AppError) return e.code;
  if (e && typeof e === "object" && Array.isArray((e as { issues?: unknown }).issues)) return "validation";
  return "unexpected";
}
