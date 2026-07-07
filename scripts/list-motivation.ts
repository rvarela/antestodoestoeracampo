#!/usr/bin/env tsx
/**
 * list-motivation.ts — read-only: cases by EGIF motivation code.
 *
 *   npx tsx scripts/list-motivation.ts --code=432
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
  const code = (process.argv.find((a) => a.startsWith("--code=")) || "--code=432").split("=")[1];
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  if (!projectId || !dataset) { console.error("Missing Sanity env"); process.exit(1); }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", useCdn: false });

  const rows = await client.fetch<Array<{ slug: string; title: string; hectares: number; hidden: boolean; catastroSignal?: number; urbanParcels?: number; status: string }>>(
    `*[_type=="case" && motivationCode==$code]{ "slug": slug.current, title, hectares, hidden, catastroSignal, urbanParcels, status } | order(hectares desc)`,
    { code }
  );
  console.log(`${rows.length} cases with motivationCode=${code}:\n`);
  for (const r of rows) {
    console.log(`  ${r.hidden ? "[hidden]" : "[LIVE]  "} ${String(Math.round(r.hectares)).padStart(6)} ha · señal ${String(r.catastroSignal ?? "—").padStart(4)} · urb ${String(r.urbanParcels ?? "—").padStart(5)} · ${r.status} · ${r.slug}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
