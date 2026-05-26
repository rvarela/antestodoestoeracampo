#!/usr/bin/env tsx
/**
 * search-boe.ts
 *
 * Searches the Boletín Oficial del Estado (BOE) for documents mentioning each
 * case's municipality in the 1–15 years after the fire.
 *
 * ── SCOPE LIMITATION ────────────────────────────────────────────────────────
 * The BOE contains NATIONAL-level content only:
 *   ✓ Supreme Court / Constitutional Court rulings
 *   ✓ Royal decrees and national laws
 *   ✓ National environmental impact declarations (EIA/EsIA)
 *   ✗ Urban planning documents (PGOU, plan parcial) — these are in CCAA gazettes
 *      (BOJA, DOGC, DOG, DOGV, BOCyL, etc. — 17 different systems)
 *
 * The BOE may still surface relevant content: national court rulings about
 * a fire or a rezoning appeal, or national-level environmental approvals.
 *
 * For rezoning documents specifically, you need the autonomous community's
 * official gazette for each region:
 *   Andalucía:           BOJA   — https://www.juntadeandalucia.es/boja
 *   Cataluña:            DOGC   — https://dogc.gencat.cat
 *   Galicia:             DOG    — https://www.xunta.gal/dog
 *   Comunidad Valenciana: DOGV  — https://www.dogv.gva.es
 *   Castilla y León:     BOCyL  — https://bocyl.jcyl.es
 *   Asturias:            BOPA   — https://sede.asturias.es/bopa
 *   (etc. for all 17 communities)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * What this script adds per case:
 *   - Up to 5 BOE source entries (type: "BOE") with direct document URLs
 *   - Each source carries a verification note warning editors to confirm relevance
 *
 * Usage:
 *   npm run search:boe -- --dry-run          # preview, no writes
 *   npm run search:boe -- --slug=benidorm-1992-0000
 *   npm run search:boe -- --limit=50
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

interface CaseDoc {
  _id: string;
  slug: string;
  municipality: string;
  region: string;
  year: number;
  hectares: number;
  sources?: Array<{ _key: string; label: string; type: string; url?: string; note?: string }>;
}

interface BoeResult {
  id: string;
  title: string;
  url: string;
  year: string;
}

// ── BOE search ────────────────────────────────────────────────────────────────
// The BOE search form uses structured field params (campo[], dato[], operador[])
// We search title field (TITULOS) for municipality + keyword.

function buildBoeUrl(municipality: string, fromYear: number, toYear: number): string {
  const capped = Math.min(toYear, new Date().getFullYear());
  const params = new URLSearchParams({
    // Sections: 1-5 + TC (all)
    "campo[0]": "ORIS",
    "dato[0][1]": "1",
    "dato[0][2]": "2",
    "dato[0][3]": "3",
    "dato[0][4]": "4",
    "dato[0][5]": "5",
    "dato[0][T]": "T",
    "operador[0]": "and",
    // Title search — municipality + rezoning/planning keywords
    "campo[1]": "TITULOS",
    "dato[1]": `${municipality}`,
    "operador[1]": "and",
    // Full text search — rezoning keywords
    "campo[2]": "DOC",
    "dato[2]": "",
    "operador[2]": "and",
    // Date range
    "campo[6]": "FPU",
    "dato[6][0]": `${fromYear}-01-01`,
    "dato[6][1]": `${capped}-12-31`,
    "operador[6]": "and",
    // Sort by date descending
    "sort_field[0]": "FPU",
    "sort_order[0]": "asc",
  });

  return `https://www.boe.es/buscar/boe.php?${params.toString()}`;
}

function parseBoeResults(html: string): BoeResult[] {
  const results: BoeResult[] = [];

  // BOE search results contain document links in the form:
  // <a href="/diario_boe/txt.php?id=BOE-A-YYYY-NNNNN">Title text</a>
  // or href="/buscar/doc.php?id=BOE-A-YYYY-NNNNN"
  const linkRe = /href="[^"]*[?&]id=(BOE-[A-Z]+-\d{4}-\d+)"[^>]*>([^<]{5,200})<\/a>/g;

  const seen = new Set<string>();
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(html)) !== null) {
    const [, id, rawTitle] = m;
    if (seen.has(id)) continue;
    seen.add(id);

    const title = rawTitle.trim().replace(/\s+/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
    const yearMatch = id.match(/BOE-[A-Z]+-(\d{4})-/);
    const year = yearMatch?.[1] ?? "?";

    results.push({
      id,
      title,
      url: `https://www.boe.es/diario_boe/txt.php?id=${id}`,
      year,
    });

    if (results.length >= 5) break;
  }

  return results;
}

async function searchBoe(municipality: string, fromYear: number, toYear: number): Promise<BoeResult[]> {
  const url = buildBoeUrl(municipality, fromYear, toYear);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "antestodoestoeracampo.es/1.0 - civic research tool",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "es-ES,es;q=0.9",
      },
      redirect: "follow",
    });
  } catch (err) {
    console.warn(`    Network error: ${err}`);
    return [];
  }

  if (!res.ok) {
    console.warn(`    BOE returned ${res.status}`);
    return [];
  }

  const html = await res.text();

  if (html.includes("errorParametros") || html.includes("No se han encontrado") || html.includes("sin resultados")) {
    return [];
  }

  return parseBoeResults(html);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const BOE_CACHE_PATH = "scripts/data/boe-cache.json";

function loadBoeCache(): Record<string, BoeResult[]> {
  return existsSync(BOE_CACHE_PATH)
    ? JSON.parse(readFileSync(BOE_CACHE_PATH, "utf-8"))
    : {};
}

function saveBoeCache(cache: Record<string, BoeResult[]>) {
  writeFileSync(BOE_CACHE_PATH, JSON.stringify(cache, null, 2));
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
  const slugFilter = args["slug"] ?? null;
  const limit      = args["limit"] ? parseInt(args["limit"]) : Infinity;
  const minHa      = parseFloat(args["min-ha"] ?? "0");

  console.log(`\nBOE search — national-level documents`);
  console.log(`  Note: BOE = national level only. PGOU/plan parcial are in CCAA gazettes.`);
  if (dryRun) console.log(`  Mode: DRY RUN`);

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset   = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token     = process.env.SANITY_WRITE_TOKEN;

  if (!projectId || !dataset) {
    console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID or NEXT_PUBLIC_SANITY_DATASET");
    process.exit(1);
  }
  if (!token && !dryRun) {
    console.error("Missing SANITY_WRITE_TOKEN — run with --dry-run to preview");
    process.exit(1);
  }

  const client = createClient({
    projectId, dataset, token: token ?? "",
    apiVersion: "2026-05-19",
    useCdn: false,
  });

  const query = slugFilter
    ? `*[_type == "case" && slug.current == $slug && hidden == false]{
        _id, "slug": slug.current, municipality, region, year, hectares,
        sources[]{ _key, label, type, url, note }
      }`
    : `*[_type == "case" && hidden == false]{
        _id, "slug": slug.current, municipality, region, year, hectares,
        sources[]{ _key, label, type, url, note }
      }`;

  const params = slugFilter ? { slug: slugFilter } : {};
  let docs: CaseDoc[] = await client.fetch(query, params);

  if (minHa > 0) docs = docs.filter(d => d.hectares >= minHa);
  if (isFinite(limit)) docs = docs.slice(0, limit);

  console.log(`  Published cases to process: ${docs.length}\n`);

  const boeCache = loadBoeCache();
  let queriedFromApi = 0;
  let patched = 0, skipped = 0, failed = 0, noResults = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const municipalityNorm = doc.municipality
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z\s]/g, " ")
      .trim();

    const cacheKey = `${municipalityNorm}||${doc.year}`;

    // Skip if already has BOE sources
    const existingBoe = doc.sources?.filter(s => s.type === "BOE") ?? [];
    if (existingBoe.length > 0) {
      process.stdout.write(`  ~ [${i + 1}/${docs.length}] ${doc.slug} — ${existingBoe.length} BOE source(s) already, skipping\n`);
      skipped++;
      continue;
    }

    let results: BoeResult[];
    if (boeCache[cacheKey] !== undefined) {
      results = boeCache[cacheKey];
      if (results.length > 0) {
        process.stdout.write(`  … [${i + 1}/${docs.length}] ${doc.municipality} — ${results.length} cached\n`);
      }
    } else {
      if (queriedFromApi > 0) await sleep(2500);

      process.stdout.write(`  … [${i + 1}/${docs.length}] ${doc.municipality} (${doc.year + 1}–${doc.year + 15})…`);
      results = await searchBoe(municipalityNorm, doc.year + 1, doc.year + 15);
      boeCache[cacheKey] = results;
      queriedFromApi++;

      if (queriedFromApi % 10 === 0) saveBoeCache(boeCache);
      process.stdout.write(` ${results.length} result(s)\n`);
    }

    if (results.length === 0) {
      noResults++;
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY RUN] ${doc.slug} — would add ${results.length} BOE source(s):`);
      results.forEach(r => console.log(`    · ${r.id} (${r.year}): ${r.title.slice(0, 80)}`));
      patched++;
      continue;
    }

    const newSources = results.map(r => ({
      _key: `boe-${r.id.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
      label: r.title,
      type: "BOE" as const,
      url: r.url,
      note: "Encontrado automáticamente en el BOE. Verificar que este documento es directamente relevante para el caso antes de publicar.",
    }));

    const allSources = [...(doc.sources ?? []), ...newSources];

    try {
      await client.patch(doc._id).set({ sources: allSources }).commit();
      console.log(`  ✓ ${doc.slug} — added ${newSources.length} BOE source(s)`);
      patched++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${doc.slug}: ${msg}`);
      failed++;
    }
  }

  saveBoeCache(boeCache);

  console.log(`\n── Summary ──────────────────────────────────────────`);
  console.log(`   Patched    : ${patched} cases`);
  console.log(`   No results : ${noResults} (no BOE hits in window)`);
  console.log(`   Skipped    : ${skipped} (already had BOE sources)`);
  if (failed) console.log(`   Failed     : ${failed}`);
  console.log(`   BOE queries: ${queriedFromApi}`);
  console.log(`\nIMPORTANT: BOE = national level only.`);
  console.log(`For rezoning docs, check each region's official gazette:`);
  console.log(`  BOJA (Andalucía), DOGC (Cataluña), DOG (Galicia), DOGV (C. Valenciana), BOCyL (CyL)...\n`);
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
