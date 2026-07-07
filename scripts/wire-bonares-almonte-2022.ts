#!/usr/bin/env tsx
/**
 * wire-bonares-almonte-2022.ts — one-off: the 25/07/2022 twin fires of
 * Bonares (573 ha EGIF / 600 press) and Almonte (913 ha EGIF / 1.100 press,
 * Doñana municipality; also touched Rociana del Condado) were declared
 * «zona gravemente afectada por una emergencia de protección civil» (zona
 * catastrófica) by the Consejo de Ministros on 23/08/2022, within the
 * national acuerdo covering 119 fires of summer 2022 (ABC 24/08/2022,
 * user-found).
 *
 * Wires the ABC receipt + ZAE crono entry into BOTH cases and unhides
 * almonte-2022 (recent-fire window + its twin is live + ZAE receipts).
 * Idempotent; full arrays per Conventions.
 *
 *   npx tsx scripts/wire-bonares-almonte-2022.ts [--dry-run]
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

const URL_ABC =
  "https://www.abc.es/espana/andalucia/huelva/areas-arrasadas-fuego-bonares-almonte-declaradas-zona-20220824113452-nts.html";

const ALMONTE_EXCERPT =
  "913 ha calcinadas en Almonte — el municipio de Doñana — el 25 de julio de 2022, la misma tarde que el fuego vecino de Bonares: 1.700 ha entre ambos, declarados zona catastrófica por el Consejo de Ministros. Incendio intencionado según EGIF; las investigaciones seguían abiertas.";

const CASES = [
  { slug: "bonares-2022-2022210075", unhide: false },
  { slug: "almonte-2022-2022210076", unhide: true },
];

function cronoDesc(slug: string): string {
  const twin =
    slug.startsWith("bonares")
      ? "600 ha en Bonares (100 de ellas agrícolas) y 1.100 ha en el vecino Almonte, alcanzando también Rociana del Condado"
      : "1.100 ha en Almonte y 600 ha en el vecino Bonares (100 de ellas agrícolas), alcanzando también Rociana del Condado";
  return (
    `El Consejo de Ministros declara los territorios afectados «zona gravemente afectada por una emergencia de protección civil» (zona catastrófica), dentro del acuerdo nacional que cubrió 119 incendios del verano de 2022. Los fuegos gemelos del 25 de julio quemaron según la prensa ${twin} — unas 1.700 ha en total (estabilizados el 27, extinguidos el 29 de julio). La declaración abre ayudas e indemnizaciones estatales para ayuntamientos, particulares y empresas. Un mes después, «las investigaciones continúan».`
  );
}

async function main() {
  if (ALMONTE_EXCERPT.length > 280) { console.error(`Excerpt too long (${ALMONTE_EXCERPT.length})`); process.exit(1); }

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset || (!token && !DRY)) { console.error("Missing Sanity env"); process.exit(1); }
  const client = createClient({ projectId, dataset, token: token ?? "", apiVersion: "2026-05-19", useCdn: false });

  for (const { slug, unhide } of CASES) {
    const doc = await client.fetch<any>(
      `*[_type=="case" && slug.current==$slug][0]{ _id, hidden, excerpt, timeline }`,
      { slug }
    );
    if (!doc) { console.error(`  ✗ ${slug} not found`); continue; }

    let hash = 0;
    for (let i = 0; i < URL_ABC.length; i++) hash = (hash * 31 + URL_ABC.charCodeAt(i)) >>> 0;
    const linkId = `rl-${slug}-manual-${hash.toString(36)}`;

    const entry = {
      _key: timelineKeyForLink(linkId),
      date: "2022-08-23",
      title: "Declarados zona catastrófica por el Consejo de Ministros",
      description: cronoDesc(slug),
      type: "political",
      sourceUrl: URL_ABC,
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
      console.log(`[dry-run] ${slug}: ${unhide && doc.hidden ? "unhide · " : ""}crono at ${idx}: ${timeline.map((t: any) => t.date).join(" · ")}`);
      continue;
    }

    await client.createOrReplace({
      _type: "researchLink",
      _id: linkId,
      case: { _type: "reference", _ref: doc._id },
      caseSlug: slug,
      label: "«Áreas arrasadas por el fuego de Bonares y Almonte, declaradas zona catastrófica» - ABC (24/08/2022)",
      url: URL_ABC,
      sourceType: "Prensa",
      isSearch: false,
      status: "approved",
      confidence: 100,
      note:
        "Aportado por el editor. ZAE del Consejo de Ministros 23/08/2022 (acuerdo nacional, 119 incendios del verano 2022): los fuegos gemelos de Bonares (600 ha) y Almonte (1.100 ha) del 25/07/2022 incluidos; ayudas estatales; «las investigaciones continúan».",
    });

    const patch: Record<string, unknown> = { timeline };
    if (unhide && doc.hidden) patch.hidden = false;
    if (unhide && !doc.excerpt) patch.excerpt = ALMONTE_EXCERPT;
    await client.patch(doc._id).set(patch).commit();
    console.log(`  ✓ ${slug}${unhide && doc.hidden ? " (unhidden)" : ""}: ABC link + crono 2022-08-23`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
