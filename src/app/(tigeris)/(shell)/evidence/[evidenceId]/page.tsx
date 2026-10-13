import { EvidenceViewer } from "@/components/stage2/EvidenceViews";
import { EVIDENCE_LIST } from "@/lib/stage2/catalog";

export function generateStaticParams() {
  return EVIDENCE_LIST.map((e) => ({ evidenceId: e.id }));
}
export const dynamicParams = false;

export default async function Page({ params }: { params: Promise<{ evidenceId: string }> }) {
  const { evidenceId } = await params;
  return <EvidenceViewer evidenceId={evidenceId} />;
}
