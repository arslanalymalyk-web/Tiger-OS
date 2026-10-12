"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartData, ChartDef } from "@/lib/types";
import { fmtNum } from "@/data";
import { IdTag } from "./ui";

// Categorical palette validated with the dataviz validator (CVD ΔE ≥ 8, normal ΔE ≥ 15) and every slot has ≥ 4.5:1 contrast
// against the white chart surface (≥ 3:1 is required for graphics). Charts also keep legends, distinct markers and a table view.
export const SERIES_COLORS = ["#0e7c5f", "#a56a00", "#2f6db5", "#b8446f", "#6f56c0"];

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.999; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function Marker({ shape, x, y, color, size = 4.5 }: { shape: number; x: number; y: number; color: string; size?: number }) {
  const common = { fill: color, stroke: "#fff", strokeWidth: 1.5 };
  switch (shape % 5) {
    case 0: return <circle cx={x} cy={y} r={size} {...common} />;
    case 1: return <rect x={x - size} y={y - size} width={size * 2} height={size * 2} rx={1} {...common} />;
    case 2: return <path d={`M${x},${y - size - 1} L${x + size + 1},${y} L${x},${y + size + 1} L${x - size - 1},${y} Z`} {...common} />;
    case 3: return <path d={`M${x},${y - size - 1} L${x + size + 1},${y + size} L${x - size - 1},${y + size} Z`} {...common} />;
    default: return <path d={`M${x},${y + size + 1} L${x + size + 1},${y - size} L${x - size - 1},${y - size} Z`} {...common} />;
  }
}

