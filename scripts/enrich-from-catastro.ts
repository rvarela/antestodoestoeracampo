#!/usr/bin/env tsx
/**
 * enrich-from-catastro.ts
 *
 * For each seeded case with coordinates, queries the Catastro INSPIRE WFS
 * to find cadastral parcels near the fire location and detect rezoning activity.
 *
 * Detection logic:
 *   - Fire year X → any parcel in the area modified in cadastre between X+1 and X+15
 *   - RC format encodes classification: letter at position 5 = rústico, digit = urbano
 *   - Urban parcels appearing after a forest fire = rezoning signal
 *
 * Outputs:
 *   scripts/data/catastro-cache.json  — raw API results per case (resume-safe)
 *   scripts/data/catastro-flags.csv   — flagged cases for editorial review
 *
 * Usage:
 *   npx tsx scripts/enrich-from-catastro.ts --dry-run          # preview, no requests
 *   npx tsx scripts/enrich-from-catastro.ts --min-ha=500       # only largest fires (default: 200)
 *   npx tsx scripts/enrich-from-catastro.ts --slug=benidorm-1992-0000  # single case
 *   npx tsx scripts/enrich-from-catastro.ts --limit=50         # batch by batch
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface CaseRecord {
  _id: string;
  slug: string;
  title: string;
  year: number;
  hectares: number;
  coordinates: { lat: number; lng: number };
}

interface Parcel {
  rc: string;
  areaM2: number;
  modifiedYear: number | null;
  classification: "urbano" | "rustico" | "unknown";
}

interface CatastroResult {
  slug: string;
  parcels: Parcel[];
  suspiciousParcels: Parcel[]; // modified 1–15 years after fire
  queriedAt: string;
}

// ── Catastro helpers ──────────────────────────────────────────────────────────

/**
 * Decode RC classification from the reference code.
 * Urban RC: digits only in positions 0–4 (municipality) followed by digits (sheet grid)
 * Rústico RC: positions 5+ start with a letter (polygon identifier A, B, C...)
 */
function classifyRC(rc: string): "urbano" | "rustico" | "unknown" {
  if (!rc || rc.length < 6) return "unknown";
  // Position 5 (0-indexed): letter = rústico, digit = urban
  return /[A-Z]/i.test(rc[5]) ? "rustico" : "urbano";
}

/** Parse year from ISO date string */
function parseYear(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{4})/);
  return m ? parseInt(m[1]) : null;
}

