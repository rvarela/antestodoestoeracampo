#!/usr/bin/env tsx
/**
 * list-links.ts — read-only: research links of a case (label, status, URL).
 *
 *   npx tsx scripts/list-links.ts --slug=X [--find=fragment] [--docs-only]
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

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith("--"))
      .map(a => { const [k, ...v] = a.slice(2).split("="); return [k, v.length ? v.join("=") : "true"]; })
  );
  const slug = args["slug"];
  const find = args["find"] ?? null;
  const docsOnly = args["docs-only"] === "true";
  if (!slug) { console.error("Usage: npx tsx scripts/list-links.ts --slug=X [--find=fragment] [--docs-only]"); process.exit(1); }

  const client = createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!.replace(/["']/g, ""),
    apiVersion: "2026-05-19",
    useCdn: false,
  });

  const links = await client.fetch<any[]>(
    `*[_type=="researchLink" && caseSlug==$slug${docsOnly ? " && isSearch != true" : ""}${find ? " && (label match $m || url match $m)" : ""}]
      | order(status asc, confidence desc){ status, confidence, isSearch, sourceType, label, url, note }`,
    { slug, ...(find ? { m: `*${find}*` } : {}) }
  );
  console.log(`${links.length} link(s) on ${slug}${find ? ` matching "${find}"` : ""}:\n`);
  for (const l of links) {
    console.log(`[${l.status}${l.isSearch ? " · búsqueda" : ""} ${String(l.confidence ?? "—").padStart(3)}%] (${l.sourceType}) ${l.label}`);
    console.log(`    ${l.url}`);
    if (l.note) console.log(`    nota: ${l.note.slice(0, 180)}`);
    console.log();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
