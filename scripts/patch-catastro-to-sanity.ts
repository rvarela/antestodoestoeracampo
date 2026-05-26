#!/usr/bin/env tsx
/**
 * patch-catastro-to-sanity.ts
 *
 * Reads catastro-cache.json (produced by enrich-from-catastro.ts) and patches
 * matching Sanity case documents with:
 *
 *   1. A "rezoning" timeline entry — "Modificación catastral detectada"
 *      describing urban parcels modified 1–15 years after the fire.
 *
 *   2. A data-driven excerpt (only if the case has none already).
 *
 * Leaves hidden: true — publishing is a manual editorial decision.
 *
 * Usage:
 *   npx tsx scripts/patch-catastro-to-sanity.ts --dry-run
 *   npx tsx scripts/patch-catastro-to-sanity.ts --min-urban=20
 *   npx tsx scripts/patch-catastro-to-sanity.ts --slug=mijas-2022-2022290065
 *   npx tsx scripts/patch-catastro-to-sanity.ts --min-urban=50 --dry-run
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

interface CaseDoc {
  _id: string;
  slug: string;
  title: string;
  municipality: string;
  region: string;
  year: number;
  hectares: number;
  excerpt?: string;
  timeline?: Array<{ _key: string; type: string; title: string }>;
}

// ── Analysis helpers ──────────────────────────────────────────────────────────

interface CatastroSummary {
  urbanCount: number;
  rusticoCount: number;
  suspiciousCount: number;
  earliestMod: number;
  latestMod: number;
  sampleRCs: string[];
}

function summarise(entry: CacheEntry, fireYear: number): CatastroSummary {
  // Recompute suspicious: modified 1–15 years after fire
  const suspicious = entry.parcels.filter(p => {
    if (!p.modifiedYear) return false;
    const lag = p.modifiedYear - fireYear;
    return lag >= 1 && lag <= 15;
  });

  const urban   = suspicious.filter(p => p.classification === "urbano");
  const rustico = suspicious.filter(p => p.classification === "rustico");
  const years   = suspicious.map(p => p.modifiedYear!).filter(Boolean);

  return {
    urbanCount:    urban.length,
    rusticoCount:  rustico.length,
    suspiciousCount: suspicious.length,
    earliestMod:   years.length ? Math.min(...years) : fireYear + 1,
    latestMod:     years.length ? Math.max(...years) : fireYear + 1,
    sampleRCs:     urban.slice(0, 3).map(p => p.rc),
  };
}

// ── Content generators ────────────────────────────────────────────────────────

function makeExcerpt(doc: CaseDoc, s: CatastroSummary): string {
  const ha = doc.hectares.toLocaleString("es-ES", { maximumFractionDigits: 0 });
  const municipality = doc.municipality
    ? doc.municipality.charAt(0) + doc.municipality.slice(1).toLowerCase()
    : "municipio desconocido";
  const lagYears = s.latestMod - doc.year;

  return (
    `Incendio forestal de ${ha} hectáreas en ${municipality} (${doc.region}) en ${doc.year}. ` +
    `El análisis catastral detecta ${s.urbanCount.toLocaleString("es-ES")} parcelas ` +
    `reclasificadas como suelo urbano entre ${s.earliestMod} y ${s.latestMod}, ` +
    `${lagYears <= 5 ? "apenas" : "hasta"} ${lagYears} años después del incendio. ` +
    `El patrón —incendio, recalificación, construcción— es consistente con los casos documentados en esta base de datos.`
  );
}

function makeTimelineEntry(doc: CaseDoc, s: CatastroSummary): Record<string, unknown> {
  const range =
    s.earliestMod === s.latestMod
      ? String(s.earliestMod)
      : `${s.earliestMod}–${s.latestMod}`;

  const rcNote = s.sampleRCs.length
    ? ` Referencias catastrales detectadas: ${s.sampleRCs.join(", ")}${s.urbanCount > 3 ? " y otras." : "."}`
    : "";

  return {
    _key: "catastro-rezoning",
    type: "rezoning",
    date: String(s.earliestMod),
    title: `Modificación catastral detectada (${range})`,
    description:
      `El Catastro registra ${s.suspiciousCount.toLocaleString("es-ES")} parcelas modificadas ` +
      `entre ${s.earliestMod} y ${s.latestMod} en el área del incendio, ` +
      `de las cuales ${s.urbanCount.toLocaleString("es-ES")} aparecen clasificadas como suelo urbano` +
      `${s.rusticoCount ? ` y ${s.rusticoCount.toLocaleString("es-ES")} como suelo rústico` : ""}. ` +
      `La modificación se produce ${s.earliestMod - doc.year} año${s.earliestMod - doc.year !== 1 ? "s" : ""} ` +
      `después del incendio. Fuente: Catastro INSPIRE WFS (consulta automatizada).` +
      rcNote,
  };
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
  const minUrban   = parseInt(args["min-urban"] ?? "10");
  const slugFilter = args["slug"] ?? null;

  const CACHE_PATH = "scripts/data/catastro-cache.json";

  if (!existsSync(CACHE_PATH)) {
    console.error(`Cache not found: ${CACHE_PATH}`);
    console.error("Run: npm run enrich:catastro first.");
    process.exit(1);
  }

  const cache: Record<string, CacheEntry> = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
  console.log(`\nCatastro → Sanity enrichment`);
  console.log(`  Cache entries: ${Object.keys(cache).length}`);
  console.log(`  Min urban parcels: ${minUrban}`);
  if (dryRun) console.log(`  Mode: DRY RUN (no writes)`);

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

  // ── Build candidate list from cache ──────────────────────────────────────

  // We need fire years to compute suspicious parcels — fetch from Sanity
  const cachedSlugs = Object.keys(cache);
  const docs = await client.fetch<CaseDoc[]>(
    `*[_type == "case" && slug.current in $slugs]{
      _id, "slug": slug.current, title, municipality, region, year, hectares, excerpt,
      timeline[]{ _key, type, title }
    }`,
    { slugs: cachedSlugs }
  );

  const docMap = new Map(docs.map(d => [d.slug, d]));

  // Score each cached case
  const candidates = cachedSlugs
    .map(slug => {
      const entry = cache[slug];
      const doc   = docMap.get(slug);
      if (!doc) return null;

      const s = summarise(entry, doc.year);
      return { slug, doc, entry, summary: s };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .filter(x => x.summary.urbanCount >= minUrban)
    .filter(x => !slugFilter || x.slug === slugFilter)
    .sort((a, b) => b.summary.urbanCount - a.summary.urbanCount);

  console.log(`\n  Candidates (≥${minUrban} urban parcels): ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("  Nothing to patch. Lower --min-urban or run enrich:catastro first.");
    return;
  }

  console.log(`\n${"Slug".padEnd(50)} ${"Urban".padStart(5)}  ${"Susp".padStart(5)}  ${"Range".padEnd(10)}  Excerpt?  Catastro entry?`);
  console.log("─".repeat(110));

  for (const { slug, doc, summary: s } of candidates) {
    const hasExcerpt  = !!doc.excerpt;
    const hasCatastro = doc.timeline?.some(t => t._key === "catastro-rezoning") ?? false;
    const range = s.earliestMod === s.latestMod
      ? String(s.earliestMod)
      : `${s.earliestMod}–${s.latestMod}`;

    console.log(
      `${slug.padEnd(50)} ${String(s.urbanCount).padStart(5)}  ${String(s.suspiciousCount).padStart(5)}  ${range.padEnd(10)}  ` +
      `${hasExcerpt ? "yes     " : "MISSING "}  ${hasCatastro ? "yes" : "MISSING"}`
    );
  }

  if (dryRun) {
    console.log(`\n[DRY RUN] Would patch ${candidates.length} case(s). Re-run without --dry-run to write.`);

    // Show a sample of what would be written
    const sample = candidates[0];
    console.log(`\nSample — ${sample.slug}:`);
    console.log(`  Excerpt: "${makeExcerpt(sample.doc, sample.summary).slice(0, 120)}..."`);
    const tl = makeTimelineEntry(sample.doc, sample.summary);
    console.log(`  Timeline entry: "${tl.title}"`);
    console.log(`  Description: "${(tl.description as string).slice(0, 120)}..."`);
    return;
  }

  // ── Patch Sanity ──────────────────────────────────────────────────────────

  console.log(`\nPatching ${candidates.length} case(s)...`);
  let ok = 0, skipped = 0, failed = 0;

  for (const { slug, doc, summary: s } of candidates) {
    const patch: Record<string, unknown> = {};

    // Add excerpt only if missing
    if (!doc.excerpt) {
      patch.excerpt = makeExcerpt(doc, s);
    }

    // Build updated timeline — replace catastro entry if it exists, otherwise append
    const newEntry = makeTimelineEntry(doc, s);
    const existing = doc.timeline ?? [];
    const withoutCatastro = existing.filter(t => t._key !== "catastro-rezoning");
    patch.timeline = [newEntry, ...withoutCatastro];

    if (Object.keys(patch).length === 0) {
      console.log(`  ~ ${slug} — nothing to update, skipping`);
      skipped++;
      continue;
    }

    try {
      await client.patch(doc._id).set(patch).commit();
      const wrote = [];
      if (patch.excerpt) wrote.push("excerpt");
      if (patch.timeline) wrote.push("timeline entry");
      console.log(`  ✓ ${slug} — patched: ${wrote.join(", ")}`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${slug}: ${msg}`);
      failed++;
    }
  }

  console.log(`\n── Summary ──────────────────────────────────────────`);
  console.log(`   Patched:  ${ok}`);
  if (skipped) console.log(`   Skipped:  ${skipped} (already up to date)`);
  if (failed)  console.log(`   Failed:   ${failed}`);
  console.log(`\nAll cases remain hidden: true.`);
  console.log(`To publish, set hidden: false in Sanity Studio or run:`);
  console.log(`  npx tsx scripts/publish-cases.ts --slug=<slug>\n`);
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