/** Query INSPIRE WFS for parcels within a bounding box around coordinates */
async function queryParcels(
  lat: number,
  lng: number,
  radiusDeg = 0.02 // ~2km radius
): Promise<Parcel[]> {
  const bbox = [
    lat - radiusDeg,
    lng - radiusDeg,
    lat + radiusDeg,
    lng + radiusDeg,
  ].join(",");

  const url = `https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=CP:CadastralParcel&SRSNAME=EPSG:4326&BBOX=${bbox},urn:ogc:def:crs:EPSG::4326`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "antestodoestoeracampo.es/research (data@antestodoestoeracampo.es)" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) throw new Error(`WFS error ${res.status}`);
  const xml = await res.text();

  if (xml.includes("ExceptionReport") || xml.includes("No records founded")) {
    return [];
  }

  // Parse parcels from XML
  const parcels: Parcel[] = [];
  const memberRegex = /<member>([\s\S]*?)<\/member>/g;
  let match;

  while ((match = memberRegex.exec(xml)) !== null) {
    const member = match[1];

    const rcMatch = member.match(/<cp:nationalCadastralReference>(.*?)<\/cp:nationalCadastralReference>/);
    const areaMatch = member.match(/<cp:areaValue[^>]*>([\d.]+)<\/cp:areaValue>/);
    const dateMatch = member.match(/<cp:beginLifespanVersion>([\d\-T:]+)<\/cp:beginLifespanVersion>/);

    if (!rcMatch) continue;

    const rc = rcMatch[1].trim();
    const areaM2 = areaMatch ? parseFloat(areaMatch[1]) : 0;
    const modifiedYear = dateMatch ? parseYear(dateMatch[1]) : null;

    parcels.push({
      rc,
      areaM2,
      modifiedYear,
      classification: classifyRC(rc),
    });
  }

  return parcels;
}

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

  const dryRun     = args["dry-run"] === "true";
  const minHa      = parseFloat(args["min-ha"] ?? "200");
  const slugFilter = args["slug"] ?? null;
  const limit      = args.limit ? parseInt(args.limit) : Infinity;

  const CACHE_PATH = "scripts/data/catastro-cache.json";
  const FLAGS_PATH = "scripts/data/catastro-flags.csv";

  const cache: Record<string, CatastroResult> = existsSync(CACHE_PATH)
    ? JSON.parse(readFileSync(CACHE_PATH, "utf-8"))
    : {};

  console.log(`\nCatastro enrichment — fire→rezoning detection`);
  console.log(`  Min hectares: ${minHa}`);
  if (slugFilter) console.log(`  Slug filter:  ${slugFilter}`);
  if (Object.keys(cache).length) console.log(`  Cache loaded: ${Object.keys(cache).length} cases`);

  // ── Fetch cases from Sanity ───────────────────────────────────────────────

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset   = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");

  if (!projectId || !dataset) {
    console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID or NEXT_PUBLIC_SANITY_DATASET");
    process.exit(1);
  }

  const client = createClient({ projectId, dataset, apiVersion: "2024-01-01", useCdn: false });

  const query = `*[_type == "case" && defined(coordinates) && hectares >= ${minHa}${slugFilter ? ` && slug.current == "${slugFilter}"` : ""}] | order(hectares desc) {
    _id,
    "slug": slug.current,
    title,
    year,
    hectares,
    coordinates,
  }`;

  const cases = await client.fetch<CaseRecord[]>(query);
  const toProcess = cases
    .filter(c => !(c.slug in cache))
    .slice(0, isFinite(limit) ? limit : cases.length);

  console.log(`\n  Cases with coords ≥${minHa}ha: ${cases.length}`);
  console.log(`  Already cached:               ${cases.length - toProcess.length}`);
  console.log(`  To query:                     ${toProcess.length}`);

  if (dryRun) {
    console.log("\n[DRY RUN] Would query Catastro for:");
    toProcess.slice(0, 10).forEach(c =>
      console.log(`  ${c.slug} — ${c.hectares}ha — ${c.year} — ${c.coordinates.lat.toFixed(4)},${c.coordinates.lng.toFixed(4)}`)
    );
    if (toProcess.length > 10) console.log(`  ... and ${toProcess.length - 10} more`);
    return;
  }

  if (toProcess.length === 0) {
    console.log("\nAll cases already cached. Writing flags report...");
  }

  // ── Query Catastro ────────────────────────────────────────────────────────

  let queried = 0, errors = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const c = toProcess[i];
    const label = `[${String(i + 1).padStart(3)}/${toProcess.length}] ${c.slug}`;

    try {
      const parcels = await queryParcels(c.coordinates.lat, c.coordinates.lng);

      const suspiciousParcels = parcels.filter(p => {
        if (!p.modifiedYear || !c.year) return false;
        const yearsAfterFire = p.modifiedYear - c.year;
        return yearsAfterFire >= 1 && yearsAfterFire <= 15;
      });

      cache[c.slug] = {
        slug: c.slug,
        parcels,
        suspiciousParcels,
        queriedAt: new Date().toISOString(),
      };

      const flag = suspiciousParcels.length > 0 ? " ⚑" : "";
      const urbanCount = suspiciousParcels.filter(p => p.classification === "urbano").length;
      console.log(`  ✓ ${label} — ${parcels.length} parcels, ${suspiciousParcels.length} suspicious${urbanCount ? ` (${urbanCount} urban)` : ""}${flag}`);
      queried++;
    } catch (err) {
      const msg = err instanceof Error
        ? (err.name === "AbortError" ? "timeout (12s)" : err.message)
        : String(err);
      console.error(`  ✗ ${label}: ${msg}`);
      errors++;
    }

    // Save cache every 20 entries
    if ((i + 1) % 20 === 0) {
      writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
    }

    await sleep(1500); // ~0.65 req/s — conservative to avoid WAF rate limits
  }

  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");

  // ── Write flags CSV ───────────────────────────────────────────────────────

  // Join cache with case metadata for the report
  const caseMap = new Map(cases.map(c => [c.slug, c]));

  const flaggedRows: string[] = [
    "slug,title,year,hectares,suspicious_parcel_count,urban_count,rustico_count,earliest_modification,latest_modification,fire_to_mod_years_min,fire_to_mod_years_max"
  ];

  let flaggedCount = 0;

  for (const [slug, result] of Object.entries(cache)) {
    if (!result.suspiciousParcels.length) continue;
    const c = caseMap.get(slug);
    if (!c) continue;

    const years = result.suspiciousParcels.map(p => p.modifiedYear).filter(Boolean) as number[];
    const urbanCount = result.suspiciousParcels.filter(p => p.classification === "urbano").length;
    const rusticoCount = result.suspiciousParcels.filter(p => p.classification === "rustico").length;
    const earliest = Math.min(...years);
    const latest = Math.max(...years);

    const row = [
      slug,
      `"${c.title}"`,
      c.year,
      c.hectares,
      result.suspiciousParcels.length,
      urbanCount,
      rusticoCount,
      earliest,
      latest,
      earliest - c.year,
      latest - c.year,
    ].join(",");

    flaggedRows.push(row);
    flaggedCount++;
  }

  // Sort by urban count desc, then suspicious count desc
  const header = flaggedRows[0];
  const sorted = flaggedRows.slice(1).sort((a, b) => {
    const aU = parseInt(a.split(",")[5]);
    const bU = parseInt(b.split(",")[5]);
    if (bU !== aU) return bU - aU;
    return parseInt(b.split(",")[4]) - parseInt(a.split(",")[4]);
  });

  writeFileSync(FLAGS_PATH, [header, ...sorted].join("\n"), "utf-8");

  console.log(`\n── Summary ─────────────────────────────────────────`);
  console.log(`   Queried:  ${queried}`);
  if (errors)  console.log(`   Errors:   ${errors}`);
  console.log(`   Flagged:  ${flaggedCount} cases with suspicious cadastral activity`);
  console.log(`\n   Cache: ${CACHE_PATH}`);
  console.log(`   Flags: ${FLAGS_PATH}  ← open this in Sheets\n`);
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
