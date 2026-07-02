#!/usr/bin/env tsx
/**
 * fix-area-wording.ts — one-off. The auto-generated excerpt/overview copy said
 * the urban parcels sit "en la zona quemada" / "en el área afectada por el
 * incendio", but the Catastro query is a radius box around the fire coordinate,
 * not the burn perimeter (see /metodologia). Rewrites both to "el área analizada
 * en torno al incendio" and fixes the awkward "una modificación en hasta N años".
 *
 * Only touches the exact auto-generated phrasings — manual copy is left alone.
 * Overviews are fetched in full and written back whole (never a projection).
 *
 *   npx tsx scripts/fix-area-wording.ts [--dry-run]
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

const EXCERPT_OLD = "En la zona quemada, el Catastro registra";
const EXCERPT_NEW = "En el área analizada en torno al incendio, el Catastro registra";

function fixOverviewText(text: string): string {
  return text
    .replace(
      "parcelas modificadas en el área afectada por el incendio,",
      "parcelas modificadas en el área analizada en torno al incendio,"
    )
    .replace("Esto representa una modificación en hasta ", "Esto representa una modificación hasta ")
    .replace("como suelo urbano en la zona quemada,", "como suelo urbano en el área analizada,");
}

interface Block { _key?: string; children?: Array<{ text?: string; [k: string]: unknown }>; [k: string]: unknown; }
interface Doc { _id: string; slug: string; excerpt?: string; overview?: Block[]; }

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset) { console.error("Missing Sanity env"); process.exit(1); }
  if (!DRY && !token) { console.error("Missing SANITY_WRITE_TOKEN. Use --dry-run."); process.exit(1); }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", token, useCdn: false });

  const docs = await client.fetch<Doc[]>(
    `*[_type=="case" && (defined(excerpt) || count(overview[_key=="p-catastro"]) > 0)]{
      _id, "slug": slug.current, excerpt, overview
    }`
  );
  console.log(`Fetched ${docs.length} candidate cases`);

  let excerptFixed = 0, overviewFixed = 0, touched = 0, shown = 0;
  let tx = client.transaction();
  let pending = 0;
  for (const d of docs) {
    const patch: Record<string, unknown> = {};

    if (d.excerpt?.includes(EXCERPT_OLD)) {
      patch.excerpt = d.excerpt.replace(EXCERPT_OLD, EXCERPT_NEW);
      excerptFixed++;
    }

    const idx = d.overview?.findIndex((b) => b._key === "p-catastro") ?? -1;
    if (idx !== -1 && d.overview) {
      const block = d.overview[idx];
      const span = block.children?.[0];
      const old = span?.text ?? "";
      const next = fixOverviewText(old);
      if (next !== old) {
        const overview = [...d.overview];
        overview[idx] = { ...block, children: [{ ...span, text: next }] };
        patch.overview = overview;
        overviewFixed++;
      }
    }

    if (Object.keys(patch).length === 0) continue;
    touched++;
    if (DRY) {
      if (shown++ < 2) {
        console.log(`\n${d.slug}`);
        if (patch.excerpt) console.log(`  excerpt → ${patch.excerpt}`);
        if (patch.overview) console.log(`  overview → ${(patch.overview as Block[])[idx].children?.[0]?.text}`);
      }
      continue;
    }
    tx = tx.patch(d._id, (p) => p.set(patch));
    pending++;
    if (pending >= 100) { await tx.commit({ visibility: "async" }); tx = client.transaction(); pending = 0; process.stdout.write("."); }
  }
  if (!DRY && pending) await tx.commit({ visibility: "async" });

  console.log(`\n${DRY ? "[dry-run] " : ""}${touched} cases touched — ${excerptFixed} excerpts, ${overviewFixed} overview paragraphs`);
}
main().catch((e) => { console.error(e); process.exit(1); });
