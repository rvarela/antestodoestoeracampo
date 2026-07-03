#!/usr/bin/env tsx
/**
 * patch-catastro-viz.ts — bakes per-case Catastro visualisation data from the
 * local parcel cache into Sanity, powering the case page's Catastro module:
 *
 *   catastroYears    — parcels modified per year (urbano/rústico) in the box
 *   catastroParcels  — up to 15 post-fire urban parcels OUTSIDE the dominant
 *                      modification year (bulk re-versionings are collapsed to
 *                      a summary line in the UI, mirroring catastroSignal)
 *   catastroBoxTotal / catastroBoxUrban — box composition for the stat chips
 *
 * Idempotent — re-running re-sets the fields. Fire year from Sanity `year`
 * (authoritative; slug regex misses curated slugs).
 *
 *   npx tsx scripts/patch-catastro-viz.ts [--dry-run] [--slug=X] [--limit=N]
 */
import { readFileSync } from "fs";
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

const DRY = process.argv.includes("--dry-run");
const onlySlug = (process.argv.find(a => a.startsWith("--slug=")) || "").split("=")[1] || null;
const limit = Number((process.argv.find(a => a.startsWith("--limit=")) || "--limit=0").split("=")[1]) || 0;

interface Parcel { rc: string; areaM2: number; modifiedYear: number | null; classification: string }
interface Entry { slug: string; parcels: Parcel[] }

function build(parcels: Parcel[], fireYear: number) {
  const years = new Map<number, { urbano: number; rustico: number }>();
  for (const p of parcels) {
    if (p.modifiedYear == null) continue;
    const y = years.get(p.modifiedYear) ?? { urbano: 0, rustico: 0 };
    if (p.classification === "urbano") y.urbano++;
    else y.rustico++;
    years.set(p.modifiedYear, y);
  }
  const catastroYears = [...years.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, c]) => ({ _key: `y${year}`, year, urbano: c.urbano, rustico: c.rustico }));

  // Post-fire (1..15y) urban parcels; dominant year = the bulk-artifact
  // candidate discounted by catastroSignal — excluded from the table.
  const windowed = parcels.filter(
    p => p.classification === "urbano" && p.modifiedYear != null &&
         p.modifiedYear - fireYear >= 1 && p.modifiedYear - fireYear <= 15
  );
  const counts = new Map<number, number>();
  for (const p of windowed) counts.set(p.modifiedYear!, (counts.get(p.modifiedYear!) ?? 0) + 1);
  let spikeYear: number | null = null;
  let spikeMax = 0;
  for (const [y, n] of counts) if (n > spikeMax) { spikeMax = n; spikeYear = y; }

  const catastroParcels = windowed
    .filter(p => p.modifiedYear !== spikeYear)
    .sort((a, b) => b.areaM2 - a.areaM2)
    .slice(0, 15)
    .map(p => ({ _key: p.rc, rc: p.rc, areaM2: p.areaM2, year: p.modifiedYear! }));

  const urbano = parcels.filter(p => p.classification === "urbano").length;
  return {
    catastroYears,
    catastroParcels,
    catastroBoxTotal: parcels.length,
    catastroBoxUrban: urbano,
  };
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset || (!token && !DRY)) {
    console.error("Missing Sanity env (or SANITY_WRITE_TOKEN for a live run)");
    process.exit(1);
  }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", token, useCdn: false });

  const cache: Record<string, Entry> = JSON.parse(
    readFileSync(path.join(process.cwd(), "scripts/data/catastro-cache.json"), "utf-8")
  );
  const docs = new Map<string, { _id: string; year?: number }>();
  for (const c of await client.fetch<Array<{ _id: string; slug: string; year?: number }>>(
    `*[_type == "case"]{ _id, "slug": slug.current, year }`
  )) docs.set(c.slug, c);

  let slugs = Object.keys(cache);
  if (onlySlug) slugs = slugs.filter(s => s === onlySlug);
  if (limit) slugs = slugs.slice(0, limit);

  let patched = 0, skipped = 0;
  let tx = client.transaction();
  let pending = 0;

  for (const slug of slugs) {
    const doc = docs.get(slug);
    if (!doc?.year || !doc._id) { skipped++; continue; }
    const data = build(cache[slug].parcels ?? [], doc.year);
    if (DRY) {
      if (patched < 10) {
        console.log(`  ${slug}: ${data.catastroYears.length} años · ${data.catastroParcels.length} parcelas señaladas · box ${data.catastroBoxUrban}/${data.catastroBoxTotal} urbano`);
      }
      patched++;
      continue;
    }
    tx = tx.patch(doc._id, p => p.set(data));
    patched++; pending++;
    if (pending >= 50) { await tx.commit({ visibility: "async" }); tx = client.transaction(); pending = 0; process.stdout.write("."); }
  }
  if (!DRY && pending) await tx.commit({ visibility: "async" });

  console.log(`\n${DRY ? "[dry-run] " : ""}catastro viz data written for ${patched} cases (${skipped} skipped: not in Sanity / no year)`);
}
main().catch(e => { console.error(e); process.exit(1); });
