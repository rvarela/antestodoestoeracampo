#!/usr/bin/env tsx
/**
 * patch-catastro-signal.ts — writes a de-noised `catastroSignal` to each case.
 *
 * Raw `urbanParcels` ranks already-urban coastal towns + single-year bulk
 * cadastral re-versionings on top (noise). This computes, from the raw parcel
 * cache, a trustworthy signal that rewards fires over a *rural* box whose urban
 * parcels appear *spread across* post-fire years:
 *
 *   signal = nonSpike * (1 - urbanFrac)
 *     nonSpike  = post-fire (1..15y) urban parcels minus the single dominant year
 *     urbanFrac = urbano / total parcels in the fire box
 *
 * Idempotent — re-running only re-sets the number. Matches the read-only
 * scripts/rank-catastro-signal.ts logic.
 *
 *   npx tsx scripts/patch-catastro-signal.ts [--dry-run] [--slug=X] [--limit=N]
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
const onlySlug = (process.argv.find((a) => a.startsWith("--slug=")) || "").split("=")[1] || null;
const limit = Number((process.argv.find((a) => a.startsWith("--limit=")) || "--limit=0").split("=")[1]) || 0;

interface Parcel { modifiedYear: number | null; classification: string; }
interface Entry { slug: string; parcels: Parcel[]; }

function fireYearFromSlug(slug: string): number | null {
  const m = slug.match(/-(\d{8,})$/);
  if (m) { const y = parseInt(m[1].slice(0, 4), 10); if (y >= 1960 && y <= 2030) return y; }
  return null;
}

function computeSignal(parcels: Parcel[], fy: number): number {
  const total = parcels.length;
  if (!total) return 0;
  const urbano = parcels.filter((p) => p.classification === "urbano");
  const urbanFrac = urbano.length / total;
  const win = urbano.filter((p) => p.modifiedYear != null && p.modifiedYear - fy >= 1 && p.modifiedYear - fy <= 15);
  const yearCounts: Record<number, number> = {};
  for (const p of win) yearCounts[p.modifiedYear!] = (yearCounts[p.modifiedYear!] || 0) + 1;
  const counts = Object.values(yearCounts);
  const maxYearCount = counts.length ? Math.max(...counts) : 0;
  const nonSpike = win.length - maxYearCount;
  return Math.max(0, Math.round(nonSpike * (1 - urbanFrac)));
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_WRITE_TOKEN || process.env.SANITY_API_TOKEN;
  if (!projectId || !dataset) { console.error("Missing Sanity env"); process.exit(1); }
  if (!DRY && !token) { console.error("Missing write token (SANITY_API_WRITE_TOKEN). Use --dry-run to preview."); process.exit(1); }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", token, useCdn: false });

  const cache: Record<string, Entry> = JSON.parse(readFileSync(path.join(process.cwd(), "scripts/data/catastro-cache.json"), "utf-8"));
  const docs = new Map<string, { _id: string; year?: number }>(); // slug -> doc
  for (const c of await client.fetch<any[]>(`*[_type=="case"]{ _id, "slug": slug.current, year }`)) docs.set(c.slug, c);

  let slugs = Object.keys(cache);
  if (onlySlug) slugs = slugs.filter((s) => s === onlySlug);
  if (limit) slugs = slugs.slice(0, limit);

  let patched = 0, skipped = 0;
  let tx = client.transaction();
  let pending = 0;
  for (const slug of slugs) {
    const doc = docs.get(slug);
    // Sanity's year field is authoritative; curated index slugs (-0000..-0009)
    // have no parseable EGIF ref, which used to skip them here
    const fy = doc?.year ?? fireYearFromSlug(slug);
    const id = doc?._id;
    if (fy == null || !id) { skipped++; continue; }
    const signal = computeSignal(cache[slug].parcels || [], fy);
    if (DRY) { if (patched < 25) console.log(`  ${String(signal).padStart(5)}  ${slug}`); patched++; continue; }
    tx = tx.patch(id, (p) => p.set({ catastroSignal: signal }));
    patched++; pending++;
    if (pending >= 100) { await tx.commit({ visibility: "async" }); tx = client.transaction(); pending = 0; process.stdout.write("."); }
  }
  if (!DRY && pending) await tx.commit({ visibility: "async" });

  console.log(`\n${DRY ? "[dry-run] " : ""}catastroSignal computed for ${patched} cases (${skipped} skipped: no fire year / not in Sanity)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
