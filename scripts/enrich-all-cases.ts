#!/usr/bin/env tsx
/**
 * enrich-all-cases.ts
 *
 * Auto-populates all Sanity case documents with data-driven content,
 * leaving manual fields (connections, judicial, detailed sources) empty.
 *
 * For each case it writes:
 *   1. overview[] — Portable Text narrative from EGIF + Catastro data
 *   2. sources[]  — Adds a Catastro source entry where cache data exists
 *                   (EGIF source already added by seed-from-egif.ts)
 *
 * Safe to re-run: skips cases that already have an overview,
 * and never overwrites existing sources — only appends missing ones.
 *
 * Usage:
 *   npm run enrich:all              # process all cases
 *   npm run enrich:all -- --dry-run # preview without writing
 *   npm run enrich:all -- --slug=mijas-2022-2022290065
 *   npm run enrich:all -- --no-overview  # only add Catastro source entry
 */

import { readFileSync, existsSync } from "fs";
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

interface Parcel {
  rc: string;
  areaM2: number;
  modifiedYear: number | null;
  classification: "urbano" | "rustico" | "unknown";
}

interface CacheEntry {
  slug: string;
  parcels: Parcel[];
  suspiciousParcels: Parcel[];
  queriedAt: string;
}

interface CatastroSummary {
  urbanCount: number;
  rusticoCount: number;
  suspiciousCount: number;
  earliestMod: number;
  latestMod: number;
}

interface Source {
  _key: string;
  label: string;
  type: string;
  url?: string;
}

interface CaseDoc {
  _id: string;
  slug: string;
  title: string;
  municipality: string;
  region: string;
  year: number;
  hectares: number;
  status: string;
  excerpt?: string;
  overview?: unknown[];
  sources?: Source[];
  timeline?: Array<{ _key: string; type: string; date?: string; description?: string }>;
}

// ── Catastro cache helpers ────────────────────────────────────────────────────

function summariseCatastro(entry: CacheEntry, fireYear: number): CatastroSummary | null {
  const suspicious = entry.parcels.filter(p => {
    if (!p.modifiedYear) return false;
    const lag = p.modifiedYear - fireYear;
    return lag >= 1 && lag <= 15;
  });
  if (suspicious.length === 0) return null;

  const urban   = suspicious.filter(p => p.classification === "urbano");
  const rustico = suspicious.filter(p => p.classification === "rustico");
  const years   = suspicious.map(p => p.modifiedYear!).filter(Boolean);

  return {
    urbanCount:      urban.length,
    rusticoCount:    rustico.length,
    suspiciousCount: suspicious.length,
    earliestMod:     Math.min(...years),
    latestMod:       Math.max(...years),
  };
}

// ── Content generators ────────────────────────────────────────────────────────

function sanityBlock(text: string, key: string) {
  return {
    _type: "block",
    _key: key,
    style: "normal",
    markDefs: [],
    children: [{ _type: "span", _key: `${key}-s`, text, marks: [] }],
  };
}