function wrap(label: string, max: number): string[] {
  const words = label.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

interface PlotProps { def: ChartDef; data: ChartData; width: number; height: number }

function Plot({ def, data, width, height }: PlotProps) {
  const [hover, setHover] = useState<number | null>(null);
  const compact = width < 480;
  const all = data.series.flatMap((s) => s.values).concat(def.refLine ? [def.refLine.value] : []);
  const dataMax = Math.max(...all);
  const dataMin = Math.min(...all);
  const lo = def.kind === "bars" ? 0 : def.yMin ?? Math.min(0, dataMin);
  const ticks = niceTicks(lo, dataMax <= lo ? lo + 1 : dataMax);
  const tickChars = Math.max(...ticks.map((t) => fmtNum(t, t % 1 ? 1 : 0).length));
  // Direct end-labels only when every name fits; the legend always carries identity.
  const directLabels = def.kind === "line" && data.series.length <= 4 && !compact && data.series.every((s) => s.name.length <= 18);
  const n = data.categories.length;
  const bandW0 = (width - 70) / Math.max(1, n);
  const longestWord = Math.max(...data.categories.map((c) => Math.max(...c.split(" ").map((w) => w.length))));
  const rotate = def.kind === "bars" && longestWord * 6.4 > bandW0 - 4;
  const m = { l: Math.round(34 + tickChars * 6.4), r: directLabels ? 118 : 16, t: 14, b: rotate ? 92 : compact ? 70 : 62 };
  if (compact) m.l = Math.min(m.l, 52);
  const iw = Math.max(40, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const yMin = Math.min(lo, ticks[0]);
  const yMax = ticks[ticks.length - 1];
  const y = (v: number) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const bandW = iw / n;
  const x = (i: number) => m.l + (def.kind === "line" ? (n === 1 ? iw / 2 : (i / (n - 1)) * iw) : bandW * (i + 0.5));
  const d = def.decimals;

  // direct labels (≤4 series): spaced to avoid collisions
  let labelYs: number[] = [];
  if (directLabels) {
    const order = data.series.map((s, i) => ({ i, y: y(s.values[n - 1]) })).sort((a, b) => a.y - b.y);
    let prev = -Infinity;
    const placed: Record<number, number> = {};
    for (const o of order) { const yy = Math.max(o.y, prev + 13); placed[o.i] = yy; prev = yy; }
    labelYs = data.series.map((_, i) => placed[i]);
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (def.kind === "line") {
      const idx = n === 1 ? 0 : Math.round(((px - m.l) / iw) * (n - 1));
      setHover(Math.max(0, Math.min(n - 1, idx)));
    } else {
      const idx = Math.floor((px - m.l) / bandW);
      setHover(idx >= 0 && idx < n ? idx : null);
    }
  };
  const groupW = Math.min(bandW * 0.72, 22 * data.series.length + 8 * (data.series.length - 1));
  const barW = Math.max(6, Math.min(26, (groupW - 4 * (data.series.length - 1)) / data.series.length));

  return (
    <div className="relative" style={{ height }}>
      <svg width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
        aria-label={`${def.title}. ${def.kind === "line" ? "Line" : "Bar"} chart. X axis ${def.xLabel}; Y axis ${def.yLabel}. Use the table view for exact values.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={m.l + iw} y1={y(t)} y2={y(t)} stroke="#e3dccb" strokeWidth={1} strokeDasharray={t === yMin ? undefined : "2 3"} />
            <text x={m.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#5a6761">{fmtNum(t, t % 1 ? 1 : 0)}</text>
          </g>
        ))}
        <text transform={`translate(12 ${m.t + ih / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fontWeight={600} fill="#34453f">{def.yLabel}</text>
        <text x={m.l + iw / 2} y={height - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#34453f">{def.xLabel}</text>

        {data.categories.map((c, i) => {
          const cx = x(i);
          if (rotate) return <text key={c + i} transform={`translate(${cx + 4} ${m.t + ih + 12}) rotate(-35)`} textAnchor="end" fontSize={11} fill="#34453f">{c.length > 22 ? c.slice(0, 21) + "…" : c}</text>;
          const lines = wrap(c, Math.max(8, Math.floor((def.kind === "line" ? iw / Math.max(1, n - 1) : bandW) / 6.2)));
          return <text key={c + i} x={cx} y={m.t + ih + 16} textAnchor="middle" fontSize={11} fill="#34453f">{lines.map((l, k) => <tspan key={k} x={cx} dy={k === 0 ? 0 : 13}>{l}</tspan>)}</text>;
        })}

        {def.kind === "bars" && data.series.map((s, si) =>
          s.values.map((v, i) => {
            const gx = x(i) - ((barW + 4) * data.series.length - 4) / 2 + si * (barW + 4);
            const top = y(v);
            const h = Math.max(1, y(yMin) - top);
            return <path key={`${si}-${i}`} d={`M${gx},${y(yMin)} V${top + 3} Q${gx},${top} ${gx + 3},${top} H${gx + barW - 3} Q${gx + barW},${top} ${gx + barW},${top + 3} V${y(yMin)} Z`}
              fill={SERIES_COLORS[si]} opacity={hover === null || hover === i ? 1 : 0.55} data-h={h} />;
          }),
        )}
        {def.kind === "bars" && data.series.length === 1 && data.categories.length <= 6 && data.series[0].values.map((v, i) => (
          <text key={i} x={x(i)} y={y(v) - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0e2a23">{fmtNum(v, d)}</text>
        ))}

        {def.refLine && (
          <g>
            <line x1={m.l} x2={m.l + iw} y1={y(def.refLine.value)} y2={y(def.refLine.value)} stroke="#34453f" strokeWidth={1.25} strokeDasharray="5 4" />
          </g>
        )}

        {def.kind === "line" && (
          <>
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} stroke="#34453f" strokeWidth={1} strokeOpacity={0.4} />}
            {data.series.map((s, si) => (
              <g key={s.name}>
                <path d={s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")} fill="none" stroke={SERIES_COLORS[si]} strokeWidth={2} strokeLinejoin="round" />
                {s.values.map((v, i) => <Marker key={i} shape={si} x={x(i)} y={y(v)} color={SERIES_COLORS[si]} size={hover === i ? 5.5 : 4} />)}
                {labelYs[si] !== undefined && <text x={m.l + iw + 10} y={labelYs[si]} dominantBaseline="middle" fontSize={11} fontWeight={600} fill="#0e2a23">{s.name}</text>}
              </g>
            ))}
          </>
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-card"
          style={{ left: Math.min(Math.max(8, x(hover) + 12), Math.max(8, width - 190)), top: 8, minWidth: 150 }}>
          <div className="mb-1 font-semibold text-ink">{data.categories[hover]}</div>
          {data.series.map((s, si) => (
            <div key={s.name} className="flex items-center justify-between gap-3 text-ink-2">
              <span className="flex items-center gap-1.5"><svg width="10" height="10"><Marker shape={si} x={5} y={5} color={SERIES_COLORS[si]} size={3.5} /></svg>{s.name}</span>
              <span className="font-semibold tabular-nums text-ink">{fmtNum(s.values[hover], d)} {def.unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChartCard({ def, data }: { def: ChartDef; data: ChartData }) {
  const [ref, width] = useWidth();
  const [table, setTable] = useState(false);
  const height = width < 480 ? 280 : 300;
  return (
    <figure className="card flex min-w-0 flex-col p-4 sm:p-5">
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{def.title}</h3>
          <p className="text-xs text-muted">{def.subtitle} · unit: {def.unit}</p>
        </div>
        <div role="group" aria-label="Chart view" className="inline-flex overflow-hidden rounded-md border border-line text-xs font-medium">
          {(["Chart", "Table"] as const).map((v) => (
            <button key={v} onClick={() => setTable(v === "Table")} aria-pressed={(v === "Table") === table}
              className={`px-2.5 py-1 ${(v === "Table") === table ? "bg-em-800 text-white" : "bg-white text-ink-2 hover:bg-ivory-2"}`}>{v}</button>
          ))}
        </div>
      </figcaption>
      {(data.series.length > 1 || def.refLine) && !table && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
          {data.series.length > 1 && data.series.map((s, i) => (
            <li key={s.name} className="flex items-center gap-1.5"><svg width="12" height="12" aria-hidden><Marker shape={i} x={6} y={6} color={SERIES_COLORS[i]} size={4} /></svg>{s.name}</li>
          ))}
          {def.refLine && <li className="flex items-center gap-1.5"><svg width="20" height="12" aria-hidden><line x1="0" x2="20" y1="6" y2="6" stroke="#34453f" strokeWidth="1.5" strokeDasharray="5 3" /></svg>{def.refLine.label}</li>}
        </ul>
      )}
      <div ref={ref} className="min-w-0">
        {table ? (
          <div className="max-h-[300px] overflow-auto" tabIndex={0} role="region" aria-label={`${def.title} data table (scrollable)`}>
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-ivory-2 text-muted"><tr><th className="p-2 font-semibold">{def.xLabel}</th>{data.series.map((s) => <th key={s.name} className="p-2 text-right font-semibold">{s.name} ({def.unit})</th>)}</tr></thead>
              <tbody>
                {data.categories.map((c, i) => (
                  <tr key={c + i} className="border-t border-line-2"><td className="p-2">{c}</td>{data.series.map((s) => <td key={s.name} className="p-2 text-right tabular-nums">{fmtNum(s.values[i], def.decimals)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : width > 0 ? <Plot def={def} data={data} width={width} height={height} /> : <div style={{ height }} />}
      </div>
      <p className="mt-3 border-t border-line-2 pt-2 text-[11px] leading-relaxed text-muted">
        <span className="font-semibold">Computed from {data.sources.length} records:</span> {def.formula}{" "}
        <span className="inline-flex flex-wrap gap-1 align-middle"><IdTag id={def.id} /></span>
      </p>
    </figure>
  );
}
