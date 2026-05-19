#!/usr/bin/env tsx
/**
 * import-case-data.ts — Patch Sanity case documents from CSV files
 *
 * Reads four CSVs (timeline, connections, judicial, sources) and patches
 * the matching Sanity case documents. Existing array data is REPLACED.
 *
 * Usage:
 *   npx tsx scripts/import-case-data.ts
 *   npx tsx scripts/import-case-data.ts --slug=terra-mitica-benidorm-1992  # one case only
 *   npx tsx scripts/import-case-data.ts --dry-run                           # preview, no writes
 *
 * CSV files expected at:
 *   scripts/data/cases-meta.csv        — title, excerpt, status, outcome, accentColor, hidden
 *   scripts/data/cases-timeline.csv    — timeline events
 *   scripts/data/cases-connections.csv — political connections
 *   scripts/data/cases-judicial.csv    — court history
 *   scripts/data/cases-sources.csv     — sources & references
 *
 * Google Sheets workflow:
 *   1. Open the template sheet (link in project Notion / README)
 *   2. Fill in your data across the 5 tabs
 *   3. File → Download → Comma-separated values — one tab at a time
 *   4. Save each file to scripts/data/ with the names above
 *   5. npx tsx scripts/import-case-data.ts --dry-run   (preview)
 *   6. npx tsx scripts/import-case-data.ts             (write)
 *
 * The slug column must match the case's slug in Sanity exactly.
 * Check http://localhost:3000/studio to find slugs.
 *
 * Column reference:
 *
 *   Meta:        slug | title | excerpt | status | outcome | accentColor | hidden
 *     status values: Sentencia firme | En investigación | Archivado | Sobreseído
 *     hidden: true/false — false = published on site
 *
 *   Timeline:    slug | date | title | description | type
 *     type values: fire | purchase | rezoning | permit | construction | judicial | political | other
 *
 *   Connections: slug | name | role | party | connection
 *
 *   Judicial:    slug | court | date | result | description
 *     result values: convicted | acquitted | pending | archived
 *
 *   Sources:     slug | label | url | type
 *     type values: EGIF | Catastro | BOE | Sentencia | Prensa | Otro
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
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

// ── Config ────────────────────────────────────────────────────────────────────

const DATA_DIR = "scripts/data";

const FILES = {
  meta:        path.join(DATA_DIR, "cases-meta.csv"),
  timeline:    path.join(DATA_DIR, "cases-timeline.csv"),
  connections: path.join(DATA_DIR, "cases-connections.csv"),
  judicial:    path.join(DATA_DIR, "cases-judicial.csv"),
  sources:     path.join(DATA_DIR, "cases-sources.csv"),
};

// ── CSV helpers ───────────────────────────────────────────────────────────────

function readCsv(filePath: string): Record<string, string>[] {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];
}

function groupBySlug<T extends { slug: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.slug) continue;
    if (!map.has(row.slug)) map.set(row.slug, []);
    map.get(row.slug)!.push(row);
  }
  return map;
}

function makeKey(prefix: string, i: number) {
  return `${prefix}-${String(i).padStart(3, "0")}`;
}

// ── Row → Sanity document shapes ──────────────────────────────────────────────

function toTimeline(rows: Record<string, string>[]) {
  return rows.map((r, i) => ({
    _key:        makeKey("tl", i),
    date:        r.date        ?? "",
    title:       r.title       ?? "",
    description: r.description ?? undefined,
    type:        r.type        ?? "other",
  }));
}

function toConnections(rows: Record<string, string>[]) {
  return rows.map((r, i) => ({
    _key:       makeKey("cn", i),
    name:       r.name       ?? "",
    role:       r.role       ?? "",
    party:      r.party      || undefined,
    connection: r.connection ?? "",
  }));
}

function toJudicial(rows: Record<string, string>[]) {
  return rows.map((r, i) => ({
    _key:        makeKey("jd", i),
    court:       r.court       ?? "",
    date:        r.date        ?? "",
    result:      r.result      ?? "pending",
    description: r.description ?? "",
  }));
}

function toSources(rows: Record<string, string>[]) {
  return rows.map((r, i) => ({
    _key:  makeKey("src", i),
    label: r.label ?? "",
    url:   r.url   || undefined,
    type:  r.type  ?? "Otro",
  }));
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
  const slugFilter = args["slug"] ?? null;

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
    projectId,
    dataset,
    token: token ?? "",
    apiVersion: "2024-01-01",
    useCdn: false,
  });

  // ── Load CSVs ────────────────────────────────────────────────────────────────

  const metaRows        = readCsv(FILES.meta);
  const timelineRows    = readCsv(FILES.timeline);
  const connectionRows  = readCsv(FILES.connections);
  const judicialRows    = readCsv(FILES.judicial);
  const sourceRows      = readCsv(FILES.sources);

  console.log(`\nLoaded:`);
  console.log(`  Meta:        ${metaRows.length} rows   (${FILES.meta})`);
  console.log(`  Timeline:    ${timelineRows.length} rows   (${FILES.timeline})`);
  console.log(`  Connections: ${connectionRows.length} rows   (${FILES.connections})`);
  console.log(`  Judicial:    ${judicialRows.length} rows   (${FILES.judicial})`);
  console.log(`  Sources:     ${sourceRows.length} rows   (${FILES.sources})`);

  // ── Group by slug ─────────────────────────────────────────────────────────

  const metaBySlug = new Map(metaRows.filter(r => r.slug).map(r => [r.slug, r]));

  const bySlug = {
    timeline:    groupBySlug(timelineRows.map(r => ({ slug: r.slug, ...r }))),
    connections: groupBySlug(connectionRows.map(r => ({ slug: r.slug, ...r }))),
    judicial:    groupBySlug(judicialRows.map(r => ({ slug: r.slug, ...r }))),
    sources:     groupBySlug(sourceRows.map(r => ({ slug: r.slug, ...r }))),
  };

  // Collect all unique slugs across all files
  const allSlugs = new Set([
    ...metaBySlug.keys(),
    ...bySlug.timeline.keys(),
    ...bySlug.connections.keys(),
    ...bySlug.judicial.keys(),
    ...bySlug.sources.keys(),
  ]);

  const slugs = slugFilter
    ? [...allSlugs].filter(s => s === slugFilter)
    : [...allSlugs];

  if (slugs.length === 0) {
    console.log(slugFilter
      ? `\nNo data found for slug: ${slugFilter}`
      : "\nNo data found in any CSV file."
    );
    process.exit(0);
  }

  console.log(`\n${dryRun ? "[DRY RUN] " : ""}Processing ${slugs.length} case(s):\n`);

  let ok = 0, failed = 0;

  for (const slug of slugs) {
    // Look up the Sanity document ID by slug
    let docId: string | null = null;
    if (!dryRun) {
      const doc = await client.fetch<{ _id: string } | null>(
        `*[_type == "case" && slug.current == $slug][0]{ _id }`,
        { slug }
      );
      if (!doc) {
        console.error(`  ✗ ${slug} — not found in Sanity (check slug is correct)`);
        failed++;
        continue;
      }
      docId = doc._id;
    }

    const patch: Record<string, unknown> = {};

    // Meta fields
    const meta = metaBySlug.get(slug);
    if (meta) {
      if (meta.title)       patch.title       = meta.title;
      if (meta.excerpt)     patch.excerpt     = meta.excerpt;
      if (meta.status)      patch.status      = meta.status;
      if (meta.outcome)     patch.outcome     = meta.outcome;
      if (meta.accentColor) patch.accentColor = meta.accentColor;
      if (meta.hidden !== undefined && meta.hidden !== "") {
        patch.hidden = meta.hidden === "false" ? false : true;
      }
    }

    // Array fields
    const tl = bySlug.timeline.get(slug);
    if (tl?.length)  patch.timeline    = toTimeline(tl);

    const cn = bySlug.connections.get(slug);
    if (cn?.length)  patch.connections = toConnections(cn);

    const jd = bySlug.judicial.get(slug);
    if (jd?.length)  patch.judicial    = toJudicial(jd);

    const src = bySlug.sources.get(slug);
    if (src?.length) patch.sources     = toSources(src);

    const fieldCount = Object.keys(patch).length;
    if (fieldCount === 0) {
      console.log(`  ~ ${slug} — no data rows found, skipping`);
      continue;
    }

    if (dryRun) {
      console.log(`  [preview] ${slug}`);
      if (meta)              console.log(`    meta:        title="${meta.title ?? ""}" status="${meta.status ?? ""}" hidden=${meta.hidden ?? ""}`);
      if (patch.timeline)    console.log(`    timeline:    ${(patch.timeline as unknown[]).length} events`);
      if (patch.connections) console.log(`    connections: ${(patch.connections as unknown[]).length} entries`);
      if (patch.judicial)    console.log(`    judicial:    ${(patch.judicial as unknown[]).length} entries`);
      if (patch.sources)     console.log(`    sources:     ${(patch.sources as unknown[]).length} entries`);
      ok++;
      continue;
    }

    try {
      await client.patch(docId!).set(patch).commit();
      console.log(`  ✓ ${slug} — patched ${fieldCount} field(s)`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${slug}: ${msg}`);
      failed++;
    }
  }

  console.log(`\n── Summary ────────────────────────────────`);
  console.log(`   Patched : ${ok}`);
  if (failed) console.log(`   Failed  : ${failed}`);
  if (dryRun)  console.log(`   (Dry run — nothing written to Sanity)`);
  console.log(`\nReview in Studio: http://localhost:3000/studio\n`);
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
