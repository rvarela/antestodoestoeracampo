#!/usr/bin/env tsx
/**
 * triage-decide.ts — read-only editorial triage of live thin-signal cases.
 * Joins Sanity live cases (signal < 20) with raw cache metrics and prints
 * per-case evidence + distribution stats, so hide/keep thresholds can be set
 * on data rather than the signal number alone.
 *
 *   npx tsx scripts/triage-decide.ts [--csv]
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { createClient } from "@sanity/client";

function loadEnvLocal() {
  try {
    const contents = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
    for (const line of contents.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* none */ }
}
loadEnvLocal();

const wantCsv = process.argv.includes("--csv");

interface Parcel { modifiedYear: number | null; classification: string; }

function metrics(parcels: Parcel[], fy: number) {
  const total = parcels.length;
  const urbano = parcels.filter((p) => p.classification === "urbano");
  const urbanFrac = total ? urbano.length / total : 0;
  const win = urbano.filter((p) => p.modifiedYear != null && p.modifiedYear - fy >= 1 && p.modifiedYear - fy <= 15);
  const yearCounts: Record<number, number> = {};
  for (const p of win) yearCounts[p.modifiedYear!] = (yearCounts[p.modifiedYear!] || 0) + 1;
  const counts = Object.values(yearCounts);
  const maxYearCount = counts.length ? Math.max(...counts) : 0;
  const nonSpike = win.length - maxYearCount;
  const spreadYears = counts.length;
  return { total, urbanFrac, winUrban: win.length, nonSpike, spreadYears };
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  if (!projectId || !dataset) { console.error("Missing Sanity env"); process.exit(1); }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", useCdn: false });

  const docs = await client.fetch<any[]>(
    `*[_type=="case" && hidden!=true && defined(catastroSignal) && catastroSignal < 20]{
      _id, "slug": slug.current, title, region, year, hectares, status, catastroSignal, urbanParcels,
      "nsources": count(sources), "njud": count(judicial), "nconn": count(connections)
    }`
  );

  const cache: Record<string, { parcels: Parcel[] }> = JSON.parse(
    readFileSync(path.join(process.cwd(), "scripts/data/catastro-cache.json"), "utf-8")
  );

  const rows: any[] = [];
  for (const d of docs) {
    const entry = cache[d.slug];
    const m = entry ? metrics(entry.parcels || [], d.year) : null;
    const curated = /-(000\d)$/.test(d.slug);
    const protectedBy = [
      d.status !== "En investigación" ? `status:${d.status}` : null,
      (d.njud ?? 0) > 0 ? "judicial" : null,
      (d.nconn ?? 0) > 0 ? "connections" : null,
      (d.nsources ?? 0) > 1 ? `sources:${d.nsources}` : null,
      curated ? "curated-slug" : null,
    ].filter(Boolean);
    rows.push({
      slug: d.slug, title: d.title, region: d.region, year: d.year, hectares: d.hectares,
      signal: d.catastroSignal, urbanParcels: d.urbanParcels ?? 0,
      winUrban: m?.winUrban ?? -1, nonSpike: m?.nonSpike ?? -1,
      spreadYears: m?.spreadYears ?? -1, urbanFrac: m ? +(m.urbanFrac).toFixed(3) : -1,
      inCache: !!entry, protected: protectedBy.join("+"),
    });
  }

  rows.sort((a, b) => a.signal - b.signal || a.nonSpike - b.nonSpike);

  // Distribution: how many cases at each (nonSpike band × spreadYears band)
  const band = (n: number) => (n <= 0 ? "0" : n <= 3 ? "1-3" : n <= 9 ? "4-9" : "10+");
  const dist: Record<string, number> = {};
  for (const r of rows) {
    const k = `nonSpike ${band(r.nonSpike)} × spread ${band(r.spreadYears)}`;
    dist[k] = (dist[k] || 0) + 1;
  }

  console.log(`Live thin cases (signal < 20): ${rows.length}`);
  console.log(`  not in cache: ${rows.filter((r) => !r.inCache).length}`);
  console.log(`  protected (status/judicial/connections/sources/curated): ${rows.filter((r) => r.protected).length}`);
  console.log(`\nEvidence distribution (post-fire urban parcels outside the dominant year × distinct years):`);
  for (const k of Object.keys(dist).sort()) console.log(`  ${k.padEnd(32)} ${dist[k]}`);

  console.log(`\nProtected cases:`);
  for (const r of rows.filter((r) => r.protected)) {
    console.log(`  ${String(r.signal).padStart(3)}  ${r.slug.padEnd(45)} ${r.protected}`);
  }

  if (wantCsv) {
    const cols = ["slug", "title", "region", "year", "hectares", "signal", "urbanParcels", "winUrban", "nonSpike", "spreadYears", "urbanFrac", "inCache", "protected"];
    const out = [cols.join(",")];
    for (const r of rows) out.push(cols.map((c) => (c === "title" ? `"${String(r[c]).replace(/"/g, '""')}"` : r[c])).join(","));
    writeFileSync(path.join(process.cwd(), "scripts/data/triage-decide.csv"), out.join("\n") + "\n");
    console.log(`\nWrote scripts/data/triage-decide.csv (${rows.length} rows)`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
