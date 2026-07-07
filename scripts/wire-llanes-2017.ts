#!/usr/bin/env tsx
/**
 * wire-llanes-2017.ts — one-off: resolves llanes-2017-2017331021 as «Absuelto»
 * (3rd Absuelto, after riotinto-2004 and encinedo-2017) and unhides it
 * (judicial value = protected keep per triage policy).
 *
 * Facts from two COPE Ribadesella articles (user-found + follow-up):
 *  - Trial 24/02/2020, JP nº 3 de Oviedo: fiscal + Principado (acusación
 *    particular) pedían 3a6m + multa 8.100 € + indemnizaciones (31.824 €
 *    Principado, 41.752 € bomberos) por el incendio iniciado el 04/04/2017
 *    ~21:00 que quemó 326,7 ha en las sierras de Purón y Cuera (paisaje
 *    protegido) hasta el 21/04 04:35.
 *  - Sentencia 24/02/2020 (notificada 04/03): ABSUELTO — el informe BRIPA
 *    («venganza» por exclusión del reparto de pastos comunales de Purón +
 *    conflicto por un toro sin sanear) son «meras conjeturas y
 *    especulaciones»; los ganaderos supuestamente enemistados nunca fueron
 *    identificados ni declararon.
 *  - Firmeza por ausencia: no SAP appeal in CENDOJ 6 years on («Sierra del
 *    Cuera» = 0 results; «Purón» corpus = homonym surnames; AP Oviedo
 *    demonstrably publishes its fire appeals).
 *
 * EGIF-vs-judicial caveat (stated in the case): EGIF fragments the April 2017
 * Llanes fire wave into many partes; this case's row is the largest in the
 * Purón/Cuera zone (San Roque del Acebal, 291,04 ha, 18–20/04, coded [482]
 * vandalismo), while the sentencia treats the episode as one fire of 326,7 ha
 * ignited 04/04.
 *
 *   npx tsx scripts/wire-llanes-2017.ts [--dry-run]
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
const SLUG = "llanes-2017-2017331021";

const URL_JUICIO =
  "https://coperibadesella.com/24/02/2020/la-defensa-pide-la-libre-absolucion-para-el-llanisco-acusado-de-provocar-un-incendio-forestal-que-arraso-326-ha-de-monte-en-el-concejo/";
const URL_ABSUELTO =
  "https://coperibadesella.com/04/03/2020/absuelto-el-vecino-de-llanes-acusado-de-provocar-un-incendio-forestal-en-las-sierras-de-puron-y-cuera-en-abril-de-2017/";

const EXCERPT =
  "El incendio de las sierras de Purón y Cuera (Llanes, abril 2017): 326,7 ha según la sentencia. El único acusado — un vecino al que la BRIPA atribuía una venganza por el reparto de pastos comunales — fue absuelto en 2020: el informe era «meras conjeturas y especulaciones».";

const OUTCOME =
  "Único acusado absuelto (Juzgado de lo Penal nº 3 de Oviedo, sentencia 24/02/2020; sin apelación conocida). El autor del incendio nunca fue identificado judicialmente.";

const P_STATUS_TEXT =
  "El único acusado fue absuelto en 2020 y no consta apelación. Consulta la sección judicial para el detalle del procedimiento.";

function linkIdFor(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  return `rl-${SLUG}-manual-${hash.toString(36)}`;
}

const LINKS = [
  {
    _id: linkIdFor(URL_JUICIO),
    label:
      "«La defensa pide la libre absolución para el llanisco acusado de provocar un incendio forestal que arrasó 326 ha» - COPE Ribadesella (24/02/2020)",
    url: URL_JUICIO,
    note:
      "Aportado por el editor. Crónica del juicio (JP nº 3 de Oviedo): fiscal y Principado pedían 3a6m + multa 8.100 € + indemnizaciones; móvil según BRIPA: venganza por exclusión del reparto de pastos comunales de Purón y conflicto por un toro sin sanear.",
  },
  {
    _id: linkIdFor(URL_ABSUELTO),
    label:
      "«Absuelto el vecino de Llanes acusado de provocar un incendio forestal en las sierras de Purón y Cuera» - COPE Ribadesella (04/03/2020)",
    url: URL_ABSUELTO,
    note:
      "La absolución: la magistrada califica el informe BRIPA de «meras conjeturas y especulaciones»; los ganaderos supuestamente enemistados nunca fueron identificados ni declararon. Sentencia 24/02/2020, notificada 04/03/2020; no consta apelación en CENDOJ (2026).",
  },
];

const TIMELINE_ADD = [
  {
    _key: timelineKeyForLink(linkIdFor(URL_JUICIO)),
    date: "2020-02-24",
    title: "Juicio contra el único acusado",
    description:
      "El Juzgado de lo Penal nº 3 de Oviedo juzga a un vecino de Llanes por el incendio de las sierras de Purón y Cuera: según la acusación, iniciado el 04/04/2017 hacia las 21:00 y extinguido el 21/04 de madrugada, con 326,7 ha de paisaje protegido de la Sierra del Cuera afectadas (EGIF fragmenta el episodio en varios partes; el mayor, este caso, registra 291 ha en San Roque del Acebal). Fiscalía y Principado de Asturias pedían 3 años y 6 meses, multa de 8.100 € e indemnizaciones de 31.824 € y 41.752 €. El móvil según la BRIPA: venganza por su exclusión del reparto de pastos comunales de Purón y un conflicto por un toro sin sanear.",
    type: "judicial",
    sourceUrl: URL_JUICIO,
  },
  {
    _key: timelineKeyForLink(linkIdFor(URL_ABSUELTO)),
    date: "2020-03-04",
    title: "Absuelto: el informe de la BRIPA, «meras conjeturas»",
    description:
      "Se notifica la sentencia absolutoria (fechada el 24/02/2020): la magistrada concluye que la única prueba de cargo — el informe de la Brigada de Investigación de Incendios del Principado — se sustenta en «meras conjeturas y especulaciones»: la supuesta venganza contra el Ayuntamiento y las enemistades con ganaderos de la zona no quedaron «en modo alguno» acreditadas; esos ganaderos nunca fueron identificados ni declararon. No consta apelación. El autor del incendio nunca fue identificado.",
    type: "judicial",
    sourceUrl: URL_ABSUELTO,
  },
];

const JUDICIAL = [
  {
    _key: "jud-0",
    court: "Juzgado de lo Penal nº 3 de Oviedo",
    date: "2020-02-24",
    result: "acquitted",
    description:
      "Absolución del único acusado. Fiscalía y Principado de Asturias (acusación particular) pedían 3 años y 6 meses de prisión, multa de 8.100 € e indemnizaciones (31.824 € por daño ambiental al Principado y 41.752 € a bomberos). La magistrada consideró el informe de la BRIPA «meras conjeturas y especulaciones»: ni la venganza por la exclusión del reparto de pastos comunales de Purón ni las enemistades con ganaderos (nunca identificados, nunca declararon) quedaron acreditadas. Sentencia notificada el 04/03/2020; era apelable ante la AP de Oviedo pero no consta apelación publicada en CENDOJ seis años después.",
  },
];

async function main() {
  if (EXCERPT.length > 280) { console.error(`Excerpt too long (${EXCERPT.length} > 280)`); process.exit(1); }

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset || (!token && !DRY)) { console.error("Missing Sanity env"); process.exit(1); }
  const client = createClient({ projectId, dataset, token: token ?? "", apiVersion: "2026-05-19", useCdn: false });

  const doc = await client.fetch<any>(
    `*[_type=="case" && slug.current==$slug][0]{ _id, status, hidden, timeline, judicial, overview }`,
    { slug: SLUG }
  );
  if (!doc) { console.error(`${SLUG} not found`); process.exit(1); }

  const keepKeys = new Set(TIMELINE_ADD.map((t) => t._key));
  const sortKeyOf = (d: string) => {
    const iso = d?.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
    return iso ? parseInt(iso[1] + (iso[2] ?? "01") + (iso[3] ?? "01"), 10) : 99999999;
  };
  const timeline = [
    ...(doc.timeline ?? []).filter((t: any) => !keepKeys.has(t._key)),
    ...TIMELINE_ADD,
  ].sort((a: any, b: any) => {
    const d = sortKeyOf(a.date ?? "") - sortKeyOf(b.date ?? "");
    if (d !== 0) return d;
    if (a._key === "fire-0") return -1;
    if (b._key === "fire-0") return 1;
    return 0;
  });

  const overview = (doc.overview ?? []).map((b: any) =>
    b._key === "p-status"
      ? { ...b, children: [{ _type: "span", _key: "p-status-span", text: P_STATUS_TEXT, marks: [] }] }
      : b
  );

  if (DRY) {
    console.log(`[dry-run] ${doc._id}: hidden ${doc.hidden} → false · status ${doc.status} → Absuelto`);
    console.log(timeline.map((t: any) => `  ${t.date} · ${t.title?.slice(0, 60)}`).join("\n"));
    return;
  }

  for (const l of LINKS) {
    await client.createOrReplace({
      _type: "researchLink",
      _id: l._id,
      case: { _type: "reference", _ref: doc._id },
      caseSlug: SLUG,
      label: l.label,
      url: l.url,
      sourceType: "Prensa",
      isSearch: false,
      status: "approved",
      confidence: 100,
      note: l.note,
    });
  }

  await client
    .patch(doc._id)
    .set({ hidden: false, status: "Absuelto", outcome: OUTCOME, excerpt: EXCERPT, timeline, judicial: JUDICIAL, overview })
    .commit();

  console.log(`✓ ${SLUG} wired: unhidden, Absuelto, ${timeline.length} timeline entries, ${LINKS.length} links, 1 judicial`);
}
main().catch((e) => { console.error(e); process.exit(1); });
