#!/usr/bin/env tsx
/**
 * triage-live-cases.ts
 *
 * Editorial triage of all LIVE (hidden != true) cases. Flags signals that make
 * a case weak or broken so review can focus on the worst offenders instead of
 * paging through Studio blind.
 *
 * Flags:
 *   PSEUDO-MUNI   municipality is an EGIF pseudo-entry (OTRA PROVINCIA, PORTUGAL, FRANCIA…)
 *   COORDS        missing or outside Spain bounds (same box as MapboxMap.isInSpain)
 *   NO-URBAN      urbanParcels missing or < 10 (below the publish gate signal)
 *   THIN          no overview, <2 timeline entries, or no sources
 *   CASING        title contains a mis-cased word ("Solana de ávila" style)
 *   DUP?          another live case shares municipality + year (may be legit)
 *   BLOCKED!      slug is in NEVER_PUBLISH but is live (should never happen)
 *
 * Usage:
 *   npx tsx scripts/triage-live-cases.ts            # report + CSV
 */

import { readFileSync, writeFileSync } from "fs";
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

// Keep in sync with publish-cases.ts
const NEVER_PUBLISH = new Set([
  "solana-de-avila-2003-2003050106",
  "carrascalejo-2006-2006100366",
  "otra-provincia-2004-2004410050",
  "alia-2005-2005100682",
  "otra-provincia-1998-1998252222",
  "otra-provincia-2003-2003170169",
  "otra-provincia-2004-2004410016",
  "otra-provincia-2010-2010030107",
  "otra-provincia-2012-2012300087",
  "otra-provincia-1999-1999090225",
  "otra-provincia-2008-2008390259",
  "otra-provincia-2011-2011320166",
  "otra-provincia-2011-2011322448",
  "tineo-1997-1997330983",       // EGIF-verified dup of tineo-1997-1997330972
  "tornavacas-1998-1998100909",  // EGIF-verified dup of tornavacas-1998-1998100549
]);

const PSEUDO_MUNI = /OTRA PROVINCIA|PORTUGAL|FRANCIA|ANDORRA|VARIOS MUNICIPIOS/i;

// Lowercase words that are correct in Spanish titles
const PARTICLES = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "o", "u", "en", "a", "al"]);

interface LiveCase {
  _id: string;
  slug: string;
  title: string;
  municipality: string;
  region: string;
  year: number;
  hectares: number;
  status: string;
  urbanParcels?: number;
  coordinates?: { lat: number; lng: number };
  excerpt?: string;
  hasOverview: boolean;
  timelineCount: number;
  sourcesCount: number;
  connectionsCount: number;
  judicialCount: number;
}

function isInSpain(lat: number, lng: number) {
  return lat >= 26 && lat <= 44.5 && lng >= -22 && lng <= 5;
}

