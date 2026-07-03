#!/usr/bin/env tsx
/**
 * harvest-research-results.ts
 *
 * Pulls *specific* press articles per case from Google News RSS and creates
 * one pending researchLink per article — so editorial review approves real
 * documents, not search pages.
 *
 * Relevance is scored heuristically (see lib/research-scoring.ts: municipality
 * in title, "incendio", contemporary vs late publication date, breaking-news
 * vocabulary years later = another fire) and written into the note as
 * "probable / posible / dudosa". Items are deduped by URL hash, and re-runs
 * never reset the status of already-reviewed items (createIfNotExists).
 *
 * Usage:
 *   npm run research:harvest                      # all published cases
 *   npm run research:harvest -- --slug=mijas-2022-2022290065
 *   npm run research:harvest -- --dry-run --limit=5
 *   npm run research:harvest -- --max-items=10    # per case (default 8)
 */

import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@sanity/client";
import {
  naturalMunicipality,
  scoreNewsItem,
  newsRelevanceLabel,
  newsConfidencePct,
  newsNote,
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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function decodeEntities(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'");
}

function urlHash(url: string) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

// ── RSS ───────────────────────────────────────────────────────────────────────

interface NewsItem {
  title: string;
  url: string;
  publisher: string;
  pubYear: number | null;
}

async function fetchNews(municipality: string): Promise<NewsItem[]> {
  const q = encodeURIComponent(`"incendio" "${municipality}"`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=es&gl=ES&ceid=ES:es`;
  const res = await fetch(url, {
    headers: { "User-Agent": "antestodoestoeracampo.es research tool" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const xml = await res.text();

  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const title = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").trim();
    const link = decodeEntities(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";
    const source = decodeEntities(block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "").trim();
    if (!title || !link) continue;
    const year = pubDate ? new Date(pubDate).getFullYear() : NaN;
    items.push({
      title,
      url: link,
      publisher: source || "—",
      pubYear: Number.isFinite(year) ? year : null,
    });
  }
  return items;
}

// Relevance heuristic lives in ./lib/research-scoring (shared with the
// rescore pass so harvest-time and rescored confidences can't drift).

// ── Main ──────────────────────────────────────────────────────────────────────

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
  const limit = args["limit"] ? parseInt(args["limit"]) : Infinity;
  const maxItems = args["max-items"] ? parseInt(args["max-items"]) : 8;

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

  console.log(`\nHarvest research results (Google News RSS)`);
  if (dryRun) console.log(`  Mode: DRY RUN`);

  const cases = await client.fetch<Array<{
    _id: string; slug: string; municipality: string; year: number;
  }>>(
    slugFilter
      ? `*[_type == "case" && hidden == false && slug.current == $slug]{ _id, "slug": slug.current, municipality, year }`
      : `*[_type == "case" && hidden == false]{ _id, "slug": slug.current, municipality, year }`,
    slugFilter ? { slug: slugFilter } : {}
  );

  console.log(`  Cases: ${Math.min(cases.length, limit)}\n`);

  let created = 0, existing = 0, failed = 0;

  for (const doc of cases.slice(0, limit)) {
    const muni = naturalMunicipality(doc.municipality);
    let items: NewsItem[];
    try {
      items = await fetchNews(muni);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${doc.slug}: ${msg}`);
      failed++;
      await sleep(1500);
      continue;
    }

    const ranked = items
      .map(i => ({ ...i, ...scoreNewsItem(i.title, i.pubYear, muni, doc.year) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxItems);

    if (dryRun) {
      console.log(`  [DRY RUN] ${doc.slug} — ${ranked.length} items`);
      ranked.forEach(i =>
        console.log(`    [${i.score}|${newsRelevanceLabel(i.score)}${i.otherFire ? "|otro incendio" : ""}] ${i.title.slice(0, 90)}`)
      );
      await sleep(1500);
      continue;
    }

    // Know up front which items already exist (and whether they have a
    // confidence value) — timestamps can't distinguish created from existing.
    const existingDocs = await client.fetch<Array<{ _id: string; confidence?: number }>>(
      `*[_type == "researchLink" && caseSlug == $slug && _id match "rl-*-news-*"]{ _id, confidence }`,
      { slug: doc.slug }
    );
    const existingMap = new Map(existingDocs.map(d => [d._id, d.confidence]));

    let newForCase = 0;
    for (const item of ranked) {
      const id = `rl-${doc.slug}-news-${urlHash(item.url)}`;
      const confidence = newsConfidencePct(item.score);
      try {
        if (existingMap.has(id)) {
          existing++;
          // Backfill confidence on docs harvested before the field existed
          if (existingMap.get(id) == null) {
            await client.patch(id).set({ confidence }).commit();
          }
          continue;
        }
        await client.create({
          _type: "researchLink",
          _id: id,
          case: { _type: "reference", _ref: doc._id },
          caseSlug: doc.slug,
          label: item.title,
          url: item.url,
          sourceType: "Prensa",
          isSearch: false,
          status: "pending",
          confidence,
          note: newsNote(item, item.publisher, item.pubYear, doc.year),
        });
        created++; newForCase++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ ${id}: ${msg}`);
        failed++;
      }
    }
    console.log(`  ✓ ${doc.slug} — ${newForCase} nuevos de ${ranked.length}`);
    await sleep(1500); // be polite to Google News
  }

  console.log(`\n── Summary ──────────────────────────────────`);
  console.log(`   Created:  ${created}`);
  console.log(`   Existing: ${existing} (already harvested)`);
  if (failed) console.log(`   Failed:   ${failed}`);
  console.log(`\nReview: http://localhost:3000/research\n`);
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
