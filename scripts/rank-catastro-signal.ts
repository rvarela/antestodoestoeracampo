#!/usr/bin/env tsx
/**
 * rank-catastro-signal.ts — read-only. Builds a *trustworthy* Catastro signal
 * from the raw parcel cache, instead of sorting by raw urbanParcels (which is
 * dominated by already-urban coastal towns + single-year bulk re-versionings).
 *
 * Per case it computes:
 *   urbanFrac    urbano / total parcels in the fire box (high = already-built town = noise)
 *   winUrban     urbano parcels whose record-version year is 1..15y after the fire
 *   spikeShare   largest single-year share of winUrban (high = bulk migration, not rezoning)
 *   nonSpike     winUrban minus that dominant year (the part that isn't one bulk event)
 *   spreadYears  distinct post-fire years contributing urban parcels (more = organic)
 *   SIGNAL       nonSpike * (1 - urbanFrac)  — rewards rural boxes w/ spread-out development
 *
 *   npx tsx scripts/rank-catastro-signal.ts [--limit=25] [--csv]
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

const limit = Number((process.argv.find((a) => a.startsWith("--limit=")) || "--limit=25").split("=")[1]);
const wantCsv = process.argv.includes("--csv");

interface Parcel { rc: string; areaM2: number; modifiedYear: number | null; classification: string; }
interface Entry { slug: string; parcels: Parcel[]; }

// fire year = first 4 digits of the trailing EGIF ref in the slug
function fireYearFromSlug(slug: string): number | null {
  const m = slug.match(/-(\d{8,})$/);
  if (m) { const y = parseInt(m[1].slice(0, 4), 10); if (y >= 1960 && y <= 2030) return y; }
  const m2 = slug.match(/-(\d{4})-/g);
  if (m2 && m2.length) { const y = parseInt(m2[m2.length - 1].replace(/-/g, ""), 10); if (y >= 1960 && y <= 2030) return y; }
  return null;
}

function metrics(parcels: Parcel[], fy: number) {
  const total = parcels.length;
  const urbano = parcels.filter((p) => p.classification === "urbano");
  const urbanFrac = total ? urbano.length / total : 0;
  const win = urbano.filter((p) => p.modifiedYear != null && p.modifiedYear - fy >= 1 && p.modifiedYear - fy <= 15);
  const yearCounts: Record<number, number> = {};
  for (const p of win) yearCounts[p.modifiedYear!] = (yearCounts[p.modifiedYear!] || 0) + 1;
  const counts = Object.values(yearCounts);
  const maxYearCount = counts.length ? Math.max(...counts) : 0;
  const winUrban = win.length;
  const spikeShare = winUrban ? maxYearCount / winUrban : 0;
  const nonSpike = winUrban - maxYearCount;
  const spreadYears = counts.filter((c) => c > 0).length;
  const signal = Math.round(nonSpike * (1 - urbanFrac));
  return { total, urbanFrac, winUrban, spikeShare, nonSpike, spreadYears, signal };
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  if (!projectId || !dataset) { console.error("Missing Sanity env"); process.exit(1); }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", useCdn: false });

  const sanity = await client.fetch<any[]>(`*[_type=="case"]{ "slug": slug.current, title, region, hectares, hidden, urbanParcels }`);
  const meta = new Map(sanity.map((c) => [c.slug, c]));

  const cache: Record<string, Entry> = JSON.parse(readFileSync(path.join(process.cwd(), "scripts/data/catastro-cache.json"), "utf-8"));

  const rows: any[] = [];
  let noFy = 0;
  for (const slug of Object.keys(cache)) {
    const fy = fireYearFromSlug(slug);
    if (fy == null) { noFy++; continue; }
    const m = metrics(cache[slug].parcels || [], fy);
    const md = meta.get(slug);
    rows.push({ slug, fy, live: md ? md.hidden !== true : false, title: md?.title ?? slug, region: md?.region ?? "?", oldUrban: md?.urbanParcels ?? m.winUrban, ...m });
  }

  const live = rows.filter((r) => r.live);
  const bySignal = [...live].sort((a, b) => b.signal - a.signal);
  const byOld = [...live].sort((a, b) => b.oldUrban - a.oldUrban);

  const fmtRow = (r: any) =>
    `${String(r.signal).padStart(5)}  ${String(r.oldUrban).padStart(5)}  ${(r.urbanFrac * 100).toFixed(0).padStart(3)}%  ${(r.spikeShare * 100).toFixed(0).padStart(3)}%  ${String(r.spreadYears).padStart(2)}y  ${String(r.region).slice(0, 14).padEnd(14)}  ${r.slug}`;

  console.log(`\nCached: ${rows.length} cases (${noFy} skipped, no fire year) · live: ${live.length}\n`);
  console.log(`=== TOP ${limit} LIVE by NEW trustworthy SIGNAL ===`);
  console.log("SIGNAL  oldUrb  urb%  spk%  spread  region          slug");
  for (const r of bySignal.slice(0, limit)) console.log(fmtRow(r));

  console.log(`\n=== Where the OLD top-${limit} (by raw urbanParcels) land on the new signal ===`);
  console.log("SIGNAL  oldUrb  urb%  spk%  spread  region          slug");
  for (const r of byOld.slice(0, limit)) console.log(fmtRow(r));

  const noise = live.filter((r) => r.urbanFrac > 0.7 && r.spikeShare > 0.6);
  const weak = live.filter((r) => r.signal < 20);
  console.log(`\nLive cases flagged as likely NOISE (urb%>70 AND spike%>60): ${noise.length}/${live.length}`);
  console.log(`Live cases with SIGNAL < 20 (thin real signal): ${weak.length}/${live.length}`);

  if (wantCsv) {
    const out = ["slug,title,region,fire_year,live,old_urbanParcels,total_parcels,urban_frac,win_urban,spike_share,non_spike,spread_years,signal"];
    for (const r of [...rows].sort((a, b) => b.signal - a.signal)) {
      out.push([r.slug, `"${String(r.title).replace(/"/g, '""')}"`, r.region, r.fy, r.live, r.oldUrban, r.total, r.urbanFrac.toFixed(3), r.winUrban, r.spikeShare.toFixed(3), r.nonSpike, r.spreadYears, r.signal].join(","));
    }
    writeFileSync(path.join(process.cwd(), "scripts/data/catastro-signal.csv"), out.join("\n") + "\n");
    console.log(`\nWrote scripts/data/catastro-signal.csv (${rows.length} rows)`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
