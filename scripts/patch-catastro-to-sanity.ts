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
 *   3. The overview's Catastro paragraph — replaces the auto-generated
 *      "p-nocatastro" placeholder (or refreshes an existing "p-catastro"
 *      block) with the current findings. Overviews without either keyed
 *      block (manually written) are left untouched.
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

interface OverviewBlock {
  _key?: string;
  [k: string]: unknown;
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
  overview?: OverviewBlock[];
  // Full timeline objects — written back verbatim on patch, so the fetch must
  // NOT project a subset of fields (a `timeline[]{ _key, type, title }`
  // projection here silently stripped date/description from every entry)
  timeline?: Array<{ _key: string; type: string; title: string; [k: string]: unknown }>;
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

const ES_MINOR_WORDS = new Set(["de", "del", "la", "las", "el", "los", "y", "o", "en", "a"]);

/** EGIF uppercase municipality → prose-friendly casing (SOLANA DE ÁVILA → Solana de Ávila) */
function titleCaseEs(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) =>
      i > 0 && ES_MINOR_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ");
}

function makeExcerpt(doc: CaseDoc, s: CatastroSummary): string {
  const ha = doc.hectares.toLocaleString("es-ES", { maximumFractionDigits: 0 });
  const municipality = doc.municipality
    ? titleCaseEs(doc.municipality)
    : "municipio desconocido";
  const lagYears = s.latestMod - doc.year;

  return (
    `Incendio forestal de ${ha} hectáreas en ${municipality} (${doc.region}) en ${doc.year}. ` +
    `En el área analizada en torno al incendio, el Catastro registra ${s.urbanCount.toLocaleString("es-ES")} parcelas ` +
    `clasificadas como suelo urbano, con modificaciones hasta ${lagYears} años después. ` +
    `Señal para investigar, no prueba de recalificación.`
  );
}

function sanityBlock(text: string, key: string) {
  return {
    _type: "block",
    _key: key,
    style: "normal",
    markDefs: [],
    children: [{ _type: "span", _key: `${key}-s`, text, marks: [] }],
  };
}

// Same text as the "p-catastro" paragraph in enrich-all-cases.ts — keep in sync
function makeCatastroOverviewBlock(doc: CaseDoc, s: CatastroSummary): OverviewBlock {
  const lag = s.latestMod - doc.year;
  const lagPhrase = lag <= 5 ? "en apenas" : "hasta";
  const range = s.earliestMod === s.latestMod
    ? String(s.earliestMod)
    : `entre ${s.earliestMod} y ${s.latestMod}`;

  const catPara =
    `El análisis automatizado del Catastro INSPIRE detecta ${s.suspiciousCount.toLocaleString("es-ES")} parcelas modificadas en el área analizada en torno al incendio, ` +
    `de las cuales ${s.urbanCount.toLocaleString("es-ES")} aparecen clasificadas como suelo urbano en los registros ${range}. ` +
    `Esto representa una modificación ${lagPhrase} ${lag} año${lag !== 1 ? "s" : ""} después del incendio. ` +
    `Es una señal que conviene investigar, no una prueba: indica que esas parcelas figuran hoy como suelo urbano en el área analizada, ` +
    `no que su clasificación cambiara a causa del incendio —un casco urbano preexistente o una actualización administrativa del Catastro también podrían explicarlo.`;

  return sanityBlock(catPara, "p-catastro");
}

/**
 * Swap the overview's auto-generated Catastro placeholder ("p-nocatastro")
 * — or refresh a stale "p-catastro" block — with current findings.
 * Returns null when there's nothing to replace (no overview, or a manually
 * written one without the keyed blocks).
 */
function updatedOverview(doc: CaseDoc, s: CatastroSummary): OverviewBlock[] | null {
  if (!doc.overview?.length) return null;
  const idx = doc.overview.findIndex(b => b._key === "p-nocatastro" || b._key === "p-catastro");
  if (idx === -1) return null;
  const fresh = makeCatastroOverviewBlock(doc, s);
  const next = [...doc.overview];
  next[idx] = fresh;
  return next;
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
      overview,
      timeline
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

    // Write excerpt if missing, or overwrite a stale auto-generated one:
    // older versions overclaimed ("reclasificadas … es consistente") or placed
    // the parcels "en la zona quemada" (the query is a box, not the burn
    // perimeter), and current-template excerpts go stale when a case is
    // re-queried (e.g. after a coordinate fix — parcel counts change). The
    // closing sentence is the auto-template signature; manually written
    // excerpts never contain these exact phrasings, so they're left untouched.
    if (
      !doc.excerpt ||
      /reclasificadas como suelo urbano|En la zona quemada, el Catastro registra|Señal para investigar, no prueba de recalificación/.test(doc.excerpt)
    ) {
      patch.excerpt = makeExcerpt(doc, s);
    }

    // Build updated timeline — replace the catastro entry if it exists, then
    // insert chronologically (prepending it put the post-fire entry before
    // fire-0 on 1,217 cases — healed by scripts/fix-timeline-order.ts).
    const newEntry = makeTimelineEntry(doc, s);
    const withoutCatastro = (doc.timeline ?? []).filter(t => t._key !== "catastro-rezoning");
    const sortableDate = (d: unknown) => (typeof d === "string" && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(d) ? d : null);
    const newDate = sortableDate(newEntry.date);
    let insertAt = withoutCatastro.length;
    if (newDate) {
      for (let i = 0; i < withoutCatastro.length; i++) {
        const ed = sortableDate(withoutCatastro[i].date);
        if (ed && ed > newDate) { insertAt = i; break; }
      }
    }
    patch.timeline = [...withoutCatastro.slice(0, insertAt), newEntry, ...withoutCatastro.slice(insertAt)];

    // Catastro signal — shown as a column on /casos
    patch.urbanParcels = s.urbanCount;

    // Overview: swap the "p-nocatastro" placeholder / stale "p-catastro" block
    const overview = updatedOverview(doc, s);
    if (overview) patch.overview = overview;

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
      if (patch.overview) wrote.push("overview para");
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
