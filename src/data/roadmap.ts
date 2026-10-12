export interface StageInfo { stage: number; title: string; capabilities: string[]; summary: string; status: "delivered" | "next" | "planned" }
export const STAGES: StageInfo[] = [
  { stage: 1, title: "Shared foundation and eight command centres", status: "delivered", capabilities: ["Institutional demonstration entry and sector variants", "Eight sector command centres", "Detail drawers, search, notifications, roles (simulated)"], summary: "Delivered in this build. Seeded fictional data, no integrations." },
  { stage: 2, title: "Intelligence case management and evidence inspection", status: "planned", capabilities: ["Intelligence case management", "Evidence inspection"], summary: "Working case workspaces (notes, tasks, status changes) and inspection of the evidence behind each signal." },
  { stage: 3, title: "AI assistance grounded in evidence", status: "planned", capabilities: ["AI assistance grounded in evidence"], summary: "Assistant answers cite evidence records. Requires model credentials and a retrieval design; none exist in Stage 1." },
  { stage: 4, title: "Expert collaboration", status: "planned", capabilities: ["Expert collaboration"], summary: "Experts receive requests on flagged cases, comment and attach analysis." },
  { stage: 5, title: "Scenario calculations", status: "planned", capabilities: ["Scenario calculations"], summary: "Parameterised what-if calculations (e.g. hub outage, liquidity stress) with stated assumptions." },
  { stage: 6, title: "Delegated authority and approval workflows", status: "planned", capabilities: ["Delegated authority", "Approval workflows"], summary: "Authority matrices and recorded approvals for the decisions shown read-only today." },
  { stage: 7, title: "Simulated execution", status: "planned", capabilities: ["Simulated execution"], summary: "Approved decisions are executed against a simulation, not live systems." },
  { stage: 8, title: "Outcome tracking and institutional memory", status: "planned", capabilities: ["Outcome tracking", "Institutional memory"], summary: "Track decision outcomes and retain lessons." },
  { stage: 9, title: "Data integration and system assurance", status: "planned", capabilities: ["Data integration", "System assurance"], summary: "Connect real data sources, monitor integration health, and establish assurance. Not claimed in Stage 1." },
];
export const stageFor = (cap: string) => STAGES.find((s) => s.capabilities.some((c) => c.toLowerCase().includes(cap.toLowerCase())))?.stage;
