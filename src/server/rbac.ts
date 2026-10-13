// Role → permission matrix. Technical review, customer decision and (later) financial
// permissions are deliberately separate. This is checked on the server for every action.
export const ROLES = ["platform_admin", "company_admin", "operations_manager", "engineer", "field_technician", "customer_approver", "auditor"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "case.view", "case.create", "case.assign", "case.work", "case.review", "case.notify_customer",
  "approval.request", "approval.decide", "approval.remind", "case.close", "case.comment",
  "evidence.upload", "master.manage", "user.manage", "audit.view", "dashboard.view", "company.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const m = (...p: Permission[]) => new Set<Permission>(p);
const MATRIX: Record<Role, Set<Permission>> = {
  platform_admin: m("company.manage"),
  company_admin: m("case.view", "case.create", "case.assign", "case.notify_customer", "approval.remind", "case.close", "case.comment", "evidence.upload", "master.manage", "user.manage", "audit.view", "dashboard.view"),
  operations_manager: m("case.view", "case.create", "case.assign", "case.notify_customer", "approval.remind", "case.close", "case.comment", "evidence.upload", "dashboard.view"),
  engineer: m("case.view", "case.create", "case.review", "case.notify_customer", "approval.request", "approval.remind", "case.close", "case.comment", "evidence.upload", "dashboard.view"),
  field_technician: m("case.view", "case.work", "case.comment", "evidence.upload"),
  customer_approver: m("case.view", "approval.decide", "case.comment"),
  auditor: m("case.view", "audit.view", "dashboard.view"),
};

export const can = (role: Role, p: Permission) => MATRIX[role].has(p);
export const isStaff = (role: Role) => role !== "customer_approver" && role !== "platform_admin";
export const permissionsOf = (role: Role) => [...MATRIX[role]];
