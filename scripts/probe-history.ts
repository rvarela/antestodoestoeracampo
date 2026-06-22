#!/usr/bin/env tsx
/**
 * probe-history.ts — one-off: check Sanity document history for the 5 cases
 * whose fire-0 entries can't be rebuilt from EGIF, to find a revision where
 * date/description still existed.
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

const SLUGS = [
  "nigran-2001-0001",
  "lliria-2019-0002",
  "artes-2022-0005",
  "baldomar-2019-0006",
  "sant-julia-de-ramis-2022-0007",
];

const TIMES = [
  "2026-06-12T08:00:00Z", // before today's patch run
  "2026-06-11T06:00:00Z", // before session 13
  "2026-06-10T06:00:00Z", // before session 12
  "2026-06-05T00:00:00Z",
  "2026-05-28T00:00:00Z", // before session 11
  "2026-05-22T00:00:00Z", // before session 7
];

interface TimelineEntry { _key: string; type?: string; date?: string; description?: string; title?: string }

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET!.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN!;
  const client = createClient({ projectId, dataset, token, apiVersion: "2026-05-19", useCdn: false });

  const ids = await client.fetch<Array<{ _id: string; slug: string }>>(
    `*[_type == "case" && slug.current in ${JSON.stringify(SLUGS)}]{ _id, "slug": slug.current }`
  );

  for (const { _id, slug } of ids) {
    console.log(`\n── ${slug} (${_id}) ──`);
    for (const time of TIMES) {
      const url = `https://${projectId}.api.sanity.io/v2026-05-19/data/history/${dataset}/documents/${encodeURIComponent(_id)}?time=${encodeURIComponent(time)}`;
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { console.log(`  ${time}  HTTP ${res.status}`); continue; }
        const body = await res.json() as { documents: Array<{ timeline?: TimelineEntry[] }> };
        const doc = body.documents?.[0];
        if (!doc) { console.log(`  ${time}  (no revision)`); continue; }
        const fire = doc.timeline?.find(t => t.type === "fire");
        if (!fire) { console.log(`  ${time}  no fire entry`); continue; }
        console.log(`  ${time}  date=${JSON.stringify(fire.date ?? null)}  desc=${fire.description ? `"${fire.description.slice(0, 60)}…"` : "—"}`);
      } catch (err) {
        console.log(`  ${time}  ERR ${err instanceof Error ? err.message : err}`);
      }
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
