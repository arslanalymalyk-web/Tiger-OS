import { CaseWorkspace } from "@/components/stage2/CaseWorkspace";
import { SEED_CASES } from "@/lib/stage2/seed";

export function generateStaticParams() {
  return Object.keys(SEED_CASES).map((caseId) => ({ caseId }));
}
// Cases created in the browser have IDs unknown at build time; they render on demand and read from local state.
export const dynamicParams = true;

export default async function Page({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <CaseWorkspace caseId={caseId} />;
}
