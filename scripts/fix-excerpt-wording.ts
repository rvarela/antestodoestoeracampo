#!/usr/bin/env tsx
/**
 * fix-excerpt-wording.ts — one-off. Rewrites auto-generated case excerpts that
 * still use the overclaiming phrasing ("N parcelas reclasificadas como suelo
 * urbano … el patrón … es consistente con los casos documentados") to the
 * honest version, preserving the parcel count and lag already in the text.
 *
 * patch-catastro-to-sanity.ts only writes the excerpt when it's MISSING, so it
 * could not heal these. (Its guard is now hardened too.) Only touches excerpts
 * matching the auto pattern — manual excerpts are left alone.
 *
 *   npx tsx scripts/fix-excerpt-wording.ts [--dry-run]
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

// Old auto-excerpt tail: "El análisis catastral detecta N parcelas reclasificadas
// como suelo urbano entre Y1 y Y2, (apenas|hasta) L años después del incendio.
// El patrón —incendio, recalificación, construcción— es consistente con los casos
// documentados en esta base de datos."
const TAIL = /El análisis catastral detecta ([\d.,]+) parcelas reclasificadas como suelo urbano entre \d{4} y \d{4}, (?:apenas|hasta) (\d+) años? después del incendio\. El patrón[^]*?base de datos\./;

function rewrite(excerpt: string): string | null {
  const m = excerpt.match(TAIL);
  if (!m) return null;
  const [, count, lag] = m;
  const honest =
    `En la zona quemada, el Catastro registra ${count} parcelas clasificadas como suelo urbano, ` +
    `con modificaciones hasta ${lag} años después. Señal para investigar, no prueba de recalificación.`;
  return excerpt.replace(TAIL, honest);
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset) { console.error("Missing Sanity env"); process.exit(1); }
  if (!DRY && !token) { console.error("Missing SANITY_WRITE_TOKEN. Use --dry-run."); process.exit(1); }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", token, useCdn: false });

  const docs = await client.fetch<{ _id: string; slug: string; excerpt: string }[]>(
    `*[_type=="case" && excerpt match "reclasificadas"]{ _id, "slug": slug.current, excerpt }`
  );

  let fixed = 0, unmatched = 0;
  let tx = client.transaction();
  let pending = 0, shown = 0;
  for (const d of docs) {
    const next = rewrite(d.excerpt);
    if (!next) { unmatched++; if (unmatched <= 5) console.log(`  ? no-match: ${d.slug}`); continue; }
    if (DRY) { if (shown++ < 3) console.log(`\n${d.slug}\n  OLD: ${d.excerpt}\n  NEW: ${next}`); fixed++; continue; }
    tx = tx.patch(d._id, (p) => p.set({ excerpt: next }));
    fixed++; pending++;
    if (pending >= 100) { await tx.commit({ visibility: "async" }); tx = client.transaction(); pending = 0; process.stdout.write("."); }
  }
  if (!DRY && pending) await tx.commit({ visibility: "async" });

  console.log(`\n${DRY ? "[dry-run] " : ""}${docs.length} excerpts matched "reclasificadas" → ${fixed} rewritten, ${unmatched} left unchanged (no auto pattern)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
