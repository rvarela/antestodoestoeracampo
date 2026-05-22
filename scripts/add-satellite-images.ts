#!/usr/bin/env tsx
/**
 * add-satellite-images.ts
 *
 * For each case with coordinates and no coverImage, fetches a satellite image
 * from the Mapbox Static Images API and uploads it to Sanity as the coverImage.
 *
 * Image style: satellite-v9 (clean, no labels) with a burnt-sienna pin marker.
 * Zoom level scales logarithmically with hectares burned.
 *
 * Usage:
 *   npx tsx scripts/add-satellite-images.ts --dry-run
 *   npx tsx scripts/add-satellite-images.ts --limit=50
 *   npx tsx scripts/add-satellite-images.ts --slug=mijas-2022-2022290065
 *   npx tsx scripts/add-satellite-images.ts --overwrite   # replace existing images too
 */

import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@sanity/client";

// ── Load .env.local ───────────────────────────────────────────────────────────

function loadEnvLocal() {
  try {
    const contents = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* no .env.local */ }
}

loadEnvLocal();

// ── Zoom level from hectares ──────────────────────────────────────────────────

function zoomForHectares(ha: number): number {
  // Log scale: 100ha → zoom 13, 200000ha → zoom 8
  const t = Math.max(0, Math.min(1,
    (Math.log(Math.max(1, ha)) - Math.log(100)) / (Math.log(200000) - Math.log(100))
  ));
  return Math.round(13 - t * 5); // zoom 13 → 8
}

// ── Mapbox Static Image URL ───────────────────────────────────────────────────

function staticImageUrl(
  lat: number,
  lng: number,
  hectares: number,
  token: string
): string {
  const zoom = zoomForHectares(hectares);
  // Pin marker: large, burnt-sienna colour (C4622D), no label
  const marker = `pin-l+C4622D(${lng},${lat})`;
  // Satellite style — clean, no labels
  const style = "mapbox/satellite-v9";
  const size = "1200x630";
  return `https://api.mapbox.com/styles/v1/${style}/static/${marker}/${lng},${lat},${zoom}/${size}?access_token=${token}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith("--"))
      .map(a => {
        const [k, ...v] = a.slice(2).split("=");
        return [k, v.length ? v.join("=") : "true"];
      })
  );

  const dryRun    = args["dry-run"] === "true";
  const overwrite = args["overwrite"] === "true";
  const slugFilter = args["slug"] ?? null;
  const limit     = args["limit"] ? parseInt(args["limit"]) : Infinity;

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const projectId   = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset     = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token       = process.env.SANITY_WRITE_TOKEN;

  if (!mapboxToken) { console.error("Missing NEXT_PUBLIC_MAPBOX_TOKEN"); process.exit(1); }
  if (!projectId || !dataset) { console.error("Missing Sanity env vars"); process.exit(1); }
  if (!token && !dryRun) { console.error("Missing SANITY_WRITE_TOKEN — use --dry-run to preview"); process.exit(1); }

  const client = createClient({
    projectId, dataset, token: token ?? "",
    apiVersion: "2026-05-19",
    useCdn: false,
  });

  // Fetch cases
  const filter = [
    `_type == "case"`,
    `defined(coordinates)`,
    !overwrite ? `!defined(coverImage)` : null,
    slugFilter ? `slug.current == "${slugFilter}"` : null,
  ].filter(Boolean).join(" && ");

  const docs = await client.fetch<Array<{
    _id: string;
    slug: string;
    title: string;
    year: number;
    hectares: number;
    region: string;
    coordinates: { lat: number; lng: number };
    coverImage?: unknown;
  }>>(`*[${filter}] | order(hectares desc) { _id, "slug": slug.current, title, year, hectares, region, coordinates, coverImage }`);

  const candidates = docs.slice(0, isFinite(limit) ? limit : docs.length);

  console.log(`\nSatellite images → Sanity`);
  console.log(`  Candidates: ${candidates.length}${overwrite ? " (including those with existing images)" : " (no coverImage)"}`);
  if (dryRun) console.log(`  Mode: DRY RUN`);
  console.log();

  if (candidates.length === 0) {
    console.log("  Nothing to do — all cases already have cover images.");
    console.log("  Use --overwrite to replace existing images.");
    return;
  }

  let ok = 0, failed = 0;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const label = `[${String(i + 1).padStart(4)}/${candidates.length}] ${c.slug}`;
    const zoom = zoomForHectares(c.hectares);
    const url = staticImageUrl(c.coordinates.lat, c.coordinates.lng, c.hectares, mapboxToken);

    if (dryRun) {
      console.log(`  [preview] ${c.slug}`);
      console.log(`    ${c.title} — ${c.hectares}ha — zoom ${zoom}`);
      console.log(`    ${url.replace(mapboxToken, "TOKEN")}`);
      ok++;
      continue;
    }

    try {
      // Fetch satellite image as buffer
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Mapbox ${res.status}: ${res.statusText}`);
      const buffer = Buffer.from(await res.arrayBuffer());

      // Upload to Sanity asset store
      const filename = `satellite-${c.slug}-${c.year}.jpg`;
      const asset = await client.assets.upload("image", buffer, {
        filename,
        contentType: "image/jpeg",
      });

      // Patch the case document
      await client.patch(c._id).set({
        coverImage: {
          _type: "image",
          asset: { _type: "reference", _ref: asset._id },
          alt: `Vista satélite del área del incendio de ${c.title}`,
        },
      }).commit();

      console.log(`  ✓ ${label} — zoom ${zoom}, ${Math.round(buffer.length / 1024)}kb`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${label}: ${msg}`);
      failed++;
    }

    // Respectful rate limiting — ~3 req/s
    await sleep(350);
  }

  console.log(`\n── Summary ──────────────────────────────────────────`);
  console.log(`   Images added: ${ok}`);
  if (failed) console.log(`   Failed:       ${failed}`);
  if (!dryRun && ok > 0) {
    console.log(`\nSite updates within 60s.`);
    console.log(`Check: https://antes-rvarelas-projects.vercel.app\n`);
  }
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
