#!/usr/bin/env tsx
/**
 * restore-from-history.ts — one-off: restore fire-0 date/description for the
 * 5 index-slug cases from their last intact Sanity history revision.
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

// slug → revision timestamp where fire-0 was still intact (see probe-history.ts)
const RESTORE_AT: Record<string, string> = {
  "nigran-2001-0001":              "2026-06-11T06:00:00Z",
  "lliria-2019-0002":              "2026-06-11T06:00:00Z",
  "artes-2022-0005":               "2026-06-11T06:00:00Z",
  "baldomar-2019-0006":            "2026-05-22T00:00:00Z",
  "sant-julia-de-ramis-2022-0007": "2026-05-22T00:00:00Z",
};

interface TimelineEntry { _key: string; type?: string; date?: string; description?: string; [k: string]: unknown }

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET!.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN!;
  const client = createClient({ projectId, dataset, token, apiVersion: "2026-05-19", useCdn: false });

  const docs = await client.fetch<Array<{ _id: string; slug: string; timeline: TimelineEntry[] }>>(
    `*[_type == "case" && slug.current in ${JSON.stringify(Object.keys(RESTORE_AT))}]{ _id, "slug": slug.current, timeline }`
  );

  for (const doc of docs) {
    const time = RESTORE_AT[doc.slug];
    const url = `https://${projectId}.api.sanity.io/v2026-05-19/data/history/${dataset}/documents/${encodeURIComponent(doc._id)}?time=${encodeURIComponent(time)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { console.error(`✗ ${doc.slug}: history HTTP ${res.status}`); continue; }
    const body = await res.json() as { documents: Array<{ timeline?: TimelineEntry[] }> };
    const oldFire = body.documents?.[0]?.timeline?.find(t => t.type === "fire");
    if (!oldFire?.date || !oldFire?.description) { console.error(`✗ ${doc.slug}: revision has no intact fire entry`); continue; }

    const timeline = doc.timeline.map(entry =>
      entry.type === "fire"
        ? { ...entry, date: oldFire.date, description: oldFire.description }
        : entry
    );
    await client.patch(doc._id).set({ timeline }).commit();
    console.log(`✓ ${doc.slug} — fire-0 restored from ${time} (date=${oldFire.date})`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
