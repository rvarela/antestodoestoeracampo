#!/usr/bin/env tsx
/**
 * fix-title-casing.ts — one-off (idempotent) healing of case titles.
 *
 * Titles were seeded raw from EGIF, whose municipality casing varies by file:
 * "Minas De Riotinto" (capitalised preposition), "CASTILLO DE LAS GUARDAS"
 * (all caps), etc. Spanish never capitalises prepositions/articles inside a
 * toponym ("Minas de Riotinto", "Castillo de las Guardas"), but they DO stay
 * capitalised at the start of a comma segment ("Madroño, El" · "La Rioja" ·
 * "A Coruña" · "Santa Cruz de Tenerife").
 *
 * Only titles matching the seeded shape "<municipio>, <provincia> (<año>)"
 * are touched — custom titles are reported and skipped.
 *
 *   npx tsx scripts/fix-title-casing.ts --dry-run
 *   npx tsx scripts/fix-title-casing.ts
 */
import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@sanity/client";

function loadEnvLocal() {
  try {
    const contents = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
    for (const line of contents.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* none */ }
}
loadEnvLocal();

const DRY = process.argv.includes("--dry-run");

// Prepositions/articles never capitalised inside a Spanish/Galician/Catalan
// toponym (only when not the first word of their comma segment).
const MINOR = new Set([
  "de", "del", "la", "las", "el", "los", "y", "a", "en",
  "i", "do", "da", "dos", "das", "d'", "l'",
]);

function titleCaseSegment(segment: string): string {
  return segment
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => {
      if (i > 0 && MINOR.has(w)) return w;
      // apostrophe articles: "l'escala" → "L'Escala"
      const ap = w.match(/^([ld]')(.+)$/);
      if (ap) return ap[1].toUpperCase().slice(0, 1) + "'" + ap[2].charAt(0).toUpperCase() + ap[2].slice(1);
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/** "<municipio[, El]>, <provincia> (<año>)" → same shape, properly cased */
function fixTitle(title: string): string | null {
  const m = title.match(/^(.+), ([^,()]+) \((\d{4}|\?)\)$/);
  if (!m) return null; // custom title — skip
  const muni = m[1].split(",").map(titleCaseSegment).join(", ");
  const prov = titleCaseSegment(m[2]);
  return `${muni}, ${prov} (${m[3]})`;
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset || (!token && !DRY)) {
    console.error("Missing Sanity env (or SANITY_WRITE_TOKEN for a live run)");
    process.exit(1);
  }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", token, useCdn: false });

  const cases = await client.fetch<Array<{ _id: string; title: string }>>(
    `*[_type == "case"]{ _id, title }`
  );

  let changed = 0, unchanged = 0, skipped = 0;
  const samples: string[] = [];
  let tx = client.transaction();
  let pending = 0;

  for (const c of cases) {
    const fixed = fixTitle(c.title);
    if (fixed === null) { skipped++; console.log(`  ~ skipped (custom shape): ${c.title}`); continue; }
    if (fixed === c.title) { unchanged++; continue; }
    changed++;
    if (samples.length < 30) samples.push(`  "${c.title}" → "${fixed}"`);
    if (!DRY) {
      tx = tx.patch(c._id, p => p.set({ title: fixed }));
      pending++;
      if (pending >= 100) { await tx.commit({ visibility: "async" }); tx = client.transaction(); pending = 0; process.stdout.write("."); }
    }
  }
  if (!DRY && pending) await tx.commit({ visibility: "async" });

  console.log(`\n${DRY ? "[dry-run] " : ""}titles: ${changed} changed · ${unchanged} already correct · ${skipped} skipped (custom)`);
  if (samples.length) {
    console.log(`\nSample changes:`);
    samples.forEach(s => console.log(s));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
