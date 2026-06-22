#!/usr/bin/env tsx
/**
 * normalize-timeline-dates.ts
 *
 * One-time cleanup after the timeline restore (2026-06-12):
 *
 *   1. Timeline + judicial `date` strings "DD/MM/YYYY[ HH:MM:SS]" → ISO
 *      "YYYY-MM-DD" (the schema's documented convention; rendered es-ES by
 *      formatEventDate in the UI). Year-only and free-text dates untouched.
 *
 *   2. Regenerates the overview's auto-generated "p-fire" block with correct
 *      day-first date parsing — the original generation used new Date() on
 *      "11/08/1992"-style strings, which reads month-first and wrote wrong
 *      dates ("8 de noviembre de 1992") into overviews for any fire whose
 *      day was ≤ 12. Overviews without a "p-fire" key are left untouched.
 *
 * Usage:
 *   npx tsx scripts/normalize-timeline-dates.ts --dry-run
 *   npx tsx scripts/normalize-timeline-dates.ts
 */

import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@sanity/client";

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

// ── Date helpers (keep in sync with enrich-all-cases.ts / src/lib/dates.ts) ──

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "31/08/2000 17:00:00" → "2000-08-31"; returns null if not day-first DD/MM/YYYY */
function toIsoDate(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(\s|$)/);
  if (!m) return null;
  const mo = parseInt(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** ISO "1992-08-11" → "11 de agosto de 1992" */
function isoToLongEs(iso: string): string | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${parseInt(m[3])} de ${MONTHS_ES[parseInt(m[2]) - 1]} de ${m[1]}`;
}

const ES_MINOR_WORDS = new Set(["de", "del", "la", "las", "el", "los", "y", "o", "en", "a"]);

function titleCaseEs(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) =>
      i > 0 && ES_MINOR_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ");
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DatedEntry { _key: string; type?: string; date?: string; [k: string]: unknown }
interface OverviewBlock {
  _key?: string;
  children?: Array<{ _key?: string; text?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

interface CaseDoc {
  _id: string;
  slug: string;
  municipality: string;
  region: string;
  year: number;
  hectares: number;
  timeline?: DatedEntry[];
  judicial?: DatedEntry[];
  overview?: OverviewBlock[];
}

function makeFireParaText(doc: CaseDoc, fireDate?: string): string {
  const ha = doc.hectares.toLocaleString("es-ES", { maximumFractionDigits: 0 });
  const municipality = titleCaseEs(doc.municipality);
  const long = fireDate ? isoToLongEs(fireDate) : null;
  const lead = long
    ? `Incendio forestal de ${ha} hectáreas registrado el ${long} en ${municipality} (${doc.region}).`
    : `Incendio forestal de ${ha} hectáreas registrado en ${municipality} (${doc.region}) en el año ${doc.year}.`;
  return `${lead} El incendio está clasificado como intencionado en la Estadística General de Incendios Forestales (EGIF) del Ministerio para la Transición Ecológica.`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset   = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token     = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset) { console.error("Missing Sanity env vars"); process.exit(1); }
  if (!token && !dryRun)      { console.error("Missing SANITY_WRITE_TOKEN — use --dry-run"); process.exit(1); }

  const client = createClient({ projectId, dataset, token: token ?? "", apiVersion: "2026-05-19", useCdn: false });

  const docs = await client.fetch<CaseDoc[]>(`
    *[_type == "case"]{
      _id, "slug": slug.current, municipality, region, year, hectares,
      timeline, judicial, overview
    }
  `);

  console.log(`\nNormalize dates + fix p-fire paragraphs${dryRun ? " — DRY RUN" : ""}`);
  console.log(`  Cases fetched: ${docs.length}\n`);

  let patched = 0, datesFixed = 0, parasFixed = 0, failed = 0;

  for (const doc of docs) {
    const patch: Record<string, unknown> = {};
    const notes: string[] = [];

    // ── 1. Normalize dates ──
    const normalizeList = (entries?: DatedEntry[]) => {
      if (!entries?.length) return null;
      let changed = false;
      const next = entries.map(e => {
        if (!e.date) return e;
        const iso = toIsoDate(e.date);
        if (!iso || iso === e.date) return e;
        changed = true;
        return { ...e, date: iso };
      });
      return changed ? next : null;
    };

    const newTimeline = normalizeList(doc.timeline);
    if (newTimeline) { patch.timeline = newTimeline; notes.push("timeline dates"); }
    const newJudicial = normalizeList(doc.judicial);
    if (newJudicial) { patch.judicial = newJudicial; notes.push("judicial dates"); }

    // ── 2. Regenerate p-fire overview block ──
    const effectiveTimeline = (patch.timeline as DatedEntry[] | undefined) ?? doc.timeline;
    const fireEntry = effectiveTimeline?.find(t => t.type === "fire");
    const idx = doc.overview?.findIndex(b => b._key === "p-fire") ?? -1;
    if (doc.overview && idx !== -1) {
      const want = makeFireParaText(doc, fireEntry?.date);
      const current = doc.overview[idx].children?.map(s => s.text ?? "").join("") ?? "";
      if (current !== want) {
        const next = [...doc.overview];
        next[idx] = {
          ...next[idx],
          children: [{ _type: "span", _key: "p-fire-s", text: want, marks: [] }],
        };
        patch.overview = next;
        notes.push("p-fire para");
      }
    }

    if (Object.keys(patch).length === 0) continue;

    if (notes.includes("timeline dates") || notes.includes("judicial dates")) datesFixed++;
    if (notes.includes("p-fire para")) parasFixed++;

    if (dryRun) {
      if (patched < 10) console.log(`  [DRY RUN] ${doc.slug} — ${notes.join(", ")}`);
      patched++;
      continue;
    }

    try {
      await client.patch(doc._id).set(patch).commit();
      patched++;
      if (patched % 250 === 0) console.log(`  …${patched} patched`);
    } catch (err) {
      console.error(`  ✗ ${doc.slug}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n── Summary ──────────────────────────────────────────`);
  console.log(`   Patched:       ${patched}${dryRun ? " (dry run)" : ""}`);
  console.log(`   Dates fixed:   ${datesFixed} case(s)`);
  console.log(`   p-fire fixed:  ${parasFixed} case(s)`);
  if (failed) console.log(`   Failed:        ${failed}`);
  console.log();
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