function badCasing(title: string): string | null {
  // Strip the " (1992)"-style suffix, split on spaces/hyphens
  const base = title.replace(/\s*\(\d{4}\)\s*$/, "");
  for (const segment of base.split(/[\s\-–]+/)) {
    const word = segment.replace(/[(),.]/g, "");
    if (!word) continue;
    if (PARTICLES.has(word)) continue;
    if (/^[a-záéíóúüñ]/.test(word)) return word;
  }
  return null;
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  if (!projectId || !dataset) {
    console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID or NEXT_PUBLIC_SANITY_DATASET");
    process.exit(1);
  }

  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", useCdn: false });

  const docs = await client.fetch<LiveCase[]>(`
    *[_type == "case" && hidden != true] | order(urbanParcels asc) {
      _id,
      "slug": slug.current,
      title,
      municipality,
      region,
      year,
      hectares,
      status,
      urbanParcels,
      coordinates,
      excerpt,
      "hasOverview": defined(overview) && count(overview) > 0,
      "timelineCount": count(timeline),
      "sourcesCount": count(sources),
      "connectionsCount": count(connections),
      "judicialCount": count(judicial),
    }
  `);

  console.log(`\nTriage — ${docs.length} live cases\n`);

  // municipality+year duplicate index
  const muniYear = new Map<string, number>();
  for (const d of docs) {
    const k = `${d.municipality}|${d.year}`;
    muniYear.set(k, (muniYear.get(k) ?? 0) + 1);
  }

  const rows: Array<{ doc: LiveCase; flags: string[] }> = [];

  for (const d of docs) {
    const flags: string[] = [];
    if (NEVER_PUBLISH.has(d.slug)) flags.push("BLOCKED!");
    if (PSEUDO_MUNI.test(d.municipality) || PSEUDO_MUNI.test(d.title)) flags.push("PSEUDO-MUNI");
    if (!d.coordinates) flags.push("COORDS(missing)");
    else if (!isInSpain(d.coordinates.lat, d.coordinates.lng)) flags.push("COORDS(out-of-Spain)");
    if (d.urbanParcels == null) flags.push("NO-URBAN(missing)");
    else if (d.urbanParcels < 10) flags.push(`NO-URBAN(${d.urbanParcels})`);
    const thin: string[] = [];
    if (!d.hasOverview) thin.push("overview");
    if ((d.timelineCount ?? 0) < 2) thin.push("timeline<2");
    if ((d.sourcesCount ?? 0) === 0) thin.push("sources=0");
    if (thin.length) flags.push(`THIN(${thin.join(",")})`);
    const miscased = badCasing(d.title);
    if (miscased) flags.push(`CASING("${miscased}")`);
    if ((muniYear.get(`${d.municipality}|${d.year}`) ?? 0) > 1) flags.push("DUP?");
    if (flags.length) rows.push({ doc: d, flags });
  }

  // Severity: BLOCKED!/PSEUDO/COORDS first, then NO-URBAN, then the rest
  const severity = (flags: string[]) =>
    flags.some(f => f.startsWith("BLOCKED") || f.startsWith("PSEUDO") || f.startsWith("COORDS")) ? 0
    : flags.some(f => f.startsWith("NO-URBAN")) ? 1
    : 2;

  rows.sort((a, b) => severity(a.flags) - severity(b.flags) || (a.doc.urbanParcels ?? -1) - (b.doc.urbanParcels ?? -1));

  for (const { doc, flags } of rows) {
    const urban = doc.urbanParcels == null ? "—" : String(doc.urbanParcels);
    console.log(
      `${doc.slug.padEnd(52)} urban=${urban.padStart(5)}  tl=${doc.timelineCount ?? 0}  src=${doc.sourcesCount ?? 0}  ${flags.join(" ")}`
    );
  }

  console.log(`\n  Flagged: ${rows.length} / ${docs.length} live cases`);

  // Counts per flag family
  const families = new Map<string, number>();
  for (const { flags } of rows) {
    for (const f of flags) {
      const fam = f.split("(")[0];
      families.set(fam, (families.get(fam) ?? 0) + 1);
    }
  }
  console.log("\n  By flag:");
  for (const [fam, n] of [...families.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${fam.padEnd(14)} ${n}`);
  }

  // CSV for editorial review
  const csvRows = [
    "slug,title,municipality,region,year,hectares,urbanParcels,status,timeline,sources,connections,judicial,flags,url",
    ...rows.map(({ doc: d, flags }) =>
      [
        d.slug,
        `"${d.title.replace(/"/g, '""')}"`,
        `"${d.municipality}"`,
        `"${d.region}"`,
        d.year,
        d.hectares,
        d.urbanParcels ?? "",
        `"${d.status ?? ""}"`,
        d.timelineCount ?? 0,
        d.sourcesCount ?? 0,
        d.connectionsCount ?? 0,
        d.judicialCount ?? 0,
        `"${flags.join(" ")}"`,
        `https://antes-rvarelas-projects.vercel.app/casos/${d.slug}`,
      ].join(",")
    ),
  ];
  const out = "scripts/data/triage-live.csv";
  writeFileSync(out, "﻿" + csvRows.join("\n"), "utf-8");
  console.log(`\n  CSV → ${out}\n`);
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
