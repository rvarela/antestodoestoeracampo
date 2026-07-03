#!/usr/bin/env tsx
/**
 * remove-catastro-wfs-links.ts — one-off cleanup (2026-07-03).
 *
 * The raw Catastro INSPIRE WFS URL is a machine endpoint (returns GML/XML):
 * useless as a human research lead and worse as a public source. The
 * enrich:catastro pipeline queries it programmatically, and the case page
 * shows the findings with per-parcel Sede del Catastro links instead.
 *
 *   1. Deletes all researchLink docs with sourceType == "Catastro".
 *   2. Removes "src-catastro" / wfsCP-URL entries from case sources[].
 *
 *   npx tsx scripts/remove-catastro-wfs-links.ts [--dry-run]
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

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset || (!token && !DRY)) {
    console.error("Missing Sanity env (or SANITY_WRITE_TOKEN for a live run)");
    process.exit(1);
  }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", token, useCdn: false });

  // 1. Queue links
  const linkIds = await client.fetch<string[]>(
    `*[_type == "researchLink" && sourceType == "Catastro"][]._id`
  );
  console.log(`researchLink docs to delete: ${linkIds.length}`);
  if (!DRY) {
    for (let i = 0; i < linkIds.length; i += 50) {
      let tx = client.transaction();
      for (const id of linkIds.slice(i, i + 50)) tx = tx.delete(id);
      await tx.commit();
    }
    console.log(`  deleted.`);
  }

  // 2. Legacy WFS sources on cases — fetch FULL sources array (Conventions:
  // never write back a projected fetch)
  const cases = await client.fetch<Array<{ _id: string; slug: string; sources: Array<{ _key: string; url?: string }> }>>(
    `*[_type == "case" && count(sources[url match "*wfsCP*"]) > 0]{ _id, "slug": slug.current, sources }`
  );
  console.log(`cases with a WFS source: ${cases.length}`);
  if (!DRY) {
    let tx = client.transaction();
    let pending = 0;
    for (const c of cases) {
      const filtered = c.sources.filter(s => !(s.url ?? "").includes("wfsCP"));
      tx = tx.patch(c._id, p => p.set({ sources: filtered }));
      pending++;
      if (pending >= 50) { await tx.commit(); tx = client.transaction(); pending = 0; }
    }
    if (pending) await tx.commit();
    console.log(`  sources cleaned.`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