function makeOverview(doc: CaseDoc, catastro: CatastroSummary | null): unknown[] {
  const blocks: unknown[] = [];
  const municipalityTitle =
    doc.municipality.charAt(0).toUpperCase() + doc.municipality.slice(1).toLowerCase();

  // ── Para 1: Fire facts ──
  const fireEntry = doc.timeline?.find(t => t.type === "fire");
  let firePara = `Incendio forestal de ${doc.hectares.toLocaleString("es-ES", { maximumFractionDigits: 0 })} hectáreas registrado en ${municipalityTitle} (${doc.region}) en el año ${doc.year}.`;

  if (fireEntry?.date && fireEntry.date.length > 4) {
    // Try to format the date if it's a full date string
    try {
      const d = new Date(fireEntry.date);
      if (!isNaN(d.getTime())) {
        const formatted = d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
        firePara = `Incendio forestal de ${doc.hectares.toLocaleString("es-ES", { maximumFractionDigits: 0 })} hectáreas registrado el ${formatted} en ${municipalityTitle} (${doc.region}).`;
      }
    } catch { /* keep default */ }
  }

  firePara += ` El incendio está clasificado como intencionado en la Estadística General de Incendios Forestales (EGIF) del Ministerio para la Transición Ecológica.`;
  blocks.push(sanityBlock(firePara, "p-fire"));

  // ── Para 2: Catastro findings (if any) ──
  if (catastro && catastro.urbanCount > 0) {
    const lag = catastro.latestMod - doc.year;
    const lagWord = lag <= 5 ? "apenas" : "hasta";
    const range = catastro.earliestMod === catastro.latestMod
      ? String(catastro.earliestMod)
      : `entre ${catastro.earliestMod} y ${catastro.latestMod}`;

    const catPara =
      `El análisis automatizado del Catastro INSPIRE detecta ${catastro.suspiciousCount.toLocaleString("es-ES")} parcelas modificadas en el área afectada por el incendio, ` +
      `de las cuales ${catastro.urbanCount.toLocaleString("es-ES")} aparecen clasificadas como suelo urbano en los registros ${range}. ` +
      `Esto representa una modificación en ${lagWord} ${lag} año${lag !== 1 ? "s" : ""} después del incendio. ` +
      `El patrón —incendio forestal, reclasificación catastral, construcción— es consistente con los casos documentados en esta base de datos.`;

    blocks.push(sanityBlock(catPara, "p-catastro"));
  } else {
    // No catastro data yet — note it
    const noCatPara =
      `El análisis catastral automatizado no ha detectado reclasificaciones significativas de suelo en el área del incendio, ` +
      `o los datos de Catastro INSPIRE aún no han sido procesados para este caso. ` +
      `La investigación de posibles conexiones entre el incendio y cambios en la clasificación del suelo requiere revisión manual.`;
    blocks.push(sanityBlock(noCatPara, "p-nocatastro"));
  }

  // ── Para 3: Status + call to action ──
  const statusPara =
    doc.status === "Sentencia firme"
      ? `Este caso cuenta con sentencia judicial firme. Consulta la sección judicial para más detalles sobre el procedimiento y el fallo.`
      : doc.status === "En investigación"
      ? `Este caso está en fase de investigación. Si dispones de información relevante —documentos, testigos, datos catastrales adicionales— puedes contribuir a través de los canales habilitados.`
      : `Estado actual: ${doc.status}.`;

  blocks.push(sanityBlock(statusPara, "p-status"));

  return blocks;
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

  const dryRun      = args["dry-run"] === "true";
  const slugFilter  = args["slug"] ?? null;
  const noOverview  = args["no-overview"] === "true";

  const CACHE_PATH = "scripts/data/catastro-cache.json";
  const cache: Record<string, CacheEntry> = existsSync(CACHE_PATH)
    ? JSON.parse(readFileSync(CACHE_PATH, "utf-8"))
    : {};

  console.log(`\nEnrich all cases — data-driven overview + source entries`);
  console.log(`  Catastro cache: ${Object.keys(cache).length} entries`);
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

  // Fetch all cases (or just the filtered slug)
  const query = slugFilter
    ? `*[_type == "case" && slug.current == $slug]{
        _id, "slug": slug.current, title, municipality, region, year, hectares, status,
        excerpt, overview, sources[]{ _key, label, type, url },
        timeline[]{ _key, type, date, description }
      }`
    : `*[_type == "case"]{
        _id, "slug": slug.current, title, municipality, region, year, hectares, status,
        excerpt, overview, sources[]{ _key, label, type, url },
        timeline[]{ _key, type, date, description }
      }`;

  const params = slugFilter ? { slug: slugFilter } : {};
  const docs: CaseDoc[] = await client.fetch(query, params);

  console.log(`  Cases fetched: ${docs.length}\n`);

  let patched = 0, skipped = 0, failed = 0;

  for (const doc of docs) {
    const patch: Record<string, unknown> = {};
    const notes: string[] = [];

    // ── Overview ──
    if (!noOverview && (!doc.overview || doc.overview.length === 0)) {
      const catEntry = cache[doc.slug];
      const catastro = catEntry ? summariseCatastro(catEntry, doc.year) : null;
      patch.overview = makeOverview(doc, catastro);
      notes.push("overview");
    }

    // ── Catastro source entry ──
    const catEntry = cache[doc.slug];
    if (catEntry) {
      const alreadyHasCatastroSource = doc.sources?.some(s =>
        s.type === "Catastro" || s.label?.includes("Catastro")
      );
      if (!alreadyHasCatastroSource) {
        const existingSources = doc.sources ?? [];
        patch.sources = [
          ...existingSources,
          {
            _key: "src-catastro",
            label: "Catastro INSPIRE WFS — Sede Electrónica del Catastro (Ministerio de Hacienda)",
            type: "Catastro",
            url: "https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx",
          },
        ];
        notes.push("Catastro source");
      }
    }

    if (Object.keys(patch).length === 0) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY RUN] ${doc.slug} — would add: ${notes.join(", ")}`);
      if (patch.overview) {
        const blocks = patch.overview as unknown[];
        const firstBlock = (blocks[0] as { children: Array<{ text: string }> }).children[0].text;
        console.log(`    Overview p1: "${firstBlock.slice(0, 100)}..."`);
      }
      patched++;
      continue;
    }

    try {
      await client.patch(doc._id).set(patch).commit();
      process.stdout.write(`  ✓ ${doc.slug} — ${notes.join(", ")}\n`);
      patched++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${doc.slug}: ${msg}`);
      failed++;
    }
  }

  console.log(`\n── Summary ──────────────────────────────────────`);
  console.log(`   Patched : ${patched}`);
  console.log(`   Skipped : ${skipped} (already complete)`);
  if (failed) console.log(`   Failed  : ${failed}`);
  if (dryRun) console.log(`\n   Re-run without --dry-run to write.`);
  console.log();
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
