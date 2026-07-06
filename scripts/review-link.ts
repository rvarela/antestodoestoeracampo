#!/usr/bin/env tsx
/**
 * review-link.ts — one-command verdict for research links (all pending copies).
 *
 * Finds researchLink docs by a label/URL fragment (e.g. a ROJ or ECLI), and
 * sets status + confidence + note on every PENDING copy across all cases.
 * Reviewed links are never touched. The note travels via $env:REVIEW_NOTE to
 * dodge PowerShell 5.1 quoting of Spanish text.
 *
 *   $env:REVIEW_NOTE = '⚠ Otro incendio — ...'
 *   npx tsx scripts/review-link.ts --find="SAP O 1690/2026" --status=rejected [--confidence=10] [--slug=X] [--dry-run]
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
      .map(a => {
        const [k, ...v] = a.slice(2).split("=");
        return [k, v.length ? v.join("=") : "true"];
      })
  );
  const find = args["find"];
  const status = args["status"];
  const slug = args["slug"] ?? null;
  const dryRun = args["dry-run"] === "true";
  const confidence = args["confidence"]
    ? parseInt(args["confidence"])
    : status === "rejected" ? 10 : 100;
  const note = process.env.REVIEW_NOTE ?? null;

  if (!find || !["rejected", "approved"].includes(status ?? "")) {
    console.error(`Usage: $env:REVIEW_NOTE='...'; npx tsx scripts/review-link.ts --find="SAP X 99/2026" --status=rejected|approved [--confidence=N] [--slug=X] [--dry-run]`);
    process.exit(1);
  }

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset || (!token && !dryRun)) {
    console.error("Missing Sanity env");
    process.exit(1);
  }
  const client = createClient({ projectId, dataset, token: token ?? "", apiVersion: "2026-05-19", useCdn: false });

  const links = await client.fetch<Array<{ _id: string; caseSlug: string; status: string; label: string }>>(
    `*[_type == "researchLink" && (label match $m || url match $m)${slug ? " && caseSlug == $slug" : ""}]{ _id, caseSlug, status, label }`,
    { m: `*${find}*`, ...(slug ? { slug } : {}) }
  );
  if (!links.length) {
    console.log(`no links match "${find}"${slug ? ` on ${slug}` : ""}`);
    return;
  }
  console.log(`${links.length} match(es) for "${find}":`);
  for (const l of links) {
    if (l.status !== "pending") {
      console.log(`  [${l.status} — untouched] ${l.caseSlug} · ${l.label.slice(0, 60)}`);
      continue;
    }
    if (dryRun) {
      console.log(`  [dry-run → ${status}] ${l.caseSlug} · ${l.label.slice(0, 60)}`);
      continue;
    }
    await client.patch(l._id).set({ status, confidence, ...(note ? { note } : {}) }).commit();
    console.log(`  → ${status} on ${l.caseSlug}`);
  }
  if (!note) console.log(`  (sin nota — set $env:REVIEW_NOTE to document the verdict)`);
}
main().catch(e => { console.error(e); process.exit(1); });
