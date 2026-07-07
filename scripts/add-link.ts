#!/usr/bin/env tsx
/**
 * add-link.ts — add a hand-found document/article as an APPROVED research link
 * on one or more cases (same shape and deterministic id as the UI's
 * «Añadir resultado específico» form, so re-adding is a no-op).
 *
 * The note travels via $env:LINK_NOTE (PowerShell 5.1 mangles quoted/accented
 * args). Label via $env:LINK_LABEL for the same reason.
 *
 *   $env:LINK_LABEL = '«Titular» - Medio (DD/MM/YYYY)'
 *   $env:LINK_NOTE  = 'Por qué es relevante…'
 *   npx tsx scripts/add-link.ts --slug=a,b --url=https://… [--type=Prensa] [--dry-run]
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
  const DRY = args["dry-run"] === "true";
  const slugs = (args["slug"] ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const url = args["url"];
  const sourceType = args["type"] ?? "Prensa";
  const label = process.env.LINK_LABEL;
  const note = process.env.LINK_NOTE ?? "Resultado añadido manualmente desde la herramienta de investigación.";

  if (!slugs.length || !url || !/^https?:\/\//.test(url) || !label) {
    console.error(`Usage: $env:LINK_LABEL='…'; $env:LINK_NOTE='…'; npx tsx scripts/add-link.ts --slug=a[,b] --url=https://… [--type=Prensa|Sentencia|BOE|Otro] [--dry-run]`);
    process.exit(1);
  }

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset || (!token && !DRY)) { console.error("Missing Sanity env"); process.exit(1); }
  const client = createClient({ projectId, dataset, token: token ?? "", apiVersion: "2026-05-19", useCdn: false });

  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) >>> 0;

  for (const slug of slugs) {
    const caseId = await client.fetch<string | null>(
      `*[_type == "case" && slug.current == $slug][0]._id`, { slug }
    );
    if (!caseId) { console.error(`  ✗ ${slug}: case not found`); continue; }
    const id = `rl-${slug}-manual-${hash.toString(36)}`;
    if (DRY) { console.log(`  [dry-run] ${slug} ← ${id}`); continue; }
    await client.createOrReplace({
      _type: "researchLink",
      _id: id,
      case: { _type: "reference", _ref: caseId },
      caseSlug: slug,
      label,
      url,
      sourceType,
      isSearch: false,
      status: "approved",
      confidence: 100,
      note,
    });
    console.log(`  ✓ ${slug}: approved link added (${id})`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
