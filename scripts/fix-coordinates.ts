#!/usr/bin/env tsx
/**
 * fix-coordinates.ts — re-geocodes the cases with confirmed-wrong coordinates
 * (audit-coords-distance.ts) to their correct municipality, updates Sanity, and
 * deletes their stale catastro-cache entry so `enrich:catastro` re-queries the
 * right location.
 *
 * Root causes (see diag-egif-coords.ts): Canarias rows had no UTM (bad geocode
 * fallback → wrong island/mainland); the 2005 Ourense cluster shared one UTM
 * point across many municipalities. Either way municipality-centroid geocoding
 * is the reliable fix.
 *
 * After this:  enrich:catastro (re-query) → patch:catastro --slug → patch:catastro-signal → build:triage
 *
 *   npx tsx scripts/fix-coordinates.ts [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { createClient } from "@sanity/client";

function loadEnvLocal() {
  try {
    const contents = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
    for (const line of contents.split("\n")) {
      const t = line.trim(); if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("="); if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  } catch { /* none */ }
}
loadEnvLocal();

const DRY = process.argv.includes("--dry-run");
const UA = "antestodoestoeracampo.es/coord-fix (data@antestodoestoeracampo.es)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// slug → geocode query (string) OR explicit verified centroid ({lat,lng}) for
// the ones Nominatim can't place reliably (Canarias islands, ambiguous parishes).
type Hint = string | { lat: number; lng: number };
const HINTS: Record<string, Hint> = {
  "paso-el-1998-1998380039": { lat: 28.6586, lng: -17.7797 },   // El Paso, La Palma
  "frontera-2003-2003380026": { lat: 27.7559, lng: -18.0085 },  // Frontera, El Hierro (El Golfo)
  "cotobade-2005-2005363510": { lat: 42.4889, lng: -8.4344 },   // Cotobade, Pontevedra (Carballedo)
  "veiga-a-1998-1998323245": "A Veiga, Ourense, Galicia, España",
  "vilardevos-2005-2005322927": "Vilardevós, Ourense, Galicia, España",
  "vilardevos-2005-2005323144": "Vilardevós, Ourense, Galicia, España",
  "avion-2005-2005323138": "Avión, Ourense, Galicia, España",
  "entrimo-2005-2005323140": "Entrimo, Ourense, Galicia, España",
  "melon-2005-2005323468": "Melón, Ourense, Galicia, España",
  "irixo-o-2005-2005323785": "O Irixo, Ourense, Galicia, España",
  "calvos-de-randin-2005-2005323463": "Calvos de Randín, Ourense, Galicia, España",
  "xinzo-de-limia-2005-2005322969": "Xinzo de Limia, Ourense, Galicia, España",
  "gudina-a-2005-2005323099": "A Gudiña, Ourense, Galicia, España",
};

async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=es`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const j = await res.json();
    return j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
  } catch { return null; }
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset) { console.error("Missing Sanity env"); process.exit(1); }
  if (!DRY && !token) { console.error("Missing SANITY_WRITE_TOKEN. Use --dry-run."); process.exit(1); }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", token, useCdn: false });

  const slugs = Object.keys(HINTS);
  const docs = await client.fetch<any[]>(
    `*[_type=="case" && slug.current in $slugs]{ _id, "slug": slug.current, title, coordinates }`, { slugs }
  );
  const byslug = new Map(docs.map((d) => [d.slug, d]));

  const CACHE = "scripts/data/catastro-cache.json";
  const cache: Record<string, unknown> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf-8")) : {};
  let fixed = 0, clearedCache = 0;

  for (const slug of slugs) {
    const d = byslug.get(slug);
    if (!d) { console.log(`  ? not found: ${slug}`); continue; }
    const hint = HINTS[slug];
    let g: { lat: number; lng: number } | null;
    if (typeof hint === "string") { g = await geocode(hint); await sleep(1100); }
    else g = hint; // explicit verified centroid
    if (!g) { console.log(`  ✗ geocode failed: ${slug} (${hint})`); continue; }
    const old = d.coordinates ? `${d.coordinates.lat.toFixed(4)},${d.coordinates.lng.toFixed(4)}` : "—";
    console.log(`  ${DRY ? "[dry] " : ""}${slug}: ${old} → ${g.lat.toFixed(4)},${g.lng.toFixed(4)}`);
    if (!DRY) {
      await client.patch(d._id).set({ coordinates: { lat: g.lat, lng: g.lng } }).commit();
      if (cache[slug]) { delete cache[slug]; clearedCache++; }
    }
    fixed++;
  }

  if (!DRY) { writeFileSync(CACHE, JSON.stringify(cache, null, 2), "utf-8"); }
  console.log(`\n${DRY ? "[dry-run] " : ""}${fixed} coordinates ${DRY ? "would be " : ""}fixed · ${clearedCache} cache entries cleared (re-query with enrich:catastro)`);
  if (!DRY) console.log(`\nNext:\n  npx tsx scripts/enrich-from-catastro.ts --min-ha=0\n  (then) patch:catastro per slug · patch:catastro-signal · build:triage`);
}
main().catch((e) => { console.error(e); process.exit(1); });
