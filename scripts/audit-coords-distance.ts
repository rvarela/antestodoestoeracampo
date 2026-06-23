#!/usr/bin/env tsx
/**
 * audit-coords-distance.ts — refines audit-coordinates.ts by measuring the real
 * distance between a case's stored coordinate and a fresh geocode of its filed
 * municipality. Distance ignores spelling, so it kills the name-match false
 * positives (Galician "X, O" = "O X", S/Sta abbreviations, bilingual names).
 *
 * Reads the flagged slugs from scripts/data/coord-audit.txt and reports only
 * those genuinely far from where the municipality is.
 *
 *   npx tsx scripts/audit-coords-distance.ts [--km=20]
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { createClient } from "@sanity/client";

function loadEnvLocal() {
  try {
    const contents = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
    for (const line of contents.split("\n")) {
      const t = line.trim(); if (!t || t.startsWith("#")) continue;
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
const THRESH = Number((process.argv.find((a) => a.startsWith("--km=")) || "--km=20").split("=")[1]);

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// "STA EUFEMIA"→"Santa Eufemia", "S JUSTO"→"San Justo", "BOLO, O"→"O Bolo"
function cleanMuni(m: string): string {
  let s = m.trim();
  const tail = s.match(/,\s*(A|O|AS|OS|LA|EL|LAS|LOS|ELS|ELLS)\s*$/i);
  if (tail) s = `${tail[1]} ${s.slice(0, tail.index).trim()}`;
  return s.split(/\s+/).map((w) => {
    const u = w.toUpperCase();
    if (u === "S" || u === "S.") return "San";
    if (u === "STA" || u === "STA.") return "Santa";
    if (u === "STO" || u === "STO.") return "Santo";
    return w;
  }).join(" ");
}

// Province from "Muni, Province (YYYY)" titles; else null
function provinceFromTitle(title: string): string | null {
  const base = title.replace(/\s*\(.*\)\s*$/, "").trim();
  const parts = base.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : null;
}

async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=es`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const j = await res.json();
    return j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
  } catch { return null; }
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  if (!projectId || !dataset) { console.error("Missing Sanity env"); process.exit(1); }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", useCdn: false });

  const txt = readFileSync(path.join(process.cwd(), "scripts/data/coord-audit.txt"), "utf-8");
  const slugs = txt.split("\n").map((l) => l.match(/·\s+([a-z0-9-]+)\s*$/)?.[1]).filter(Boolean) as string[];

  const cases = await client.fetch<any[]>(
    `*[_type=="case" && slug.current in $slugs]{ "slug": slug.current, title, municipality, region, coordinates }`,
    { slugs }
  );
  console.log(`Re-checking ${cases.length} flagged cases by distance (threshold ${THRESH} km)…\n`);

  const results: { km: number; slug: string; title: string; muni: string; province: string; note: string }[] = [];
  for (const c of cases) {
    const province = provinceFromTitle(c.title) ?? c.region;
    const q = `${cleanMuni(c.municipality)}, ${province}, España`;
    const g = await geocode(q);
    await sleep(1100);
    if (!g) { results.push({ km: -1, slug: c.slug, title: c.title, muni: c.municipality, province, note: "geocode falló" }); continue; }
    const km = haversineKm(c.coordinates.lat, c.coordinates.lng, g.lat, g.lng);
    results.push({ km, slug: c.slug, title: c.title, muni: c.municipality, province, note: "" });
  }

  results.sort((a, b) => b.km - a.km);
  const real = results.filter((r) => r.km > THRESH);
  const fp = results.filter((r) => r.km >= 0 && r.km <= THRESH).length;
  const failed = results.filter((r) => r.km < 0);

  console.log(`──── ${real.length} REAL coordinate errors (>${THRESH} km from municipality) ────`);
  const lines: string[] = [];
  for (const r of real) {
    const line = `${r.km.toFixed(0).padStart(4)} km   ${r.title.padEnd(40)}  ${r.slug}`;
    console.log(line); lines.push(line);
  }
  if (failed.length) {
    console.log(`\n${failed.length} could not be geocoded (check manually): ${failed.map((f) => f.slug).join(", ")}`);
  }
  console.log(`\n${fp} of the 70 name-flags were false positives (same place, <${THRESH} km).`);
  writeFileSync(path.join(process.cwd(), "scripts/data/coord-errors.txt"), (real.map((r) => r.slug).join("\n")) + "\n");
  console.log(`Wrote ${real.length} real-error slugs to scripts/data/coord-errors.txt`);
}
main().catch((e) => { console.error(e); process.exit(1); });
