#!/usr/bin/env tsx
/**
 * hide-cases.ts — editorial hide/unhide by slug. Sets `hidden` on the given
 * cases; reversible with --unhide.
 *
 *   npx tsx scripts/hide-cases.ts --slugs=a,b,c [--unhide] [--dry-run]
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
const UNHIDE = process.argv.includes("--unhide");
const slugsArg = (process.argv.find((a) => a.startsWith("--slugs=")) || "").split("=")[1] || "";
const slugs = slugsArg.split(",").map((s) => s.trim()).filter(Boolean);

async function main() {
  if (!slugs.length) { console.error("Usage: hide-cases.ts --slugs=a,b,c [--unhide] [--dry-run]"); process.exit(1); }
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset) { console.error("Missing Sanity env"); process.exit(1); }
  if (!DRY && !token) { console.error("Missing SANITY_WRITE_TOKEN. Use --dry-run."); process.exit(1); }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", token, useCdn: false });

  const docs = await client.fetch<{ _id: string; slug: string; title: string; hidden?: boolean }[]>(
    `*[_type=="case" && slug.current in $slugs]{ _id, "slug": slug.current, title, hidden }`,
    { slugs }
  );
  const bySlug = new Map(docs.map((d) => [d.slug, d]));

  const target = !UNHIDE;
  for (const slug of slugs) {
    const d = bySlug.get(slug);
    if (!d) { console.log(`  ? not found: ${slug}`); continue; }
    if ((d.hidden === true) === target) { console.log(`  = already ${target ? "hidden" : "visible"}: ${slug}`); continue; }
    if (DRY) { console.log(`  [dry] would set hidden:${target} — ${slug} (${d.title})`); continue; }
    await client.patch(d._id).set({ hidden: target }).commit();
    console.log(`  ✓ hidden:${target} — ${slug} (${d.title})`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
