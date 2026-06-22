#!/usr/bin/env tsx
/**
 * restore-timeline-fields.ts
 *
 * Repairs timeline entries whose date/description were stripped by the
 * patch-catastro-to-sanity.ts projection bug (fetched timeline[]{_key,type,title}
 * and wrote the array back, dropping every other field on each run).
 *
 * Sources of truth:
 *   - fire-0 entries  → raw EGIF CSVs (scripts/data/Xlsx*.csv), matched by the
 *     NumeroParte embedded at the end of the slug; rebuilt with the same text
 *     as seed-from-egif.ts (hectares taken from the Sanity doc, which carries
 *     merged interprovincial totals)
 *   - benidorm-1992-0000 (Terra Mítica) → scripts/data/cases-timeline.csv
 *     (the manual import source)
 *
 * Usage:
 *   npx tsx scripts/restore-timeline-fields.ts --dry-run
 *   npx tsx scripts/restore-timeline-fields.ts
 */

import { readFileSync, readdirSync } from "fs";
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

// ── EGIF rows ─────────────────────────────────────────────────────────────────

interface EgifRow {
  detectado: string;
  extinguido: string;
  motivacion: string;
  year: number;
}

function loadEgifRows(): Map<string, EgifRow> {
  const map = new Map<string, EgifRow>();
  const files = readdirSync("scripts/data")
    .filter(f => f.startsWith("Xlsx") && f.endsWith(".csv"))
    .map(f => path.join("scripts/data", f));
  for (const file of files) {
    const raw = readFileSync(file, "latin1").replace(/^﻿/, "");
    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
    for (const row of rows) {
      const id = (row["NumeroParte"] ?? "").trim();
      if (!id) continue;
      map.set(id, {
        detectado:  (row["Detectado"]  ?? "").trim(),
        extinguido: (row["Extinguido"] ?? "").trim(),
        motivacion: (row["Motivacion"] ?? "").trim(),
        year:       parseInt(row["Campania"] ?? "0") || 0,
      });
    }
  }
  return map;
}

// ── Terra Mítica manual timeline ──────────────────────────────────────────────

interface CsvTimelineRow {
  slug: string;
  date: string;
  title: string;
  description: string;
  type: string;
}

function loadManualTimeline(): Map<string, CsvTimelineRow[]> {
  const map = new Map<string, CsvTimelineRow[]>();
  try {
    const raw = readFileSync("scripts/data/cases-timeline.csv", "utf-8").replace(/^﻿/, "");
    const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as CsvTimelineRow[];
    for (const row of rows) {
      if (!map.has(row.slug)) map.set(row.slug, []);
      map.get(row.slug)!.push(row);
    }
  } catch { /* no manual timeline csv */ }
  return map;
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface TimelineEntry {
  _key: string;
  type?: string;
  title?: string;
  date?: string;
  description?: string;
  [k: string]: unknown;
}

interface CaseDoc {
  _id: string;
  slug: string;
  year: number;
  hectares: number;
  timeline: TimelineEntry[];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

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

  console.log(`\nRestore timeline fields${dryRun ? " — DRY RUN" : ""}`);

  console.log("  Loading EGIF CSVs…");
  const egif = loadEgifRows();
  console.log(`  EGIF rows indexed: ${egif.size.toLocaleString("es-ES")}`);

  const manual = loadManualTimeline();
  console.log(`  Manual timeline cases: ${manual.size}`);

  const client = createClient({
    projectId, dataset, token: token ?? "",
    apiVersion: "2026-05-19",
    useCdn: false,
  });

  const docs = await client.fetch<CaseDoc[]>(`
    *[_type == "case" && count(timeline[!defined(date) || !defined(description)]) > 0]{
      _id, "slug": slug.current, year, hectares, timeline
    }
  `);

  console.log(`  Cases with stripped timeline entries: ${docs.length}\n`);

  let ok = 0, failed = 0, unresolved = 0;

  for (const doc of docs) {
    const manualRows = manual.get(doc.slug);
    const egifId = doc.slug.match(/-(\d{8,12})$/)?.[1];
    const egifRow = egifId ? egif.get(egifId) : undefined;
    const notes: string[] = [];
    let untouched = 0;

    const timeline = doc.timeline.map((entry, i) => {
      if (entry.date !== undefined && entry.description !== undefined) return entry;

      // Manual import case (Terra Mítica): match CSV rows by position among tl-* keys
      if (manualRows && /^tl-\d+$/.test(entry._key)) {
        const idx = parseInt(entry._key.slice(3), 10);
        const row = manualRows[idx];
        if (row && row.type === entry.type) {
          notes.push(`${entry._key}←csv`);
          return { ...entry, date: row.date, title: row.title, description: row.description };
        }
      }

      // Seeded fire entry: rebuild from the EGIF row (same text as seed-from-egif.ts)
      if (entry.type === "fire" && egifRow) {
        const description = [
          `${doc.hectares.toLocaleString("es-ES")} ha de superficie forestal calcinadas.`,
          egifRow.motivacion ? `Motivación registrada: ${egifRow.motivacion}.` : "",
          egifRow.extinguido ? `Extinguido: ${egifRow.extinguido}.` : "",
          `Ref. EGIF: ${egifId}.`,
        ].filter(Boolean).join(" ");
        notes.push(`${entry._key}←egif`);
        const isoMatch = egifRow.detectado.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        const iso = isoMatch ? `${isoMatch[3]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[1].padStart(2, "0")}` : null;
        return {
          ...entry,
          date: iso ?? String(egifRow.year || doc.year),
          description,
        };
      }

      untouched++;
      return entry;
    });

    if (untouched > 0) {
      console.log(`  ⚠ ${doc.slug} — ${untouched} entr${untouched === 1 ? "y" : "ies"} could not be resolved`);
      unresolved++;
    }

    if (notes.length === 0) continue;

    if (dryRun) {
      console.log(`  [DRY RUN] ${doc.slug} — ${notes.join(", ")}`);
      ok++;
      continue;
    }

    try {
      await client.patch(doc._id).set({ timeline }).commit();
      console.log(`  ✓ ${doc.slug} — ${notes.join(", ")}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${doc.slug}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n── Summary ──────────────────────────────────────────`);
  console.log(`   Restored:   ${ok}${dryRun ? " (dry run)" : ""}`);
  if (unresolved) console.log(`   Unresolved: ${unresolved} case(s) with entries needing manual review`);
  if (failed)     console.log(`   Failed:     ${failed}`);
  console.log();
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
