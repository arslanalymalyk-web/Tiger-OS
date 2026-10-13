import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ar } from "@/i18n/ar";
import { en } from "@/i18n/en";
import { dirOf, fmtDateTime, fmtDuration, tr } from "@/i18n";

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("Arabic and English define the same keys with the same placeholders", () => {
  assert.deepEqual(Object.keys(ar).sort(), Object.keys(en).sort());
  for (const k of Object.keys(en) as (keyof typeof en)[]) assert.equal(params(ar[k]), params(en[k]), `placeholders differ for ${k}`);
});

test("no Arabic string is empty or left in English by accident", () => {
  for (const [k, v] of Object.entries(ar)) {
    assert.ok(v.trim().length > 0, k);
    if (/^(status|priority|action|role|err|dash|approval)\./.test(k)) assert.ok(/[؀-ۿ]/.test(v), `${k} has no Arabic text`);
  }
});

function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(f)) out.push(p); }
  return out;
}
test("every literal translation key used in the platform code exists", () => {
  const files = [...walk("src/app/(platform)"), ...walk("src/server"), ...walk("src/components/platform")];
  const used = new Set<string>();
  for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/\b(?:t|tr)\((?:locale,\s*)?["'`]([a-z_]+\.[a-z_.]+)["'`]/g)) used.add(m[1]);
  const missing = [...used].filter((k) => !(k in en));
  assert.deepEqual(missing, []);
});

test("RTL direction, Arabic digits and Gregorian calendar", () => {
  assert.equal(dirOf("ar"), "rtl"); assert.equal(dirOf("en"), "ltr");
  const s = fmtDateTime("2026-03-05T10:00:00Z", "ar");
  assert.match(s, /[٠-٩]/); // Arabic-Indic digits
  assert.doesNotMatch(s, /١٤٤/); // not a Hijri year
  assert.equal(tr("ar", "notif.assigned", { number: 7, title: "x" }).includes("7"), true);
  assert.match(fmtDuration(26 * 3600_000, "ar"), /[٠-٩]/);
});
