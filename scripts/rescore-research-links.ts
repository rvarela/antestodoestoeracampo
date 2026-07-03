#!/usr/bin/env tsx
/**
 * rescore-research-links.ts
 *
 * One-off (idempotent) rescore of already-harvested *pending* research links
 * with the current heuristics in lib/research-scoring.ts:
 *
 *   - Google News links (rl-*-news-*): breaking-news headlines years after the
 *     case's fire are another fire in the same municipality → sink to 10%.
 *     pubYear + publisher are recovered from the stored note.
 *   - CENDOJ links (rl-*-cendoj-*): resoluciones from a court in a different
 *     CCAA are a homonymous municipality → sink to 15%.
 *
 * Approved / rejected links are never touched — only pending ones, and only
 * their `confidence` + `note` (status untouched), so the /research queue
 * re-sorts and the noise sinks.
 *
 * Usage:
 *   npm run research:rescore -- --dry-run          # report, write nothing
 *   npm run research:rescore                       # all pending harvested links
 *   npm run research:rescore -- --slug=acebo-2015-2015100515
 */

import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@sanity/client";
import {
  naturalMunicipality,
  scoreNewsItem,
  newsConfidencePct,
  newsNote,
  cendojConfidence,
  cendojNote,
} from "./lib/research-scoring";

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

interface LinkDoc {
  _id: string;
  caseSlug: string;
  label: string;
  note: string | null;
  confidence: number | null;
}

interface CaseInfo { municipality: string; year: number; region: string | null }

/** "Cosecha automática (Google News) · relevancia X · Publisher · 2026" */
function parseNewsNote(note: string | null): { publisher: string; pubYear: number | null } {
  const parts = (note ?? "").split(" · ").map(p => p.trim());
  let pubYear: number | null = null;
  let publisher = "—";
  for (const p of parts.slice(2)) {
    if (/^\d{4}$/.test(p)) { pubYear = parseInt(p); break; }
    if (!p.startsWith("relevancia") && !p.startsWith("⚠")) publisher = p;
  }
  return { publisher, pubYear };
}

function parseResolYear(note: string | null): number | null {
  const m = (note ?? "").match(/resolución (\d{4})/);
  return m ? parseInt(m[1]) : null;
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith("--"))
      .map(a => {
        const [k, ...v] = a.slice(2).split("=");
        return [k, v.length ? v.join("=") : "true"];
      })
  );
  const dryRun = args["dry-run"] === "true";
  const slugFilter = args["slug"] ?? null;

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset || (!token && !dryRun)) {
    console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID, NEXT_PUBLIC_SANITY_DATASET, or SANITY_WRITE_TOKEN");
    process.exit(1);
  }

  const client = createClient({
    projectId, dataset, token: token ?? "",
    apiVersion: "2026-05-19",
    useCdn: false,
  });

  console.log(`\nRescore pending research links`);
  if (dryRun) console.log(`  Mode: DRY RUN`);

  const cases = await client.fetch<Array<CaseInfo & { slug: string }>>(
    `*[_type == "case"]{ "slug": slug.current, municipality, year, region }`
  );
  const caseMap = new Map<string, CaseInfo>(cases.map(c => [c.slug, c]));

  const links = await client.fetch<LinkDoc[]>(
    slugFilter
      ? `*[_type == "researchLink" && status == "pending" && caseSlug == $slug && (_id match "rl-*-news-*" || _id match "rl-*-cendoj-*")]{ _id, caseSlug, label, note, confidence }`
      : `*[_type == "researchLink" && status == "pending" && (_id match "rl-*-news-*" || _id match "rl-*-cendoj-*")]{ _id, caseSlug, label, note, confidence }`,
    slugFilter ? { slug: slugFilter } : {}
  );
  console.log(`  Pending harvested links: ${links.length}\n`);

  let changed = 0, unchanged = 0, skipped = 0, sunk = 0;
  const wasHigh = links.filter(l => (l.confidence ?? 0) >= 70).length;
  let nowHigh = 0;
  const examples: string[] = [];

  const patches: Array<{ id: string; confidence: number; note: string }> = [];

  for (const link of links) {
    const c = caseMap.get(link.caseSlug);
    if (!c) { skipped++; continue; }

    let confidence: number;
    let note: string;

    if (link._id.includes("-news-")) {
      const { publisher, pubYear } = parseNewsNote(link.note);
      const score = scoreNewsItem(link.label, pubYear, naturalMunicipality(c.municipality), c.year);
      confidence = newsConfidencePct(score.score);
      note = newsNote(score, publisher, pubYear, c.year);
    } else {
      const resolYear = parseResolYear(link.note);
      const isSentencia = /^\s*S/.test(link.label);
      const score = cendojConfidence({ title: link.label, resolYear, isSentencia }, c.year, c.region);
      confidence = score.confidence;
      note = cendojNote(score, resolYear, c.year, c.region);
    }

    if (confidence >= 70) nowHigh++;
    if (confidence === link.confidence && note === link.note) { unchanged++; continue; }

    changed++;
    if ((link.confidence ?? 0) >= 70 && confidence < 45) {
      sunk++;
      if (examples.length < 15) {
        examples.push(`  ${link.confidence}% → ${confidence}%  [${link.caseSlug}] ${link.label.slice(0, 80)}`);
      }
    }
    patches.push({ id: link._id, confidence, note });
  }

  if (!dryRun && patches.length) {
    const CHUNK = 100;
    for (let i = 0; i < patches.length; i += CHUNK) {
      let tx = client.transaction();
      for (const p of patches.slice(i, i + CHUNK)) {
        tx = tx.patch(p.id, patch => patch.set({ confidence: p.confidence, note: p.note }));
      }
      await tx.commit();
      console.log(`  … committed ${Math.min(i + CHUNK, patches.length)}/${patches.length}`);
    }
  }

  console.log(`\n── Summary ──────────────────────────────────`);
  console.log(`   Changed:   ${changed}${dryRun ? " (dry run — nothing written)" : ""}`);
  console.log(`   Unchanged: ${unchanged}`);
  if (skipped) console.log(`   Skipped:   ${skipped} (case doc not found)`);
  console.log(`   ≥70% confidence: ${wasHigh} → ${nowHigh}`);
  if (examples.length) {
    console.log(`\n   Sunk from ≥70% to <45% (${sunk} total):`);
    examples.forEach(e => console.log(e));
  }
  console.log(`\nReview: http://localhost:3000/research (orden por confianza)\n`);
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
