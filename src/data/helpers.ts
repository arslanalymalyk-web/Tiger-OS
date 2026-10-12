import type { Entity, SectorId } from "@/lib/types";

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const attr = (e: Entity, k: string) => e.attrs[k] ?? 0;
export const sumAttr = (es: Entity[], k: string) => sum(es.map((e) => attr(e, k)));
export const byCat = (es: Entity[], cat: string) => es.filter((e) => e.category === cat);
export const ids = (es: Entity[]) => es.map((e) => e.id);
export const r1 = (n: number) => Math.round(n * 10) / 10;
export const fmt = (n: number, d = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export function makeEntity(
  code: string,
  sectorId: SectorId,
  n: number,
  name: string,
  category: string,
  description: string,
  attrs: Record<string, number>,
  extra: Partial<Pick<Entity, "series" | "dependsOn" | "excludeFromGroupTotal">> = {},
): Entity {
  return {
    id: `ENT-${code}-${String(n).padStart(2, "0")}`,
    sectorId,
    name,
    category,
    description,
    attrs,
    ...extra,
  };
}
