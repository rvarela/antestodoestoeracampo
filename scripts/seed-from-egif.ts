#!/usr/bin/env tsx
/**
 * seed-from-egif.ts — Import EGIF fire incident data into Sanity as draft cases
 *
 * Usage:
 *   npm run seed:egif -- --file=scripts/data/egif-2020.csv
 *   npm run seed:egif -- --file=scripts/data/egif-2020.csv --min-ha=200 --dry-run
 *   npm run seed:egif -- --file=scripts/data/egif-2020.csv --limit=50 --dry-run
 *
 * Env vars required in .env.local:
 *   SANITY_WRITE_TOKEN          — Sanity API token with Editor/Write access
 *   NEXT_PUBLIC_SANITY_PROJECT_ID
 *   NEXT_PUBLIC_SANITY_DATASET
 *
 * Column mapping:
 *   Edit the COL object below if your CSV uses different header names.
 *   The defaults match the standard MITECO EGIF export format.
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import proj4 from "proj4";
import { createClient } from "@sanity/client";

// ── Load .env.local ──────────────────────────────────────────────────────────

function loadEnvLocal() {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const contents = readFileSync(envPath, "utf-8");
    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local not found — rely on shell env
  }
}

loadEnvLocal();

// ── Municipality coords cache (built by geocode-municipalities.ts) ────────────

const COORDS_CACHE_PATH = path.join("scripts/data/municipality-coords.json");
const municipalityCoords: Record<string, { lat: number; lng: number } | null> = existsSync(COORDS_CACHE_PATH)
  ? JSON.parse(readFileSync(COORDS_CACHE_PATH, "utf-8"))
  : {};

if (Object.keys(municipalityCoords).length > 0) {
  console.log(`Loaded ${Object.keys(municipalityCoords).length} geocoded municipalities from cache.`);
}

function fallbackCoords(municipio: string, provincia: string): { lat: number; lng: number } | undefined {
  const key = `${municipio}||${provincia}`;
  const result = municipalityCoords[key];
  return result ?? undefined;
}

// ── EGIF column mapping ──────────────────────────────────────────────────────
// Matches the actual EGIF web export (servicio.mapa.gob.es/incendios/Search/Publico)

const COL = {
  numeroParte: "NumeroParte",              // Unique fire reference — used as document ID
  campania:    "Campania",                 // Campaign year (e.g. 2020)
  comunidad:   "Comunidad",               // Comunidad Autónoma name
  provincia:   "Provincia",               // Province name
  municipio:   "Municipio",               // Municipality name
  detectado:   "Detectado",               // Fire detected date
  extinguido:  "Extinguido",              // Fire extinguished date
  hectareas:   "SuperficieTotalForestal", // Total forest area burned (ha)
  causa:       "Causa",                   // '[400] Intencionado' for intentional fires
  motivacion:  "Motivacion",              // Motivation detail
  coordX:      "CoordenadaX",             // UTM easting (metres)
  coordY:      "CoordenadaY",             // UTM northing (metres)
  huso:        "Huso",                    // UTM zone number (28–31)
  datum:       "Datum",                   // Coordinate datum (ETRS89 or ED50)
};

// Intentional cause values — EGIF web export uses '[400]  Intencionado' (two spaces)
const INTENTIONAL = new Set([
  "[400]  INTENCIONADO",
  "[400] INTENCIONADO",
  "INTENCIONADO",
  "INTENCIONAL",
  "3",
]);

// ── Comunidad Autónoma name normalisation ────────────────────────────────────
// Maps EGIF export values → schema REGIONS list values

const COMUNIDAD_MAP: Record<string, string> = {
  // EGIF web export abbreviations (actual values from the data)
  "ANDALUCIA":                  "Andalucía",
  "ARAGON":                     "Aragón",
  "ASTURIAS":                   "Asturias",
  "C. VALENCIANA":              "Comunidad Valenciana",
  "CANARIAS":                   "Canarias",
  "CANTABRIA":                  "Cantabria",
  "CASTILLA Y LEON":            "Castilla y León",
  "CASTILLA-MANCHA":            "Castilla-La Mancha",
  "CATALUÑA":                   "Cataluña",
  "EUSKADI":                    "País Vasco",
  "EXTREMADURA":                "Extremadura",
  "GALICIA":                    "Galicia",
  "ILLES BALEARS":              "Baleares",
  "LA RIOJA":                   "La Rioja",
  "MADRID":                     "Madrid",
  "MURCIA":                     "Murcia",
  // Extended variants (for other export formats)
  "ANDALUCÍA":                  "Andalucía",
  "ARAGÓN":                     "Aragón",
  "PRINCIPADO DE ASTURIAS":     "Asturias",
  "BALEARES":                   "Baleares",
  "ISLAS BALEARES":             "Baleares",
  "CASTILLA-LA MANCHA":         "Castilla-La Mancha",
  "CASTILLA - LA MANCHA":       "Castilla-La Mancha",
  "CASTILLA Y LEÓN":            "Castilla y León",
  "CATALUNYA":                  "Cataluña",
  "COMUNIDAD VALENCIANA":       "Comunidad Valenciana",
  "COMUNITAT VALENCIANA":       "Comunidad Valenciana",
  "COMUNIDAD DE MADRID":        "Madrid",
  "REGIÓN DE MURCIA":           "Murcia",
  "REGION DE MURCIA":           "Murcia",
  "NAVARRA":                    "Navarra",
  "COMUNIDAD FORAL DE NAVARRA": "Navarra",
  "PAÍS VASCO":                 "País Vasco",
  "PAIS VASCO":                 "País Vasco",
};

function normaliseRegion(raw: string): string {
  return COMUNIDAD_MAP[raw.trim().toUpperCase()] ?? raw.trim();
}

// ── Utilities ────────────────────────────────────────────────────────────────

function utmToWgs84(x: number, y: number, zone: number): { lat: number; lng: number } {
  const utm = `+proj=utm +zone=${zone} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
  const wgs = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs";
  const [lng, lat] = proj4(utm, wgs, [x, y]) as [number, number];
  return { lat, lng };
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseYear(dateStr: string): number {
  if (!dateStr) return 0;
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    return parseInt(parts.length === 3 ? parts[2] : parts[parts.length - 1]);
  }
  return parseInt(dateStr.slice(0, 4));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith("--"))
      .map(a => {
        const [key, ...rest] = a.slice(2).split("=");
        return [key, rest.length ? rest.join("=") : "true"];
      })
  );

  const csvFile = args.file;
  const minHa   = parseFloat(args["min-ha"] ?? "100");
  const dryRun  = args["dry-run"] === "true";
  const limit   = args.limit ? parseInt(args.limit) : Infinity;

  if (!csvFile) {
    console.error([
      "",
      "Usage:",
      "  npm run seed:egif -- --file=scripts/data/egif-2020.csv",
      "  npm run seed:egif -- --file=... --min-ha=200 --dry-run",
      "  npm run seed:egif -- --file=... --limit=50 --dry-run",
      "",
    ].join("\n"));
    process.exit(1);
  }

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset   = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token     = process.env.SANITY_WRITE_TOKEN;

  if (!projectId || !dataset) {
    console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID or NEXT_PUBLIC_SANITY_DATASET in .env.local");
    process.exit(1);
  }
  if (!token && !dryRun) {
    console.error([
      "",
      "Missing SANITY_WRITE_TOKEN in .env.local",
      "Get one at: https://sanity.io/manage → project → API → Tokens",
      "Then add:   SANITY_WRITE_TOKEN=sk...",
      "Or run with --dry-run to preview without writing.",
      "",
    ].join("\n"));
    process.exit(1);
  }

  const client = createClient({
    projectId,
    dataset,
    token: token ?? "",
    apiVersion: "2024-01-01",
    useCdn: false,
  });

  // ── Parse CSV ───────────────────────────────────────────────────────────────
  console.log(`\nReading: ${csvFile}`);
  let raw: string;
  try {
    raw = readFileSync(csvFile, "latin1").replace(/^\uFEFF/, ""); // latin1 = Windows-1252 (EGIF export encoding)
  } catch {
    console.error(`File not found: ${csvFile}`);
    process.exit(1);
  }

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  if (rows.length === 0) {
    console.error("CSV is empty or could not be parsed.");
    process.exit(1);
  }

  console.log(`  ${rows.length} total rows`);
  console.log(`  Columns: ${Object.keys(rows[0]).join(", ")}\n`);

  // ── Filter ──────────────────────────────────────────────────────────────────
  const parseHa = (val: string) => parseFloat((val ?? "0").replace(",", "."));

  const candidates = rows.filter(row => {
    const ha    = parseHa(row[COL.hectareas] ?? "0");
    const causa = String(row[COL.causa] ?? "").trim().toUpperCase();
    return ha >= minHa && INTENTIONAL.has(causa);
  });

  const batch = candidates.slice(0, isFinite(limit) ? limit : candidates.length);

  console.log(`  ${candidates.length} match (intentional + ≥${minHa}ha)`);
  if (isFinite(limit)) console.log(`  Processing first ${batch.length} (--limit=${limit})`);

  if (batch.length === 0) {
    console.log([
      "\nNo rows matched the filter.",
      `Check that '${COL.causa}' column exists and contains '[400] Intencionado'.`,
      `Check that '${COL.hectareas}' column contains numeric values ≥ ${minHa}.`,
      `\nYour CSV columns: ${Object.keys(rows[0]).join(", ")}`,
    ].join("\n"));
    process.exit(0);
  }

  // ── Build + write documents ─────────────────────────────────────────────────
  console.log(`\n${dryRun ? "[DRY RUN] " : ""}Writing to Sanity (${projectId}/${dataset})...\n`);

  let created = 0;
  let failed  = 0;

  for (let i = 0; i < batch.length; i++) {
    const row = batch[i];

    const numeroParte = (row[COL.numeroParte] ?? "").trim();
    const municipio   = (row[COL.municipio]   ?? "Desconocido").trim();
    const comunidad   = (row[COL.comunidad]   ?? "").trim();
    const provincia   = (row[COL.provincia]   ?? "").trim();
    const detectado   = (row[COL.detectado]   ?? "").trim();
    const extinguido  = (row[COL.extinguido]  ?? "").trim();
    const motivacion  = (row[COL.motivacion]  ?? "").trim();
    const hectareas   = parseHa(row[COL.hectareas] ?? "0");
    const year        = parseInt(row[COL.campania] ?? "0") || parseYear(detectado);
    const region      = normaliseRegion(comunidad);
    const safeId      = numeroParte ? slugify(numeroParte) : `${slugify(municipio)}-${year}-${String(i).padStart(4, "0")}`;
    const slug        = `${slugify(municipio)}-${year}-${safeId}`;

    // Coordinates — UTM first, then municipality cache fallback
    let coordinates: { lat: number; lng: number } | undefined;
    let coordSource: "utm" | "geocoded" | "none" = "none";
    const x    = parseFloat(row[COL.coordX] ?? "");
    const y    = parseFloat(row[COL.coordY] ?? "");
    const zone = parseInt(row[COL.huso] ?? "30");
    const datum = (row[COL.datum] ?? "ETRS89").toUpperCase();
    if (!isNaN(x) && !isNaN(y) && x > 100_000 && y > 100_000) {
      try {
        const ellps = datum.includes("ED50") ? "intl +towgs84=-87,-98,-121,0,0,0,0" : "GRS80 +towgs84=0,0,0,0,0,0,0";
        const utm = `+proj=utm +zone=${zone} +ellps=${ellps} +units=m +no_defs`;
        const wgs = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs";
        const [lng, lat] = proj4(utm, wgs, [x, y]) as [number, number];
        coordinates = { lat, lng };
        coordSource = "utm";
      } catch { /* skip bad coords */ }
    }
    if (!coordinates) {
      coordinates = fallbackCoords(municipio, provincia);
      if (coordinates) coordSource = "geocoded";
    }

    const fireDesc = [
      `${hectareas} ha de superficie forestal calcinadas.`,
      motivacion ? `Motivación registrada: ${motivacion}.` : "",
      extinguido ? `Extinguido: ${extinguido}.` : "",
      `Ref. EGIF: ${numeroParte || "—"}.`,
    ].filter(Boolean).join(" ");

    const doc = {
      _type: "case",
      _id: `egif-${safeId}`,
      title: `${municipio}, ${provincia} (${year || "?"})`,
      slug: { _type: "slug", current: slug },
      hidden: true,
      region,
      municipality: municipio,
      year: year || undefined,
      hectares: hectareas,
      status: "En investigación",
      accentColor: "#C4622D",
      ...(coordinates && { coordinates }),
      timeline: [
        {
          _key: "fire-0",
          date: detectado || String(year),
          title: "Incendio forestal",
          description: fireDesc,
          type: "fire",
        },
      ],
      sources: [
        {
          _key: "src-0",
          label: `EGIF parte ${numeroParte} — Estadística General de Incendios Forestales (MITECO)`,
          type: "EGIF",
        },
      ],
    };

    if (dryRun) {
      const coord = coordinates
        ? `${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)} (${coordSource})`
        : "no coords";
      console.log(`  [${String(i + 1).padStart(3)}] ${doc._id}`);
      console.log(`       ${doc.title} · ${hectareas}ha · ${region || comunidad || "región desconocida"} · ${coord}`);
      created++;
      continue;
    }

    try {
      await client.createOrReplace(doc);
      process.stdout.write(`  ✓ [${String(i + 1).padStart(3)}/${batch.length}] ${doc.title}\r`);
      created++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${doc._id}: ${msg}`);
      failed++;
    }
  }

  console.log(`\n\n── Summary ────────────────────────────────`);
  console.log(`   Created : ${created}`);
  if (failed) console.log(`   Failed  : ${failed}`);
  if (dryRun)  console.log(`   (Dry run — nothing written to Sanity)`);
  console.log(`\nReview drafts in Studio: http://localhost:3000/studio`);
  console.log(`All imported cases have hidden: true — publish case-by-case after review.\n`);
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
