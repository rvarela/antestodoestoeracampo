#!/usr/bin/env tsx
/**
 * patch-motivation.ts — writes the EGIF `Motivacion` field to each case.
 *
 * EGIF codes intentional fires with 31 motivations, including
 * «para obtener la modificación del uso del suelo» — the platform's thesis,
 * government-coded. The seed kept only cause=intencionado and dropped the
 * motivation; this re-reads the raw CSVs and backfills `motivation` on every
 * case whose _id carries the EGIF parte (egif-<NumeroParte>).
 *
 * `motivation` stores the short editorial label (src/lib/motivations.ts, by
 * code); `motivationCode` the numeric EGIF code. "-" / empty → fields unset.
 * Idempotent — only patches when the stored value differs.
 *
 *   npx tsx scripts/patch-motivation.ts --stats            # vocabulary report, no writes
 *   npx tsx scripts/patch-motivation.ts [--dry-run] [--slug=X]
 */
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { createClient } from "@sanity/client";
import { motivationShort } from "../src/lib/motivations";

function loadEnvLocal() {
  try {
    const contents = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
    for (const line of contents.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* none */ }
}
loadEnvLocal();

const DRY = process.argv.includes("--dry-run");
const STATS = process.argv.includes("--stats");
const onlySlug = (process.argv.find((a) => a.startsWith("--slug=")) || "").split("=")[1] || null;

const DATA_DIR = path.join(process.cwd(), "scripts/data");

const INTENTIONAL = new Set([
  "[400]  INTENCIONADO",
  "[400] INTENCIONADO",
  "INTENCIONADO",
  "INTENCIONAL",
  "3",
]);

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** "[541]  Venganzas" → { code: "541", text: "Venganzas" }; "-"/"" → null */
function cleanMotivation(raw: string): { code: string | null; text: string } | null {
  const trimmed = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed === "-") return null;
  const m = trimmed.match(/^\[(\d+)\]\s*(.*)$/);
  if (m) return m[2] ? { code: m[1], text: m[2] } : null;
  return { code: null, text: trimmed };
}

async function main() {
  // ── Read raw EGIF CSVs → parte → motivation ─────────────────────────────
  const csvFiles = readdirSync(DATA_DIR).filter((f) => /^Xlsx_.*\.csv$/i.test(f));
  if (!csvFiles.length) { console.error(`No Xlsx_*.csv files in ${DATA_DIR}`); process.exit(1); }

  const parseHa = (val: string) => parseFloat((val ?? "0").replace(",", "."));
  const byParte = new Map<string, { code: string | null; text: string } | null>();
  const vocab = new Map<string, { count: number; ha: number }>(); // seed universe: intentional ≥100ha

  for (const f of csvFiles) {
    const raw = readFileSync(path.join(DATA_DIR, f), "latin1").replace(/^﻿/, "");
    const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }) as Record<string, string>[];
    for (const row of rows) {
      const causa = String(row.Causa ?? "").trim().toUpperCase();
      if (!INTENTIONAL.has(causa)) continue;
      const parte = (row.NumeroParte ?? "").trim();
      if (!parte) continue;
      const mot = cleanMotivation(row.Motivacion ?? "");
      byParte.set(slugify(parte), mot);
      const ha = parseHa(row.SuperficieTotalForestal ?? "0");
      if (ha >= 100) {
        const key = mot ? `[${mot.code ?? "—"}] ${mot.text}` : "(sin motivación)";
        const v = vocab.get(key) ?? { count: 0, ha: 0 };
        v.count++; v.ha += ha;
        vocab.set(key, v);
      }
    }
    console.log(`  ${f}: acumulado ${byParte.size} partes intencionados`);
  }

  if (STATS) {
    console.log(`\nMotivaciones — incendios intencionados ≥100 ha (universo del seed):\n`);
    const sorted = [...vocab.entries()].sort((a, b) => b[1].count - a[1].count);
    for (const [key, v] of sorted) {
      console.log(`  ${String(v.count).padStart(5)}  ${Math.round(v.ha).toLocaleString("es-ES").padStart(10)} ha  ${key}`);
    }
    return;
  }

  // ── Fetch Sanity cases, match by EGIF parte in _id ──────────────────────
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_WRITE_TOKEN || process.env.SANITY_API_TOKEN;
  if (!projectId || !dataset) { console.error("Missing Sanity env"); process.exit(1); }
  if (!DRY && !token) { console.error("Missing write token. Use --dry-run to preview."); process.exit(1); }
  const client = createClient({ projectId, dataset, apiVersion: "2026-05-19", token, useCdn: false });

  const docs = await client.fetch<{ _id: string; slug: string; motivation?: string; hidden?: boolean }[]>(
    `*[_type=="case"]{ _id, "slug": slug.current, motivation, hidden }`
  );

  let patched = 0, unchanged = 0, noParte = 0, noMotivation = 0;
  let tx = client.transaction();
  let pending = 0;
  for (const doc of docs) {
    if (onlySlug && doc.slug !== onlySlug) continue;
    if (!doc._id.startsWith("egif-")) { noParte++; continue; }
    const mot = byParte.get(doc._id.slice(5));
    if (mot === undefined) { noParte++; continue; }        // parte not in CSVs
    if (mot === null) {                                     // EGIF has no motivation recorded
      noMotivation++;
      if (doc.motivation) {                                 // stale value → clear
        if (!DRY) { tx = tx.patch(doc._id, (p) => p.unset(["motivation", "motivationCode"])); pending++; }
        patched++;
      }
      continue;
    }
    const label = motivationShort(mot.code ?? undefined, mot.text);
    if (!label) { noMotivation++; continue; }
    if (doc.motivation === label) { unchanged++; continue; }
    if (DRY) {
      if (patched < 25) console.log(`  ${doc.slug}${!doc.hidden ? " [LIVE]" : ""}: "${label}" (${mot.code ?? "—"})`);
      patched++;
      continue;
    }
    tx = tx.patch(doc._id, (p) => p.set({ motivation: label, ...(mot.code ? { motivationCode: mot.code } : {}) }));
    patched++; pending++;
    if (pending >= 100) { await tx.commit({ visibility: "async" }); tx = client.transaction(); pending = 0; process.stdout.write("."); }
  }
  if (!DRY && pending) await tx.commit({ visibility: "async" });

  console.log(`\n${DRY ? "[dry-run] " : ""}motivation: ${patched} patched · ${unchanged} unchanged · ${noMotivation} sin motivación en EGIF · ${noParte} sin parte EGIF`);
}
main().catch((e) => { console.error(e); process.exit(1); });
