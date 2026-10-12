"use client";

import { SECTORS, SECTOR_BY_ID, groupCapital, fmtNum, INSTITUTION, DATA_VERSION } from "@/data";
import { DemoTag, IdTag } from "./ui";

export function MethodologyView() {
  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Methodology and assumptions</p>
        <h1 className="mt-1 font-serif text-3xl sm:text-4xl">How the numbers are made</h1>
        <p className="mt-2 max-w-3xl text-[15px] text-ink-2">Every metric and chart is calculated at render time from typed seeded records. Nothing is typed into a dashboard by hand. <DemoTag className="ml-1 align-middle" /></p>
      </header>
      <section className="card space-y-2 p-5 text-sm text-ink-2">
        <h2 className="text-sm font-semibold text-ink">Group rules</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Data:</b> fictional institution “{INSTITUTION.name}”, seed <code>{DATA_VERSION}</code>, as of {INSTITUTION.asOf.replace("T", " ")} AST. Currency is SAR throughout; amounts are in SAR millions unless labelled bn.</li>
          <li><b>Additive amounts:</b> capital employed (per-sector definitions below) and new decision commitments. Group capital employed = SAR {fmtNum(groupCapital())} m = Σ of the eight sector totals.</li>
          <li><b>Non-additive indicators:</b> ratios, percentages, days, availability and concentration measures are never summed or averaged across sectors.</li>
          <li><b>No double counting:</b> the Sovereign Capital Office’s stakes in the seven Group entities are carried as a memo record equal to those entities’ capital. It is shown but excluded from Group totals. Cross-sector links are descriptive only.</li>
          <li><b>Decision amounts:</b> “commitment” is new outlay and is summed; “reallocation” moves existing capital and is shown separately; some decisions carry no amount in Stage 1.</li>
          <li><b>Scenario assumptions:</b> thresholds (“tolerances”) are illustrative demonstration values, not policy. No scenario engine exists in Stage 1.</li>
          <li><b>Evidence:</b> all evidence records are illustrative descriptions; no documents exist behind them.</li>
        </ul>
      </section>
      {SECTORS.map((s) => {
        const seed = SECTOR_BY_ID[s.id];
        return (
          <section key={s.id} className="card p-5" id={s.id}>
            <h2 className="font-serif text-xl">{s.name}</h2>
            <p className="text-xs text-muted">{s.entityName} · reporting period {s.reportingPeriod}</p>
            <p className="mt-2 text-sm text-ink-2"><b>Capital employed:</b> {s.capitalDefinition}</p>
            <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={`${s.name} metric definitions (scrollable)`}><table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-ivory-2 text-xs text-muted"><tr><th className="p-2 font-semibold">Metric</th><th className="p-2 font-semibold">Formula</th><th className="p-2 font-semibold">Unit · period</th><th className="p-2 font-semibold">Tolerance / assumptions</th></tr></thead>
              <tbody>{seed.metrics.map((m) => (
                <tr key={m.id} className="border-t border-line-2 align-top"><td className="p-2"><b>{m.name}</b><div><IdTag id={m.id} /></div><div className="text-[11px] text-muted">{m.additive ? "additive" : "non-additive"}</div></td>
                  <td className="p-2 text-xs text-ink-2">{m.formula}</td><td className="p-2 text-xs">{m.unit}<br />{m.period}</td><td className="p-2 text-xs text-ink-2">{m.thresholdNote}<br />{m.assumptions.join(" ")}</td></tr>
              ))}</tbody></table></div>
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-ink-2">{seed.charts.map((c) => <li key={c.id}><b>{c.title}</b> <IdTag id={c.id} /> — {c.formula}</li>)}</ul>
          </section>
        );
      })}
    </div>
  );
}
