#!/usr/bin/env tsx
/**
 * hide-catastro-noise.ts — hides LIVE cases whose Catastro "signal" is clearly
 * noise: the fire box was already mostly urban AND the post-fire "modifications"
 * are dominated by a single-year bulk cadastral re-versioning (not parcel-by-
 * parcel rezoning). These are false alarms (coastal towns / city edges) that
 * undermine credibility.
 *
 * Criteria (conservative — only the clearest):  urbanFrac > 0.70  AND  spikeShare > 0.60
 * Never hides "Sentencia firme" (proven) cases.
 * Writes the hidden slug list to scripts/data/hidden-catastro-noise.txt so it's
 * trivially reversible (set hidden:false on those slugs).
 *
 *   npx tsx scripts/hide-catastro-noise.ts [--dry-run]
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

const DRY = process.argv.includes("--dry-run");

const URBAN_FRAC_MAX = 0.70;
const SPIKE_SHARE_MAX = 0.60;

interface Parcel { modifiedYear: number | null; classification: string; }

function fireYearFromSlug(slug: string): number | null {
  const m = slug.match(/-(\d{8,})$/);
  if (m) { const y = parseInt(m[1].slice(0, 4), 10); if (y >= 1960 && y <= 2030) return y; }
  return null;
}

function noiseMetrics(parcels: Parcel[], fy: number) {
  const total = parcels.length;
  const urbano = parcels.filter((p) => p.classification === "urbano");
  const urbanFrac = total ? urbano.length / total : 0;
  const win = urbano.filter((p) => p.modifiedYear != null && p.modifiedYear - fy >= 1 && p.modifiedYear - fy <= 15);
  const yc: Record<number, number> = {};
  for (const p of win) yc[p.modifiedYear!] = (yc[p.modifiedYear!] || 0) + 1;
  const counts = Object.values(yc);
  const maxYearCount = counts.length ? Math.max(...counts) : 0;
  const spikeShare = win.length ? maxYearCount / win.length : 0;
  return { urbanFrac, spikeShare, winUrban: win.length };
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset) { console.error("Missing Sanity env"); process.exit(1); }
  if (!DRY && !token) { console.error("Missing SANITY_WRITE_TOKEN. Use --dry-run."); process.exit(1); }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", token, useCdn: false });

  const live = await client.fetch<any[]>(`*[_type=="case" && hidden != true]{ _id, "slug": slug.current, status }`);
  const cache: Record<string, { parcels: Parcel[] }> = JSON.parse(readFileSync(path.join(process.cwd(), "scripts/data/catastro-cache.json"), "utf-8"));

  const toHide: { id: string; slug: string; urbanFrac: number; spikeShare: number }[] = [];
  for (const c of live) {
    if (c.status === "Sentencia firme") continue; // never hide proven cases
    const entry = cache[c.slug];
    const fy = fireYearFromSlug(c.slug);
    if (!entry || fy == null) continue;
    const m = noiseMetrics(entry.parcels || [], fy);
    if (m.winUrban > 0 && m.urbanFrac > URBAN_FRAC_MAX && m.spikeShare > SPIKE_SHARE_MAX) {
      toHide.push({ id: c._id, slug: c.slug, urbanFrac: m.urbanFrac, spikeShare: m.spikeShare });
    }
  }

  toHide.sort((a, b) => b.spikeShare - a.spikeShare);
  console.log(`\n${DRY ? "[dry-run] " : ""}Live cases flagged as Catastro noise (urb%>70 AND spike%>60): ${toHide.length}\n`);
  for (const c of toHide) console.log(`  urb ${(c.urbanFrac * 100).toFixed(0)}%  spike ${(c.spikeShare * 100).toFixed(0)}%  ${c.slug}`);

  if (DRY) { console.log("\n[dry-run] no writes."); return; }

  let tx = client.transaction();
  for (const c of toHide) tx = tx.patch(c.id, (p) => p.set({ hidden: true }));
  await tx.commit({ visibility: "async" });
  writeFileSync(path.join(process.cwd(), "scripts/data/hidden-catastro-noise.txt"), toHide.map((c) => c.slug).join("\n") + "\n");
  console.log(`\nHid ${toHide.length} cases. Slugs written to scripts/data/hidden-catastro-noise.txt (set hidden:false to reverse).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
