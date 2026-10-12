import type { Evidence, EvidenceBlock, EvidenceVersion, SectorId } from "@/lib/types";

export const p = (text: string): EvidenceBlock => ({ type: "p", text });
export const tbl = (caption: string, columns: string[], rows: (string | number)[][]): EvidenceBlock => ({ type: "table", caption, columns, rows });
export const ver = (version: number, sourceDate: string, changeNote: string, limitations: string[], blocks: EvidenceBlock[]): EvidenceVersion => ({ version, sourceDate, changeNote, limitations, blocks });

/** Build an evidence item with readable content. `asOf` is the source date of the newest version. */
export function ev(
  id: string, sectorId: SectorId,
  base: { title: string; kind: string; source: string; summary: string; entityIds: string[] },
  versions: EvidenceVersion[],
): Evidence {
  return { id, sectorId, ...base, asOf: versions[versions.length - 1].sourceDate, versions };
}

export interface EvidenceRef { ref: string; kind: "paragraph" | "row"; text: string }

/** Stable references for a version: paragraphs P1…Pn in reading order; table rows T<k>R<n> per table. */
export function evidenceRefs(v: EvidenceVersion): EvidenceRef[] {
  const out: EvidenceRef[] = [];
  let para = 0, tab = 0;
  for (const b of v.blocks) {
    if (b.type === "p") { para++; out.push({ ref: `P${para}`, kind: "paragraph", text: b.text }); }
    else {
      tab++;
      b.rows.forEach((r, i) => out.push({ ref: `T${tab}R${i + 1}`, kind: "row", text: b.columns.map((c, j) => `${c}: ${r[j]}`).join("; ") }));
    }
  }
  return out;
}
export const currentVersion = (e: Evidence): EvidenceVersion | undefined => e.versions?.[e.versions.length - 1];
export const versionOf = (e: Evidence, n: number): EvidenceVersion | undefined => e.versions?.find((v) => v.version === n);
