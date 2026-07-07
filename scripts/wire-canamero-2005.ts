#!/usr/bin/env tsx
/**
 * wire-canamero-2005.ts — one-off: crono receipt for the Las Villuercas fire
 * (canamero-2005-2005100838, 9.901 ha) from the user-approved El País piece
 * (EFE, 22/07/2005; direct URL resolved via DuckDuckGo — the queue copy was a
 * Google News redirect). The consejero dates the Cañamero foco at «las 13.47»
 * — EGIF says 21/07/2005 13:47, exact to the minute.
 *
 *   npx tsx scripts/wire-canamero-2005.ts [--dry-run]
 */
import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@sanity/client";
import { timelineKeyForLink } from "../src/app/research/timeline-key";

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
const SLUG = "canamero-2005-2005100838";
const URL_DIRECT = "https://elpais.com/diario/2005/07/22/espana/1121983218_850215.html";

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset || (!token && !DRY)) { console.error("Missing Sanity env"); process.exit(1); }
  const client = createClient({ projectId, dataset, token: token ?? "", apiVersion: "2026-05-19", useCdn: false });

  const link = await client.fetch<{ _id: string } | null>(
    `*[_type=="researchLink" && caseSlug==$slug && label match "*Evacuadas 1.000 personas*"][0]{ _id }`,
    { slug: SLUG }
  );
  if (!link) { console.error("link not found"); process.exit(1); }

  const doc = await client.fetch<{ _id: string; timeline?: any[] } | null>(
    `*[_type=="case" && slug.current==$slug][0]{ _id, timeline }`,
    { slug: SLUG }
  );
  if (!doc) { console.error(`${SLUG} not found`); process.exit(1); }

  const entry = {
    _key: timelineKeyForLink(link._id),
    date: "2005-07-21",
    title: "Cinco focos, nivel 2 y mil evacuados",
    description:
      "El fuego iniciado en Cañamero a las 13:47 — la hora exacta del parte EGIF de este caso — es uno de cinco focos simultáneos en Las Villuercas y Los Ibores; avanza hacia Guadalupe mientras arden también Alía y Castañar de Ibor. La Junta declara el nivel 2: unas 1.000 personas de Navalvillar de Ibor son evacuadas a Navalmoral de la Mata por la humareda y parte de los vecinos de Cañamero es desplazada dentro del pueblo. En la extinción: 22 medios aéreos, 23 retenes y 16 bulldozers. Sobre las causas, el consejero López Iniesta admite que los fuegos «podrían haber sido provocados» — EGIF los codificó como intencionados con «otras motivaciones conocidas».",
    type: "fire",
    sourceUrl: URL_DIRECT,
  };

  const timeline = (doc.timeline ?? []).filter((t: any) => t._key !== entry._key);
  const sortable = (d?: string) => (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(d ?? "") ? d! : null);
  let idx = timeline.length;
  for (let i = 0; i < timeline.length; i++) {
    const ed = sortable(timeline[i].date);
    if (ed && ed > entry.date) { idx = i; break; }
  }
  timeline.splice(idx, 0, entry);

  if (DRY) {
    console.log(`[dry-run] ${doc._id}: crono at ${idx}`);
    console.log(timeline.map((t: any) => `  ${t.date} · ${t.title?.slice(0, 60)}`).join("\n"));
    return;
  }

  // Upgrade the queue link from the Google News redirect to the direct URL
  await client.patch(link._id).set({
    url: URL_DIRECT,
    note:
      "ESTE incendio — EFE/El País 22/07/2005 (URL directa resuelta; antes redirect de Google News). El consejero data el foco de Cañamero «a las 13.47» = hora exacta del parte EGIF. Cinco focos (Cañamero→Guadalupe, Alía, Castañar de Ibor), nivel 2, 1.000 evacuados de Navalvillar de Ibor, «podrían haber sido provocados».",
  }).commit();
  await client.patch(doc._id).set({ timeline }).commit();
  console.log(`✓ ${SLUG}: link URL upgraded + crono 2005-07-21 («${entry.title}»)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
