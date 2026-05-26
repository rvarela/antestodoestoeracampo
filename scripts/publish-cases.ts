#!/usr/bin/env tsx
/**
 * publish-cases.ts
 *
 * Sets hidden: false on Sanity case documents, making them visible on the site.
 * Only touches cases that pass a minimum quality check (have excerpt + coordinates).
 *
 * Usage:
 *   npx tsx scripts/publish-cases.ts --dry-run              # preview
 *   npx tsx scripts/publish-cases.ts --slug=mijas-2022-2022290065
 *   npx tsx scripts/publish-cases.ts --slug=mijas-2022-2022290065 --slug=carnota-2013-2013150740
 *   npx tsx scripts/publish-cases.ts --min-urban=50         # publish all cached cases above threshold
 *   npx tsx scripts/publish-cases.ts --all                  # publish everything that passes quality check
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

interface CaseDoc {
  _id: string;
  slug: string;
  title: string;
  municipality: string;
  region: string;
  year: number;
  hectares: number;
  hidden: boolean;
  excerpt?: string;
  coordinates?: { lat: number; lng: number };
  timeline?: unknown[];
}

// ── Quality check ─────────────────────────────────────────────────────────────

interface QualityResult {
  pass: boolean;
  issues: string[];
}

function qualityCheck(doc: CaseDoc): QualityResult {
  const issues: string[] = [];
  if (!doc.excerpt)     issues.push("no excerpt");
  if (!doc.coordinates) issues.push("no coordinates");
  if (!doc.timeline?.length) issues.push("no timeline entries");
  return { pass: issues.length === 0, issues };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const rawArgs = process.argv.slice(2).filter(a => a.startsWith("--"));

  const args: Record<string, string[]> = {};
  for (const arg of rawArgs) {
    const [k, ...v] = arg.slice(2).split("=");
    if (!args[k]) args[k] = [];
    args[k].push(v.join("=") || "true");
  }

  const dryRun    = args["dry-run"]?.[0] === "true";
  const publishAll = args["all"]?.[0] === "true";
  const slugList  = args["slug"] ?? [];
  const minUrban  = args["min-urban"] ? parseInt(args["min-urban"][0]) : null;

  if (!publishAll && slugList.length === 0 && minUrban === null) {
    console.error("Specify at least one of: --slug=X, --min-urban=N, or --all");
    console.error("Add --dry-run to preview without writing.");
    process.exit(1);
  }

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

  // ── Resolve candidate slugs ───────────────────────────────────────────────

  let targetSlugs: string[] = slugList;

  if (minUrban !== null) {
    const CACHE_PATH = "scripts/data/catastro-cache.json";
    if (!existsSync(CACHE_PATH)) {
      console.error(`Cache not found: ${CACHE_PATH}. Run npm run enrich:catastro first.`);
      process.exit(1);
    }
    const cache = JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as Record<string, { parcels: Array<{ classification: string; modifiedYear: number | null }> }>;

    // Fetch fire years for all cached slugs so we can compute suspicious parcels
    const cachedSlugs = Object.keys(cache);
    const yearDocs = await client.fetch<Array<{ slug: string; year: number }>>(
      `*[_type == "case" && slug.current in $slugs]{ "slug": slug.current, year }`,
      { slugs: cachedSlugs }
    );
    const yearMap = new Map(yearDocs.map(d => [d.slug, d.year]));

    const fromCache = cachedSlugs.filter(slug => {
      const entry = cache[slug];
      const fireYear = yearMap.get(slug);
      if (!fireYear) return false;
      const urbanCount = entry.parcels.filter(p => {
        if (p.classification !== "urbano" || !p.modifiedYear) return false;
        const lag = p.modifiedYear - fireYear;
        return lag >= 1 && lag <= 15;
      }).length;
      return urbanCount >= minUrban;
    });

    // Merge with any explicit --slug args
    targetSlugs = [...new Set([...slugList, ...fromCache])];
  }

  // ── Fetch from Sanity ─────────────────────────────────────────────────────

  const query = targetSlugs.length > 0
    ? `*[_type == "case" && slug.current in $slugs]{ _id, "slug": slug.current, title, municipality, region, year, hectares, hidden, excerpt, coordinates, timeline }`
    : `*[_type == "case" && hidden == true]{ _id, "slug": slug.current, title, municipality, region, year, hectares, hidden, excerpt, coordinates, timeline }`;

  const docs = await client.fetch<CaseDoc[]>(
    query,
    targetSlugs.length > 0 ? { slugs: targetSlugs } : {}
  );

  // For --all, filter to hidden only (skip already published)
  const candidates = publishAll
    ? docs.filter(d => d.hidden)
    : docs;

  console.log(`\nPublish cases`);
  if (dryRun) console.log(`  Mode: DRY RUN (no writes)`);
  console.log(`  Candidates: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("  Nothing to publish.");
    return;
  }

  // ── Quality check + report ────────────────────────────────────────────────

  const passing: CaseDoc[] = [];
  const failing: Array<{ doc: CaseDoc; issues: string[] }> = [];

  for (const doc of candidates) {
    const { pass, issues } = qualityCheck(doc);
    if (pass) passing.push(doc);
    else failing.push({ doc, issues });
  }

  if (failing.length > 0) {
    console.log(`\n  Skipping ${failing.length} case(s) — quality check failed:`);
    for (const { doc, issues } of failing) {
      console.log(`    ✗ ${doc.slug.padEnd(52)} ${issues.join(", ")}`);
    }
  }

  if (passing.length === 0) {
    console.log("\n  No cases pass the quality check.");
    console.log("  Run: npm run patch:catastro to enrich cases first.");
    return;
  }

  console.log(`\n  Ready to publish (${passing.length}):\n`);
  console.log(`${"Slug".padEnd(52)} ${"Ha".padStart(7)}  ${"Year"}  Region`);
  console.log("─".repeat(90));
  for (const doc of passing) {
    const ha = doc.hectares?.toLocaleString("es-ES", { maximumFractionDigits: 0 }) ?? "?";
    console.log(
      `${doc.slug.padEnd(52)} ${ha.padStart(7)}  ${doc.year}  ${doc.region}`
    );
  }

  if (dryRun) {
    console.log(`\n[DRY RUN] Would set hidden: false on ${passing.length} case(s).`);
    console.log(`Re-run without --dry-run to publish.`);
    return;
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  console.log(`\nPublishing...`);
  let ok = 0, failed = 0;

  for (const doc of passing) {
    if (!doc.hidden) {
      console.log(`  ~ ${doc.slug} — already published, skipping`);
      continue;
    }
    try {
      await client.patch(doc._id).set({ hidden: false }).commit();
      console.log(`  ✓ ${doc.slug}`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${doc.slug}: ${msg}`);
      failed++;
    }
  }

  console.log(`\n── Summary ──────────────────────────────────────────`);
  console.log(`   Published: ${ok}`);
  if (failed) console.log(`   Failed:    ${failed}`);
  console.log(`\nSite will update within 60s (ISR revalidate: 60).`);
  if (ok > 0) console.log(`Check: https://antes-rvarelas-projects.vercel.app\n`);
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
