#!/usr/bin/env tsx
/**
 * check-dup-dates.ts — one-off: compare fire dates + coords within the
 * municipality+year duplicate groups found by triage-live-cases.ts.
 * Same date + same coords ⇒ duplicate EGIF rows; different dates ⇒ repeat burns.
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

interface Doc {
  slug: string;
  municipality: string;
  year: number;
  hectares: number;
  urbanParcels?: number;
  coordinates?: { lat: number; lng: number };
  timeline?: Array<{ date?: string; eventType?: string; title?: string; description?: string }>;
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const client = createClient({ projectId: projectId!, dataset: dataset!, apiVersion: "2026-05-19", useCdn: false });

  const docs = await client.fetch<Doc[]>(`
    *[_type == "case" && hidden != true]{
      "slug": slug.current, municipality, year, hectares, urbanParcels, coordinates, timeline
    }
  `);

  const groups = new Map<string, Doc[]>();
  for (const d of docs) {
    const k = `${d.municipality}|${d.year}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }

  for (const [key, members] of [...groups.entries()].sort()) {
    if (members.length < 2) continue;
    console.log(`\n── ${key} (${members.length} cases) ──`);
    for (const m of members.sort((a, b) => a.slug.localeCompare(b.slug))) {
      const fire = m.timeline?.find(t => t.eventType === "fire") ?? m.timeline?.[0];
      const coords = m.coordinates ? `${m.coordinates.lat.toFixed(4)},${m.coordinates.lng.toFixed(4)}` : "—";
      console.log(`  ${m.slug.padEnd(44)} ${String(m.hectares).padStart(6)}ha  urban=${String(m.urbanParcels ?? "—").padStart(4)}  fecha=${fire?.date ?? "?"}  ${coords}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
