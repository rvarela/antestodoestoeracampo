#!/usr/bin/env tsx
/**
 * prune-hidden-case-links.ts — deletes PENDING researchLink docs whose case is
 * hidden. They're invisible in /research (index filters hidden == false) and
 * only consume Sanity free-tier quota. Reviewed links (approved/rejected) are
 * kept — their notes document why leads were accepted or discarded.
 *
 * If a case is later unhidden, the next research:seed / research:harvest /
 * research:cendoj run recreates its queue.
 *
 *   npx tsx scripts/prune-hidden-case-links.ts [--dry-run]
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
    console.error("Missing Sanity env");
    process.exit(1);
  }
  const client = createClient({ projectId, dataset, token: token ?? "", apiVersion: "2026-05-19", useCdn: false });

  const hiddenSlugs = new Set(await client.fetch<string[]>(`*[_type == "case" && hidden == true].slug.current`));
  const links = await client.fetch<Array<{ _id: string; caseSlug: string; status: string }>>(
    `*[_type == "researchLink" && status == "pending"]{ _id, caseSlug, status }`
  );
  const doomed = links.filter(l => hiddenSlugs.has(l.caseSlug));
  console.log(`pending links on hidden cases: ${doomed.length}${DRY ? " (dry run — nothing deleted)" : ""}`);
  if (DRY) return;

  let deleted = 0;
  let tx = client.transaction();
  let pending = 0;
  for (const l of doomed) {
    tx = tx.delete(l._id);
    deleted++; pending++;
    if (pending >= 100) { await tx.commit({ visibility: "async" }); tx = client.transaction(); pending = 0; process.stdout.write("."); }
  }
  if (pending) await tx.commit({ visibility: "async" });
  console.log(`\ndeleted ${deleted} pending links on hidden cases`);
}
main().catch(e => { console.error(e); process.exit(1); });
