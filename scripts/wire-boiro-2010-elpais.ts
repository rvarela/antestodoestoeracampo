#!/usr/bin/env tsx
/**
 * wire-boiro-2010-elpais.ts — one-off: user-found El País article (19/08/2010)
 * closing the arc of the Boiro 2010 detention.
 *
 * «El juez deja en libertad sin fianza al detenido por quemar el monte en
 * Boiro»: el juzgado de instrucción de Ribeira libera a Cándido L.L. (63,
 * vecino de la parroquia de Cures); solo se le imputó un fuego de 6 m² junto
 * a su casa — nunca hubo cargos por el gran incendio (~450 ha per prensa,
 * 498,71 ha EGIF). Él negó incluso ese fuego (declaró que lo apagaba). El
 * autor del incendio grande nunca fue identificado → CENDOJ vacío, coherente.
 *
 * Creates the manual approved researchLink (same shape as addManualLink) and
 * the timeline entry keyed via timelineKeyForLink so /research shows the
 * «✓ en cronología» chip. Idempotent.
 *
 *   npx tsx scripts/wire-boiro-2010-elpais.ts [--dry-run]
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
const SLUG = "boiro-2010-2010150552";
const URL = "https://elpais.com/elpais/2010/08/19/actualidad/1282205822_850215.html";
const LABEL =
  "El juez deja en libertad sin fianza al detenido por quemar el monte en Boiro - El País (19/08/2010)";

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset || (!token && !DRY)) { console.error("Missing Sanity env"); process.exit(1); }
  const client = createClient({ projectId, dataset, token: token ?? "", apiVersion: "2026-05-19", useCdn: false });

  const caseDoc = await client.fetch<{ _id: string; timeline?: any[] } | null>(
    `*[_type == "case" && slug.current == $slug][0]{ _id, timeline }`,
    { slug: SLUG }
  );
  if (!caseDoc) { console.error(`${SLUG} not found`); process.exit(1); }

  // Manual approved link — same deterministic id scheme as addManualLink
  let hash = 0;
  for (let i = 0; i < URL.length; i++) hash = (hash * 31 + URL.charCodeAt(i)) >>> 0;
  const linkId = `rl-${SLUG}-manual-${hash.toString(36)}`;

  const link = {
    _type: "researchLink",
    _id: linkId,
    case: { _type: "reference", _ref: caseDoc._id },
    caseSlug: SLUG,
    label: LABEL,
    url: URL,
    sourceType: "ElPais",
    isSearch: false,
    status: "approved",
    confidence: 100,
    note:
      "Aportado por el editor. Cierra el arco de la detención del 17/08: el juzgado de Ribeira lo dejó libre sin fianza; solo se le imputó un fuego de 6 m² junto a su casa (Cures) — nunca hubo cargos por el gran incendio. El autor del incendio de ~500 ha nunca fue identificado.",
  };

  const entry = {
    _key: timelineKeyForLink(linkId),
    date: "2010-08-19",
    title: "El detenido queda libre y sin cargos por el gran incendio",
    description:
      "El juzgado de instrucción de Ribeira deja en libertad sin fianza a Cándido L.L., el vecino de 63 años detenido dos días antes. Solo se le imputa un fuego de seis metros cuadrados junto a su casa, en la parroquia de Cures — en ningún momento se presentan cargos por el incendio que destruyó unas 450 hectáreas (498,7 ha según EGIF). Él niega incluso ese fuego: declara que estaba intentando apagarlo, versión que sostienen su familia y vecinos. El autor del gran incendio nunca fue identificado.",
    type: "judicial",
    sourceUrl: URL,
  };

  // Full timeline, replace ours by _key, insert chronologically (ISO-sortable only)
  const timeline = (caseDoc.timeline ?? []).filter((t: any) => t._key !== entry._key);
  const sortable = (d?: string) => (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(d ?? "") ? d! : null);
  let idx = timeline.length;
  for (let i = 0; i < timeline.length; i++) {
    const ed = sortable(timeline[i].date);
    if (ed && ed > entry.date) { idx = i; break; }
  }
  timeline.splice(idx, 0, entry);

  if (DRY) {
    console.log(`[dry-run] link ${linkId} + timeline entry at position ${idx} of ${timeline.length}`);
    console.log(timeline.map((t: any) => `  ${t.date} · ${t.title?.slice(0, 60)}`).join("\n"));
    return;
  }

  await client.createOrReplace(link);
  await client.patch(caseDoc._id).set({ timeline }).commit();
  console.log(`✓ ${SLUG}: El País link (approved) + crono entry 2010-08-19 («${entry.title}»)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
