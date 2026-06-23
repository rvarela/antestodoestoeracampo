#!/usr/bin/env tsx
/**
 * build-triage.ts — generates src/data/triage-thin.json: the LIVE cases whose
 * de-noised catastroSignal is thin (<20), each tagged into a review bucket, so
 * the /triage page can render them (the 313MB parcel cache isn't available at
 * runtime — this bakes the metrics into a small committed JSON).
 *
 * Buckets:
 *   A  next-tier noise   urbanFrac 0.5–0.7 AND spikeShare > 0.5 (just under the auto-hide cut)
 *   B  empty signal      winUrban < 30 (barely any post-fire urbanisation)
 *   C  legit modest      everything else (rural box, some spread-out development)
 *
 *   npx tsx scripts/build-triage.ts
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

const SIGNAL_MAX = 20;

interface Parcel { modifiedYear: number | null; classification: string; }

function fireYearFromSlug(slug: string): number | null {
  const m = slug.match(/-(\d{8,})$/);
  if (m) { const y = parseInt(m[1].slice(0, 4), 10); if (y >= 1960 && y <= 2030) return y; }
  return null;
}

function metrics(parcels: Parcel[], fy: number) {
  const total = parcels.length;
  const urbano = parcels.filter((p) => p.classification === "urbano");
  const urbanFrac = total ? urbano.length / total : 0;
  const win = urbano.filter((p) => p.modifiedYear != null && p.modifiedYear - fy >= 1 && p.modifiedYear - fy <= 15);
  const yc: Record<number, number> = {};
  for (const p of win) yc[p.modifiedYear!] = (yc[p.modifiedYear!] || 0) + 1;
  const counts = Object.values(yc);
  const maxYearCount = counts.length ? Math.max(...counts) : 0;
  const spikeShare = win.length ? maxYearCount / win.length : 0;
  const nonSpike = win.length - maxYearCount;
  const spreadYears = counts.filter((c) => c > 0).length;
  const signal = Math.max(0, Math.round(nonSpike * (1 - urbanFrac)));
  return { total, urbanFrac, winUrban: win.length, spikeShare, spreadYears, signal };
}

function bucket(m: ReturnType<typeof metrics>): "A" | "B" | "C" {
  if (m.urbanFrac > 0.5 && m.urbanFrac <= 0.7 && m.spikeShare > 0.5) return "A";
  if (m.winUrban < 30) return "B";
  return "C";
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  if (!projectId || !dataset) { console.error("Missing Sanity env"); process.exit(1); }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", useCdn: false });

  const live = await client.fetch<any[]>(`*[_type=="case" && hidden != true]{
    "slug": slug.current, title, region, year, hectares, status, catastroSignal, coordinates, urbanParcels
  }`);
  const cache: Record<string, { parcels: Parcel[] }> = JSON.parse(readFileSync(path.join(process.cwd(), "scripts/data/catastro-cache.json"), "utf-8"));

  const rows: any[] = [];
  for (const c of live) {
    if (c.status === "Sentencia firme") continue; // never up for triage
    const sig = c.catastroSignal ?? null;
    if (sig == null || sig >= SIGNAL_MAX) continue;
    const entry = cache[c.slug];
    const fy = fireYearFromSlug(c.slug);
    if (!entry || fy == null) continue;
    const m = metrics(entry.parcels || [], fy);
    rows.push({
      slug: c.slug, title: c.title, region: c.region, year: c.year,
      hectares: c.hectares ?? 0, lat: c.coordinates?.lat ?? null, lng: c.coordinates?.lng ?? null,
      urbanParcels: c.urbanParcels ?? m.winUrban,
      urbanPct: Math.round(m.urbanFrac * 100), spikePct: Math.round(m.spikeShare * 100),
      winUrban: m.winUrban, spreadYears: m.spreadYears, signal: m.signal, bucket: bucket(m),
    });
  }

  // A (most likely noise) first, then B, then C; within bucket, weakest first
  const order = { A: 0, B: 1, C: 2 } as const;
  rows.sort((a, b) => (order[a.bucket as "A"|"B"|"C"] - order[b.bucket as "A"|"B"|"C"]) || (a.signal - b.signal));

  const counts = { A: 0, B: 0, C: 0 } as Record<string, number>;
  for (const r of rows) counts[r.bucket]++;
  const outPath = path.join(process.cwd(), "src/data/triage-thin.json");
  writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), signalMax: SIGNAL_MAX, counts, cases: rows }, null, 2) + "\n");
  console.log(`Wrote ${rows.length} thin live cases → src/data/triage-thin.json`);
  console.log(`  A (next-tier noise): ${counts.A}   B (empty signal): ${counts.B}   C (legit modest): ${counts.C}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
