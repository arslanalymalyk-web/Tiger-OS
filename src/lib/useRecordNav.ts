"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { recordSector } from "@/data";
import { useDemo } from "@/state/DemoProvider";

/** Opens/closes the record drawer via the `?r=<RECORD-ID>` query parameter so records are linkable. */
export function useRecordNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { setSector } = useDemo();

  const openRecord = useCallback(
    (id: string) => {
      const sec = recordSector(id);
      if (sec) setSector(sec);
      // On a sector page, jump to the record's own sector so the dashboard behind the drawer matches.
      const base = pathname.startsWith("/sector/") && sec ? `/sector/${sec}` : pathname.startsWith("/entry") || pathname === "/" ? "/overview" : pathname;
      router.push(`${base}?r=${encodeURIComponent(id)}`, { scroll: false });
    },
    [pathname, router, setSector],
  );
  const closeRecord = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);
  return { openRecord, closeRecord };
}
