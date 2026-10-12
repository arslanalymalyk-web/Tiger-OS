import { Suspense } from "react";
import { CasesView } from "@/components/stage2/CasesView";
import { Skeleton } from "@/components/stage2/common";

export const metadata = { title: "Intelligence cases — TIGERIS AI OS" };
export default function Page() {
  return <Suspense fallback={<Skeleton />}><CasesView /></Suspense>;
}
