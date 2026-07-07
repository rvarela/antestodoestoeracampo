#!/usr/bin/env tsx
/**
 * add-link.ts — add a hand-found document/article as an APPROVED research link
 * on one or more cases (same shape and deterministic id as the UI's
 * «Añadir resultado específico» form, so re-adding is a no-op).
 *
 * The note travels via $env:LINK_NOTE (PowerShell 5.1 mangles quoted/accented
 * args). Label via $env:LINK_LABEL for the same reason.
 *
 *   $env:LINK_LABEL = '«Titular» - Medio (DD/MM/YYYY)'
 *   $env:LINK_NOTE  = 'Por qué es relevante…'
 *   npx tsx scripts/add-link.ts --slug=a,b --url=https://… [--type=Prensa] [--dry-run]
 *
 * Optional: also push a receipted timeline entry (deterministic key via
 * timelineKeyForLink, so re-runs replace; inserted chronologically):
 *   $env:CRONO_TITLE = 'Detenida la presunta autora'
 *   $env:CRONO_DESC  = 'Texto editorial del hecho…'
 *   … --crono-date=2022-09-13 [--crono-type=judicial]
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

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith("--"))
      .map(a => { const [k, ...v] = a.slice(2).split("="); return [k, v.length ? v.join("=") : "true"]; })
  );
  const DRY = args["dry-run"] === "true";
  const slugs = (args["slug"] ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const url = args["url"];
  const sourceType = args["type"] ?? "Prensa";
  const label = process.env.LINK_LABEL;
  const note = process.env.LINK_NOTE ?? "Resultado añadido manualmente desde la herramienta de investigación.";
  const cronoDate = args["crono-date"];
  const cronoType = args["crono-type"] ?? "other";
  const cronoTitle = process.env.CRONO_TITLE;
  const cronoDesc = process.env.CRONO_DESC ?? "";

  if (!slugs.length || !url || !/^https?:\/\//.test(url) || !label) {
    console.error(`Usage: $env:LINK_LABEL='…'; $env:LINK_NOTE='…'; npx tsx scripts/add-link.ts --slug=a[,b] --url=https://… [--type=Prensa|Sentencia|BOE|Otro] [--crono-date=YYYY-MM-DD --crono-type=judicial] [--dry-run]`);
    process.exit(1);
  }
  if (cronoDate && (!cronoTitle || !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(cronoDate))) {
    console.error("--crono-date needs ISO date (YYYY-MM-DD or YYYY) + $env:CRONO_TITLE");
    process.exit(1);
  }

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset || (!token && !DRY)) { console.error("Missing Sanity env"); process.exit(1); }
  const client = createClient({ projectId, dataset, token: token ?? "", apiVersion: "2026-05-19", useCdn: false });

  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) >>> 0;

  for (const slug of slugs) {
    // Full doc fetch (timeline unprojected — Conventions) even when only the id is needed
    const doc = await client.fetch<{ _id: string; timeline?: any[] } | null>(
      `*[_type == "case" && slug.current == $slug][0]{ _id, timeline }`, { slug }
    );
    if (!doc) { console.error(`  ✗ ${slug}: case not found`); continue; }
    const id = `rl-${slug}-manual-${hash.toString(36)}`;
    if (DRY) { console.log(`  [dry-run] ${slug} ← ${id}${cronoDate ? ` + crono ${cronoDate}` : ""}`); continue; }
    await client.createOrReplace({
      _type: "researchLink",
      _id: id,
      case: { _type: "reference", _ref: doc._id },
      caseSlug: slug,
      label,
      url,
      sourceType,
      isSearch: false,
      status: "approved",
      confidence: 100,
      note,
    });

    if (cronoDate && cronoTitle) {
      const entry = {
        _key: timelineKeyForLink(id),
        date: cronoDate,
        title: cronoTitle,
        description: cronoDesc,
        type: cronoType,
        sourceUrl: url,
      };
      const timeline = (doc.timeline ?? []).filter((t: any) => t._key !== entry._key);
      const sortable = (d?: string) => (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(d ?? "") ? d! : null);
      let idx = timeline.length;
      for (let i = 0; i < timeline.length; i++) {
        const ed = sortable(timeline[i].date);
        if (ed && ed > entry.date) { idx = i; break; }
      }
      timeline.splice(idx, 0, entry);
      await client.patch(doc._id).set({ timeline }).commit();
      console.log(`  ✓ ${slug}: approved link + crono ${cronoDate} («${cronoTitle}»)`);
    } else {
      console.log(`  ✓ ${slug}: approved link added (${id})`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
