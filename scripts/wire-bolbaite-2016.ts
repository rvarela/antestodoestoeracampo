#!/usr/bin/env tsx
/**
 * wire-bolbaite-2016.ts — one-off: resolves bolbaite-2016-2016460111 as
 * «Sentencia firme» (5th conviction).
 *
 * SAP V 362/2019 (13/03/2019, Sección 2ª AP Valencia, sumario 246/2016 del
 * JI nº 1 de Xàtiva; full text user-pasted, verified vs EGIF TO THE MINUTE:
 * inicio 15/06/2016 19:40, extinción 21/06 20:59, 7 municipios):
 * conformidad, DECLARADA FIRME EN EL ACTO (partes renunciaron a recurrir).
 * Condena: 5 años 9 meses (art. 352.1 y 2 + 351 CP — peligro para personas,
 * viviendas desalojadas; atenuantes confesión 21.4 + analógica anomalía
 * psíquica 21.7) + multa 6 meses. RC: 239.503,65 € (extinción) +
 * 225.919,39 € (daño ambiental) a la Generalitat + 367.609,61 € a ~40
 * particulares. Autor: inteligencia límite (edad mental ~12 años) +
 * trastorno antisocial (43% discapacidad); sorprendido contemplando el
 * fuego; confesó voluntariamente al día siguiente; prisión provisional
 * desde el 17/06/2016 (casi 3 años hasta sentencia). Coincide con la
 * motivación EGIF [483] piromanía/enfermos mentales.
 *
 *   npx tsx scripts/wire-bolbaite-2016.ts [--dry-run]
 */
import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@sanity/client";

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
const SLUG = "bolbaite-2016-2016460111";
const URL_SAP = "https://www.poderjudicial.es/search/AN/openDocument/f3cdee1e657c6f46/20190326";

const EXCERPT =
  "1.564 ha en siete municipios de la Canal de Navarrés, iniciadas con un mechero en Bolbaite en 2016. El autor — inteligencia límite, sorprendido contemplando el fuego — confesó al día siguiente. Condena firme en 2019: 5 años y 9 meses y más de 830.000 € de responsabilidad civil.";

const OUTCOME =
  "Autor condenado por conformidad a 5 años y 9 meses de prisión y responsabilidad civil superior a 830.000 € (SAP V 362/2019, firme en el acto). Casi tres años de prisión provisional previa. La sentencia acredita el perfil que EGIF codifica: anomalía psíquica con inteligencia límite.";

const P_STATUS_TEXT =
  "Este caso cuenta con sentencia judicial firme. Consulta la sección judicial para más detalles sobre el procedimiento y el fallo.";

const TIMELINE_ADD = [
  {
    _key: "judicial-confesion-2016",
    date: "2016-06-16",
    title: "El autor confiesa al día siguiente ante la Guardia Civil",
    description:
      "Hacia las 14:00, el autor se acerca a la zona donde la Guardia Civil realiza la inspección ocular y confiesa voluntariamente al cabo primero que él prendió el fuego. Durante la extinción ya había sido sorprendido contemplando la propagación de las llamas. Ingresa en prisión provisional el 17 de junio, donde permanecerá casi tres años hasta el juicio (SAP V 362/2019, hechos probados).",
    type: "judicial",
    sourceUrl: URL_SAP,
  },
  {
    _key: "judicial-condena-2019",
    date: "2019-03-13",
    title: "Condena firme: 5 años y 9 meses",
    description:
      "La Audiencia Provincial de Valencia (Sección 2ª) condena al autor, por conformidad, como responsable de un delito de incendio forestal con peligro para la vida o integridad de las personas (arts. 352.1 y 2 y 351 CP — hubo viviendas desalojadas): 5 años y 9 meses de prisión y multa, con atenuantes de confesión y de anomalía psíquica (inteligencia límite equivalente a una edad mental de unos doce años). Responsabilidad civil: 239.503,65 € por la extinción y 225.919,39 € por daño ambiental a la Generalitat, más 367.609,61 € a una cuarentena de particulares. Las partes renuncian a recurrir y la sentencia se declara firme en el acto.",
    type: "judicial",
    sourceUrl: URL_SAP,
  },
];

const JUDICIAL = [
  {
    _key: "jud-0",
    court: "Audiencia Provincial de Valencia, Sección 2ª",
    date: "2019-03-13",
    result: "convicted",
    description:
      "Condena por estricta conformidad (SAP V 362/2019; sumario 246/2016 del JI nº 1 de Xàtiva): 5 años y 9 meses de prisión y multa de 6 meses por incendio forestal con peligro para las personas (arts. 352.1 y 2 y 351 CP), con atenuantes de confesión (21.4) y analógica de anomalía psíquica (21.7 — inteligencia límite, edad mental ~12 años, trastorno antisocial, 43% de discapacidad). RC: 465.423,04 € a la Generalitat (extinción + daño ambiental pericial del IML) y 367.609,61 € a ~40 particulares. El fuego afectó a dos LIC (Cova de la Moneda-Cotes y Río Júcar). Prisión provisional desde el 17/06/2016. Declarada FIRME en el propio acto: todas las partes renunciaron a recurrir.",
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
    `*[_type=="case" && slug.current==$slug][0]{ _id, status, timeline, judicial, sources, overview }`,
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

  const srcAdd = [
    {
      _key: "jud-sap-2019",
      label:
        "SAP Valencia 362/2019, 13/03/2019 — condena firme por conformidad: 5 años y 9 meses por el incendio de la Canal de Navarrés · ECLI:ES:APV:2019:362",
      type: "Sentencia",
      url: URL_SAP,
    },
  ];
  const srcKeys = new Set(srcAdd.map((s) => s._key));
  const sources = [...(doc.sources ?? []).filter((s: any) => !srcKeys.has(s._key)), ...srcAdd];

  const overview = (doc.overview ?? []).map((b: any) =>
    b._key === "p-status"
      ? { ...b, children: [{ _type: "span", _key: "p-status-span", text: P_STATUS_TEXT, marks: [] }] }
      : b
  );

  if (DRY) {
    console.log(`[dry-run] ${doc._id}: status ${doc.status} → Sentencia firme`);
    console.log(timeline.map((t: any) => `  ${t.date} · ${t.title?.slice(0, 60)}`).join("\n"));
    return;
  }

  await client
    .patch(doc._id)
    .set({ status: "Sentencia firme", outcome: OUTCOME, excerpt: EXCERPT, timeline, judicial: JUDICIAL, sources, overview })
    .commit();

  console.log(`✓ ${SLUG} wired: Sentencia firme, ${timeline.length} timeline entries, ${JUDICIAL.length} judicial, ${sources.length} sources`);
}
main().catch((e) => { console.error(e); process.exit(1); });
