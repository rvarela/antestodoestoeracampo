#!/usr/bin/env tsx
/**
 * audit-coordinates.ts — flags LIVE cases whose stored coordinates don't point
 * at the filed municipality (e.g. Frontera/El Hierro geocoded onto Tenerife).
 * Reverse-geocodes each unique coordinate via Nominatim and compares the place
 * found there against the case's municipality + region.
 *
 * Flags:
 *   REGION  reverse-geocoded CCAA differs from the case region (strong)
 *   MUNI    same region but the municipality name doesn't match (e.g. wrong island)
 *   SEA/?   nothing resolved at the coordinate (likely off-land / junk)
 *
 *   npx tsx scripts/audit-coordinates.ts          → report + scripts/data/coord-audit.txt
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { createClient } from "@sanity/client";

function loadEnvLocal() {
  try {
    const contents = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
    for (const line of contents.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("="); if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  } catch { /* none */ }
}
loadEnvLocal();

const UA = "antestodoestoeracampo.es/coord-audit (data@antestodoestoeracampo.es)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function norm(s: string): string {
  return (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .replace(/^(la|el|las|los|s\.c\.|santa cruz de)\s+/i, "").replace(/[^a-z0-9 ]/g, "").trim();
}
// loose: one contains the other (handles "Frontera" vs "La Frontera", "Vega de X" vs "X")
function looseMatch(a: string, b: string): boolean {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function reverse(lat: number, lng: number): Promise<any | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1&accept-language=es`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  if (!projectId || !dataset) { console.error("Missing Sanity env"); process.exit(1); }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", useCdn: false });

  const cases = await client.fetch<any[]>(
    `*[_type=="case" && hidden != true && defined(coordinates.lat)]{ "slug": slug.current, title, municipality, region, coordinates }`
  );

  // Dedupe by rounded coordinate (same centroid → one lookup)
  const byCoord = new Map<string, any[]>();
  for (const c of cases) {
    const key = `${c.coordinates.lat.toFixed(4)},${c.coordinates.lng.toFixed(4)}`;
    (byCoord.get(key) ?? byCoord.set(key, []).get(key)!).push(c);
  }
  console.log(`${cases.length} live cases · ${byCoord.size} unique coordinates to reverse-geocode (~${Math.ceil(byCoord.size * 1.1 / 60)} min)\n`);

  const flagged: { level: string; slug: string; title: string; muni: string; region: string; found: string }[] = [];
  let done = 0;
  for (const [key, group] of byCoord) {
    const [lat, lng] = key.split(",").map(Number);
    const r = await reverse(lat, lng);
    done++;
    if (done % 25 === 0) process.stdout.write(`  …${done}/${byCoord.size}\n`);
    await sleep(1100);

    const a = r?.address;
    const placeNames = a ? [a.village, a.town, a.city, a.municipality, a.county, a.city_district].filter(Boolean) : [];
    const state: string = a?.state ?? "";
    const display: string = r?.display_name ?? "";

    for (const c of group) {
      if (!a) { flagged.push({ level: "SEA/?", slug: c.slug, title: c.title, muni: c.municipality, region: c.region, found: "(sin resultado en tierra)" }); continue; }
      const regionOk = looseMatch(state, c.region) || norm(display).includes(norm(c.region));
      const muniOk = placeNames.some((p: string) => looseMatch(p, c.municipality));
      if (!regionOk) flagged.push({ level: "REGION", slug: c.slug, title: c.title, muni: c.municipality, region: c.region, found: `${placeNames[0] ?? "?"}, ${state || "?"}` });
      else if (!muniOk) flagged.push({ level: "MUNI", slug: c.slug, title: c.title, muni: c.municipality, region: c.region, found: `${placeNames.join(" / ") || "?"}, ${state}` });
    }
  }

  const order = { "REGION": 0, "SEA/?": 1, "MUNI": 2 } as Record<string, number>;
  flagged.sort((x, y) => (order[x.level] - order[y.level]) || x.region.localeCompare(y.region));

  console.log(`\n──── ${flagged.length} flagged of ${cases.length} ────`);
  const lines: string[] = [];
  for (const f of flagged) {
    const line = `[${f.level}] ${f.title}  ·  filed: ${f.muni} (${f.region})  →  coords resolve to: ${f.found}  ·  ${f.slug}`;
    console.log(line); lines.push(line);
  }
  writeFileSync(path.join(process.cwd(), "scripts/data/coord-audit.txt"), lines.join("\n") + "\n");
  const byLevel = flagged.reduce((m, f) => ((m[f.level] = (m[f.level] || 0) + 1), m), {} as Record<string, number>);
  console.log(`\nByLevel:`, byLevel, `\nWrote scripts/data/coord-audit.txt`);
}
main().catch((e) => { console.error(e); process.exit(1); });
