import { notFound } from "next/navigation";
import { CommandCentre } from "@/components/CommandCentre";
import { SECTOR_IDS, isSectorId } from "@/data";

export function generateStaticParams() {
  return SECTOR_IDS.map((sectorId) => ({ sectorId }));
}
export const dynamicParams = false;

export default async function SectorPage({ params }: PageProps<"/sector/[sectorId]">) {
  const { sectorId } = await params;
  if (!isSectorId(sectorId)) notFound();
  return <CommandCentre sectorId={sectorId} />;
}
