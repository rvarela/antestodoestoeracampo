#!/usr/bin/env tsx
/**
 * check-unflagged-links.ts — one-off: inspect pending researchLinks that have
 * neither isSearch nor confidence. If they are search/results URLs they should
 * carry isSearch: true (else "Empujar aprobados" could push them to public sources).
 *
 *   npx tsx scripts/check-unflagged-links.ts            # inspect
 *   npx tsx scripts/check-unflagged-links.ts --fix      # set isSearch: true on confirmed search URLs
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

// URL shapes that are unambiguously search/results pages, mirroring seed-research-links.ts
const SEARCH_URL = /google\.[a-z.]+\/search|buscador|buscar|\bsearch\b|poderjudicial\.es|boe\.es\/buscar|hemeroteca|busqueda|maps\.google|google\.com\/maps|catastro\.meh\.es|sedecatastro/i;

interface LinkDoc {
  _id: string;
  caseSlug: string;
  label: string;
  url: string;
  sourceType?: string;
  status: string;
}

async function main() {
  const fix = process.argv.includes("--fix");
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  const client = createClient({ projectId: projectId!, dataset: dataset!, token: token ?? "", apiVersion: "2026-05-19", useCdn: false });

  const docs = await client.fetch<LinkDoc[]>(
    `*[_type == "researchLink" && !defined(isSearch) && !defined(confidence)]{ _id, caseSlug, label, url, sourceType, status }`
  );

  console.log(`\n${docs.length} links with neither isSearch nor confidence\n`);

  const searchLike: LinkDoc[] = [];
  const other: LinkDoc[] = [];
  for (const d of docs) (SEARCH_URL.test(d.url) ? searchLike : other).push(d);

  console.log(`Search-like URLs: ${searchLike.length}`);
  for (const d of searchLike.slice(0, 10)) console.log(`  ${d.caseSlug.padEnd(40)} ${d.label.padEnd(28)} ${d.url.slice(0, 70)}`);
  if (searchLike.length > 10) console.log(`  … +${searchLike.length - 10} more`);

  console.log(`\nNon-search URLs: ${other.length}`);
  for (const d of other) console.log(`  ${d.caseSlug.padEnd(40)} ${d.label.padEnd(28)} ${d.url.slice(0, 70)}`);

  if (fix && searchLike.length > 0) {
    if (!token) { console.error("\nMissing SANITY_WRITE_TOKEN"); process.exit(1); }
    console.log(`\nSetting isSearch: true on ${searchLike.length} links…`);
    let ok = 0;
    for (const d of searchLike) {
      await client.patch(d._id).set({ isSearch: true }).commit();
      ok++;
    }
    console.log(`✓ Patched ${ok}`);
  } else if (searchLike.length > 0) {
    console.log(`\nRun with --fix to set isSearch: true on the ${searchLike.length} search-like links.`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
