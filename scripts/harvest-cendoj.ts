#!/usr/bin/env tsx
/**
 * harvest-cendoj.ts
 *
 * Searches CENDOJ (buscador de jurisprudencia del Poder Judicial) per case and
 * creates one pending researchLink per resolución found — real documents with
 * órgano, fecha, ROJ and ECLI, not search pages.
 *
 * The buscador's backend (search.action) answers normal POSTs when sent with
 * browser-like headers and a session cookie — the session-7 "CAPTCHA wall"
 * only applies to bot-looking traffic. Be a polite client: one query per case,
 * 2.5s between requests.
 *
 * Relevance heuristic (lib/research-scoring.ts): resolución dated between the
 * fire year and +18 years scores high (criminal proceedings lag years behind
 * the fire); resoluciones BEFORE the fire, or from a court in a different
 * CCAA (homonymous municipality), are almost certainly another fire.
 *
 * Usage:
 *   npm run research:cendoj                      # all published cases
 *   npm run research:cendoj -- --slug=arenas-de-san-pedro-2009-2009050152
 *   npm run research:cendoj -- --dry-run --limit=5
 *   npm run research:cendoj -- --max-items=10    # per case (default 6)
 */

import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@sanity/client";
import { cendojConfidence, cendojRelevanceLabel, cendojNote } from "./lib/research-scoring";

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

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function titleCaseEs(s: string) {
  const minor = new Set(["de", "del", "la", "las", "el", "los", "y", "a", "en"]);
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && minor.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** EGIF "VICTORIA DE ACENTEJO, LA" → "La Victoria de Acentejo"; expand S/STA/STO abbreviations */
function naturalMunicipality(raw: string) {
  let s = raw.trim().replace(/\s*\(.*\)$/, "");
  const m = s.match(/^(.+?),\s*(la|el|los|las|l')$/i);
  if (m) s = `${m[2]} ${m[1]}`;
  s = s
    .replace(/^S\.?\s+/i, "SAN ")
    .replace(/^STA\.?\s+/i, "SANTA ")
    .replace(/^STO\.?\s+/i, "SANTO ");
  return titleCaseEs(s);
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&ntilde;/gi, "ñ")
    .replace(/&Aacute;/g, "Á").replace(/&Eacute;/g, "É").replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó").replace(/&Uacute;/g, "Ú").replace(/&Ntilde;/g, "Ñ")
    .replace(/&nbsp;/g, " ");
}

function urlHash(url: string) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

// ── CENDOJ search ─────────────────────────────────────────────────────────────

interface CendojHit {
  title: string;       // "STSJ Castilla y León, a 08 de septiembre de 2023 - ROJ: STSJ CL 3324/2023"
  url: string;         // openDocument permalink
  ecli: string | null;
  resolYear: number | null;
  isSentencia: boolean;
}

let sessionCookie: string | null = null;

async function getSession(): Promise<string> {
  if (sessionCookie) return sessionCookie;
  const res = await fetch("https://www.poderjudicial.es/search/indexAN.jsp", {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(30_000),
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  sessionCookie = cookies.map(c => c.split(";")[0]).join("; ");
  return sessionCookie;
}

async function fetchCendoj(municipality: string, recordsPerPage: number): Promise<CendojHit[]> {
  const cookie = await getSession();
  const body = new URLSearchParams({
    action: "query",
    sort: "IN_FECHARESOLUCION:decreasing",
    recordsPerPage: String(recordsPerPage),
    databasematch: "AN",
    start: "1",
    TEXT: `"incendio forestal" "${municipality}"`,
  });
  const res = await fetch("https://www.poderjudicial.es/search/search.action", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Accept": "*/*",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": "https://www.poderjudicial.es/search/indexAN.jsp",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Cookie": cookie,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) throw new Error(`CENDOJ HTTP ${res.status}`);
  const html = await res.text();
  if (html.includes("captcha") || html.includes("CAPTCHA")) throw new Error("CENDOJ served a CAPTCHA — back off");

  // One result = one <div class="title"> block; permalink + ECLI live inside it
  const hits: CendojHit[] = [];
  const chunks = html.split('<div class="title">').slice(1);
  for (const chunk of chunks) {
    const url = chunk.match(/data-link="(https:\/\/www\.poderjudicial\.es\/search\/AN\/openDocument\/[a-f0-9]+\/\d+)"/)?.[1];
    if (!url) continue;
    const text = decodeEntities(chunk.slice(0, 4000).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const title = text.match(/^(.{10,180}?ROJ:\s*[A-Z]+(?: [A-Z]+)? \d+\/\d+)/)?.[1] ?? text.slice(0, 140);
    const ecli = chunk.match(/ECLI:[A-Z]{2}:[A-Z0-9]+:\d{4}:\d+/)?.[0] ?? null;
    const resolYear = ecli ? parseInt(ecli.split(":")[3]) : null;
    const isSentencia = /^S/.test(title.trim());
    hits.push({ title, url, ecli, resolYear, isSentencia });
  }
  return hits;
}

// Relevance heuristic lives in ./lib/research-scoring: year window + sentencia
// bonus + court-territory check (an órgano from another CCAA = probable
// homonymous municipality → 15%).

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
  const maxItems = args["max-items"] ? parseInt(args["max-items"]) : 6;

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

  console.log(`\nHarvest CENDOJ (jurisprudencia per case)`);
  if (dryRun) console.log(`  Mode: DRY RUN`);

  const cases = await client.fetch<Array<{
    _id: string; slug: string; municipality: string; year: number; region: string | null;
  }>>(
    slugFilter
      ? `*[_type == "case" && hidden == false && slug.current == $slug]{ _id, "slug": slug.current, municipality, year, region }`
      : `*[_type == "case" && hidden == false]{ _id, "slug": slug.current, municipality, year, region }`,
    slugFilter ? { slug: slugFilter } : {}
  );

  console.log(`  Cases: ${Math.min(cases.length, limit)}\n`);

  let created = 0, existing = 0, failed = 0, noHits = 0;

  for (const doc of cases.slice(0, limit)) {
    const muni = naturalMunicipality(doc.municipality);
    let hits: CendojHit[];
    try {
      hits = await fetchCendoj(muni, 10);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${doc.slug}: ${msg}`);
      failed++;
      await sleep(5000);
      continue;
    }

    const ranked = hits
      .map(h => ({ ...h, ...cendojConfidence(h, doc.year, doc.region) }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxItems);

    if (ranked.length === 0) {
      noHits++;
      await sleep(2500);
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY RUN] ${doc.slug} (${muni}, ${doc.year}) — ${ranked.length} resoluciones`);
      ranked.forEach(h =>
        console.log(`    [${h.confidence}%|${cendojRelevanceLabel(h.confidence)}${h.territoryMismatch ? `|otra CCAA (${h.territory})` : ""}] ${h.title.slice(0, 100)}`)
      );
      await sleep(2500);
      continue;
    }

    const existingDocs = await client.fetch<Array<{ _id: string }>>(
      `*[_type == "researchLink" && caseSlug == $slug && _id match "rl-*-cendoj-*"]{ _id }`,
      { slug: doc.slug }
    );
    const existingIds = new Set(existingDocs.map(d => d._id));

    let newForCase = 0;
    for (const hit of ranked) {
      const id = `rl-${doc.slug}-cendoj-${urlHash(hit.url)}`;
      try {
        if (existingIds.has(id)) {
          existing++;
          continue;
        }
        await client.create({
          _type: "researchLink",
          _id: id,
          case: { _type: "reference", _ref: doc._id },
          caseSlug: doc.slug,
          label: hit.ecli ? `${hit.title} · ${hit.ecli}` : hit.title,
          url: hit.url,
          sourceType: "CENDOJ",
          isSearch: false,
          status: "pending",
          confidence: hit.confidence,
          note: cendojNote(hit, hit.resolYear, doc.year, doc.region),
        });
        created++;
        newForCase++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ ${doc.slug} (${id}): ${msg}`);
        failed++;
      }
    }

    console.log(`  ✓ ${doc.slug.padEnd(50)} ${String(ranked.length).padStart(2)} hits · ${newForCase} nuevos`);
    await sleep(2500);
  }

  console.log(`\n── Summary ──────────────────────────────────────────`);
  console.log(`   Created:   ${created}`);
  console.log(`   Existing:  ${existing} (status preserved)`);
  console.log(`   No hits:   ${noHits} case(s)`);
  if (failed) console.log(`   Failed:    ${failed}`);
  console.log(`\nReview: http://localhost:3000/research (orden por confianza)\n`);
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
