#!/usr/bin/env tsx
/**
 * research-queue-stats.ts — snapshot of the /research queue: counts by status,
 * confidence bands for pending links, and top pending cases by probable links.
 */

import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@sanity/client";

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
  caseSlug: string;
  status: string;
  isSearch?: boolean;
  confidence?: number;
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const client = createClient({ projectId: projectId!, dataset: dataset!, apiVersion: "2026-05-19", useCdn: false });

  const links = await client.fetch<LinkDoc[]>(
    `*[_type == "researchLink"]{ caseSlug, status, isSearch, confidence }`
  );

  const by = (xs: LinkDoc[], f: (l: LinkDoc) => string) => {
    const m = new Map<string, number>();
    for (const x of xs) { const k = f(x); m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  console.log(`\nResearch queue — ${links.length} links total\n`);
  console.log("By status:");
  for (const [k, n] of by(links, l => l.status ?? "?")) console.log(`  ${k.padEnd(10)} ${n}`);

  const pendingArticles = links.filter(l => l.status === "pending" && !l.isSearch);
  const pendingSearches = links.filter(l => l.status === "pending" && l.isSearch);
  console.log(`\nPending: ${pendingArticles.length} articles + ${pendingSearches.length} search leads`);

  const bands = by(pendingArticles, l => {
    const c = l.confidence ?? -1;
    return c >= 70 ? "≥70 (verde)" : c >= 45 ? "45–69 (ámbar)" : c >= 0 ? "<45 (rojo)" : "sin confianza";
  });
  console.log("\nPending articles by confidence:");
  for (const [k, n] of bands) console.log(`  ${k.padEnd(14)} ${n}`);

  const greens = pendingArticles.filter(l => (l.confidence ?? 0) >= 70);
  console.log("\nTop cases by pending verde (≥70) articles:");
  for (const [slug, n] of by(greens, l => l.caseSlug).slice(0, 15)) {
    console.log(`  ${slug.padEnd(48)} ${n}   http://localhost:3000/research/${slug}`);
  }
  console.log();
}

main().catch(err => { console.error(err); process.exit(1); });
