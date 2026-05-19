#!/usr/bin/env tsx
/**
 * geocode-municipalities.ts
 *
 * Geocodes missing municipality coordinates using Nominatim (OpenStreetMap).
 * Reads all EGIF CSVs, finds (Municipio, Provincia) pairs that have no UTM coords,
 * queries Nominatim for each, and saves a lookup cache to:
 *   scripts/data/municipality-coords.json
 *
 * Usage:
 *   npx tsx scripts/geocode-municipalities.ts
 *   npx tsx scripts/geocode-municipalities.ts --dry-run   # just lists pairs, no requests
 *
 * Nominatim policy: 1 request/second max, identify with a contact email.
 * ~375 requests ≈ 6–7 minutes.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

const FILES = [
  "scripts/data/Xlsx_20260519_115316_1 1(Informe).csv",
  "scripts/data/Xlsx_20260519_115316_2 1(Informe).csv",
  "scripts/data/Xlsx_20260519_115316_3(Informe).csv",
  "scripts/data/Xlsx_20260519_115316_4(Informe).csv",
  "scripts/data/Xlsx_20260519_115316_5(Informe).csv",
];

const CACHE_PATH = path.join("scripts/data/municipality-coords.json");

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

/** Normalise EGIF municipality/province names for Nominatim queries */
function normalise(s: string): string {
  return s
    .trim()
    // Expand common abbreviations used in EGIF
    .replace(/^STA\.?\s+/i, "Santa ")
    .replace(/^SAN\s+/i, "San ")
    .replace(/^STO\.?\s+/i, "Santo ")
    // Trailing province codes like "A CORUÑA" → keep as-is
    .normalize("NFC"); // ensure composed unicode
}

/** Build Nominatim search query with fallback strategies */
function buildQuery(municipio: string, provincia: string): string {
  const m = normalise(municipio);
  const p = normalise(provincia);
  return encodeURIComponent(`${m}, ${p}, España`);
}

async function nominatim(municipio: string, provincia: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${buildQuery(municipio, provincia)}&format=json&limit=1&countrycodes=es`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "antestodoestoeracampo.es/geocoder (data@antestodoestoeracampo.es)",
        "Accept-Language": "es,en",
      },
    });
    if (!res.ok) return null;
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // Load existing cache
  const cache: Record<string, { lat: number; lng: number } | null> = existsSync(CACHE_PATH)
    ? JSON.parse(readFileSync(CACHE_PATH, "utf-8"))
    : {};

  const cachedCount = Object.keys(cache).length;
  if (cachedCount > 0) console.log(`\nLoaded ${cachedCount} cached entries from ${CACHE_PATH}`);

  // Collect unique (municipio, provincia) pairs missing real UTM coords
  const missing = new Map<string, { municipio: string; provincia: string }>();

  for (const f of FILES) {
    let raw: string;
    try {
      raw = readFileSync(f, "latin1").replace(/^\uFEFF/, "");
    } catch {
      console.warn(`  Skipping missing file: ${f}`);
      continue;
    }

    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];

    for (const row of rows) {
      const causa = (row["Causa"] ?? "").trim().toUpperCase();
      const ha = parseFloat((row["SuperficieTotalForestal"] ?? "0").replace(",", "."));
      if (!causa.includes("400") || ha < 100) continue;

      const x = parseFloat(row["CoordenadaX"] ?? "");
      const y = parseFloat(row["CoordenadaY"] ?? "");
      if (!isNaN(x) && !isNaN(y) && x > 100_000 && y > 100_000) continue;

      const municipio = (row["Municipio"] ?? "").trim();
      const provincia = (row["Provincia"] ?? "").trim();
      if (!municipio) continue;

      const key = `${municipio}||${provincia}`;
      if (!missing.has(key)) missing.set(key, { municipio, provincia });
    }
  }

  const toFetch = [...missing.entries()].filter(([key]) => !(key in cache));

  console.log(`\nTotal pairs needed:    ${missing.size}`);
  console.log(`Already cached:        ${missing.size - toFetch.length}`);
  console.log(`To fetch from Nominatim: ${toFetch.length}`);

  if (dryRun) {
    console.log("\n[DRY RUN] Pairs to geocode:");
    toFetch.forEach(([key]) => console.log("  " + key));
    return;
  }

  if (toFetch.length === 0) {
    console.log("\nAll pairs already cached. Nothing to do.");
    console.log(`Cache: ${CACHE_PATH}`);
    return;
  }

  console.log(`\nFetching ${toFetch.length} entries (1 req/s)...\n`);

  let found = 0, notFound = 0;

  for (let i = 0; i < toFetch.length; i++) {
    const [key, { municipio, provincia }] = toFetch[i];
    const result = await nominatim(municipio, provincia);

    if (result) {
      cache[key] = result;
      found++;
      process.stdout.write(`  ✓ [${String(i + 1).padStart(3)}/${toFetch.length}] ${key} → ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}\n`);
    } else {
      // Try fallback: just municipality name + Spain
      const fallbackUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalise(municipio) + ", España")}&format=json&limit=1&countrycodes=es`;
      try {
        await sleep(1100);
        const res = await fetch(fallbackUrl, {
          headers: { "User-Agent": "antestodoestoeracampo.es/geocoder (data@antestodoestoeracampo.es)" },
        });
        const data = await res.json() as Array<{ lat: string; lon: string }>;
        if (data.length) {
          const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
          cache[key] = coords;
          found++;
          process.stdout.write(`  ~ [${String(i + 1).padStart(3)}/${toFetch.length}] ${key} → ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} (fallback)\n`);
        } else {
          cache[key] = null; // mark as tried but not found
          notFound++;
          process.stdout.write(`  ✗ [${String(i + 1).padStart(3)}/${toFetch.length}] ${key} — not found\n`);
        }
      } catch {
        cache[key] = null;
        notFound++;
      }
    }

    // Save cache after every 10 entries so progress is not lost on interrupt
    if ((i + 1) % 10 === 0) {
      writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
    }

    await sleep(1100); // Nominatim: 1 req/s
  }

  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");

  console.log(`\n── Summary ─────────────────────────────────`);
  console.log(`   Found:     ${found}`);
  console.log(`   Not found: ${notFound}`);
  console.log(`   Cache saved to: ${CACHE_PATH}`);
  console.log(`\nRun seed-from-egif.ts — it will use this cache as a coordinate fallback.\n`);
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
