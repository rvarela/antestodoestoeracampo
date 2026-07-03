#!/usr/bin/env tsx
/**
 * fix-timeline-order.ts — one-off (idempotent) chronological sort of case
 * timelines. Session-14's timeline restore + patch:catastro appends left many
 * cases with the fire-0 entry AFTER the Catastro entry (public pages showed
 * 2017 before the 2016 fire).
 *
 * Only timelines where EVERY entry has a machine-sortable date (ISO or year)
 * are touched — free-text dates ("Agosto 1992") keep their curated order.
 * Stable sort: same-date entries keep their relative order, except fire-0,
 * which is pinned first among entries sharing its date (the ignition leads).
 *
 *   npx tsx scripts/fix-timeline-order.ts --dry-run
 *   npx tsx scripts/fix-timeline-order.ts
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

interface Entry { _key: string; date?: string; [k: string]: unknown }

const sortable = (d?: string) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(d ?? "");

function sortTimeline(timeline: Entry[]): Entry[] | null {
  if (!timeline.every(e => sortable(e.date))) return null; // curated free-text dates — skip
  const sorted = [...timeline].sort((a, b) => {
    const cmp = (a.date ?? "").localeCompare(b.date ?? "");
    if (cmp !== 0) return cmp;
    if (a._key === "fire-0") return -1;
    if (b._key === "fire-0") return 1;
    return 0;
  });
  return sorted.some((e, i) => e._key !== timeline[i]._key) ? sorted : null;
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset || (!token && !DRY)) {
    console.error("Missing Sanity env (or SANITY_WRITE_TOKEN for a live run)");
    process.exit(1);
  }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", token, useCdn: false });

  // full timeline — never write back a projected fetch (Conventions)
  const cases = await client.fetch<Array<{ _id: string; slug: string; timeline?: Entry[] }>>(
    `*[_type == "case" && defined(timeline)]{ _id, "slug": slug.current, timeline }`
  );

  let changed = 0, ok = 0, skipped = 0;
  const samples: string[] = [];
  let tx = client.transaction();
  let pending = 0;

  for (const c of cases) {
    const t = c.timeline ?? [];
    if (t.length < 2) { ok++; continue; }
    const sorted = sortTimeline(t);
    if (sorted === null) {
      if (t.every(e => sortable(e.date))) ok++;
      else skipped++;
      continue;
    }
    changed++;
    if (samples.length < 12) {
      samples.push(`  ${c.slug}: [${t.map(e => e.date).join(" · ")}] → [${sorted.map(e => e.date).join(" · ")}]`);
    }
    if (!DRY) {
      tx = tx.patch(c._id, p => p.set({ timeline: sorted }));
      pending++;
      if (pending >= 100) { await tx.commit({ visibility: "async" }); tx = client.transaction(); pending = 0; process.stdout.write("."); }
    }
  }
  if (!DRY && pending) await tx.commit({ visibility: "async" });

  console.log(`\n${DRY ? "[dry-run] " : ""}timelines: ${changed} re-sorted · ${ok} already in order · ${skipped} skipped (free-text dates)`);
  if (samples.length) {
    console.log(`\nSamples:`);
    samples.forEach(s => console.log(s));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
