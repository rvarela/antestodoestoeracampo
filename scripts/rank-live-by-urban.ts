#!/usr/bin/env tsx
/**
 * rank-live-by-urban.ts — read-only spot-check worklist.
 * Lists LIVE cases ordered by urbanParcels desc, with the signals that matter
 * for an editorial read. No writes.
 *
 *   npx tsx scripts/rank-live-by-urban.ts [--limit=30]
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

const limit = Number((process.argv.find((a) => a.startsWith("--limit=")) || "--limit=30").split("=")[1]);

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  if (!projectId || !dataset) { console.error("Missing Sanity env"); process.exit(1); }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", useCdn: false });

  const rows = await client.fetch<any[]>(`
    *[_type == "case" && hidden != true] | order(urbanParcels desc) {
      "slug": slug.current, title, region, status,
      hectares, urbanParcels,
      "tl": count(timeline), "src": count(sources),
      "conn": count(connections), "jud": count(judicial)
    }`);

  const live = rows.length;
  console.log(`\nLIVE cases: ${live}   —   top ${Math.min(limit, live)} by urbanParcels\n`);
  console.log("urban  ha      tl src cn jd  status                slug");
  console.log("-----  ------  -- --- -- --  --------------------  ----");
  for (const r of rows.slice(0, limit)) {
    const u = String(r.urbanParcels ?? 0).padStart(5);
    const ha = String(r.hectares ?? 0).padStart(6);
    const tl = String(r.tl ?? 0).padStart(2);
    const src = String(r.src ?? 0).padStart(3);
    const cn = String(r.conn ?? 0).padStart(2);
    const jd = String(r.jud ?? 0).padStart(2);
    const st = String(r.status ?? "").slice(0, 20).padEnd(20);
    console.log(`${u}  ${ha}  ${tl} ${src} ${cn} ${jd}  ${st}  ${r.slug}`);
  }

  // quick aggregate
  const withUrban = rows.filter((r) => (r.urbanParcels ?? 0) > 0).length;
  const thin = rows.filter((r) => (r.src ?? 0) === 0 || (r.tl ?? 0) < 2).length;
  console.log(`\n${withUrban}/${live} have urbanParcels>0 · ${thin} look thin (no sources or <2 timeline)\n`);
}
main().catch((e) => { console.error(e); process.exit(1); });
