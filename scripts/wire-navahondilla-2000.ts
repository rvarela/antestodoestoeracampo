#!/usr/bin/env tsx
/**
 * wire-navahondilla-2000.ts — one-off: resolves navahondilla-2000-2000050160
 * as «Sentencia firme» (6th conviction).
 *
 * SAP AV 107/2006 (27/04/2006; full text read via editor-delegated review):
 * condena por los dos fuegos provocados con mechero junto a Navahondilla el
 * 10/09/2000 — 320 ha según la sentencia (EGIF: 250), el pueblo evacuado,
 * 185 propietarios dañados. Autor con piromanía + discapacidad intelectual
 * leve (eximente incompleta): 5 años de prisión + 5 años de tratamiento
 * psiquiátrico ambulatorio + RC (costes de extinción y daños).
 *
 * Firmeza probada POSITIVAMENTE: AAP VA 20/2009 (21/01/2009) desestima el
 * recurso del mismo condenado contra la denegación de un permiso
 * penitenciario — estaba cumpliendo esta condena en 2009 (vigilancia
 * penitenciaria tramitada en Valladolid: sigue a la prisión, no al fuego).
 *
 * Honestidad EGIF: la motivación oficial [402] quemas ganaderas era errónea;
 * el tribunal acreditó piromanía. Señal Catastro 201 (top del dataset) queda
 * SIN explicar por la vía judicial — candidato de la capa política.
 *
 *   npx tsx scripts/wire-navahondilla-2000.ts [--dry-run]
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
const SLUG = "navahondilla-2000-2000050160";
const URL_SAP = "https://www.poderjudicial.es/search/AN/openDocument/ee305e1d454afa31/20060713";
const URL_AAP = "https://www.poderjudicial.es/search/AN/openDocument/56a9d41d63d6ab7b/20090423";

const EXCERPT =
  "Dos fuegos provocados junto a Navahondilla en 2000: 320 ha según la sentencia, el pueblo evacuado y 185 propietarios dañados. El autor — piromanía y discapacidad intelectual — fue condenado a 5 años (firme). EGIF codificó el incendio, erróneamente, como quema ganadera.";

const OUTCOME =
  "Autor condenado a 5 años de prisión y 5 de tratamiento psiquiátrico ambulatorio (SAP AV 107/2006; cumplimiento acreditado por AAP VA 20/2009). La alta señal catastral del caso (201; 968 parcelas urbanas) no tiene explicación judicial: pendiente de la capa de investigación urbanística.";

const P_STATUS_TEXT =
  "Este caso cuenta con sentencia judicial firme. Consulta la sección judicial para más detalles sobre el procedimiento y el fallo.";

const TIMELINE_ADD = [
  {
    _key: "evac-2000",
    date: "2000-09-10",
    title: "El pueblo, evacuado por los dos focos",
    description:
      "Los dos fuegos, prendidos con un mechero, avanzan sobre el término y obligan a evacuar Navahondilla; la sentencia cifra el daño en 320 hectáreas (EGIF registra 250) y en 185 los propietarios afectados (SAP AV 107/2006, hechos probados).",
    type: "fire",
    sourceUrl: URL_SAP,
  },
  {
    _key: "judicial-condena-2006",
    date: "2006-04-27",
    title: "Condena: 5 años de prisión y tratamiento psiquiátrico",
    description:
      "La Audiencia Provincial de Ávila condena al autor de los dos focos a 5 años de prisión, 5 años de tratamiento psiquiátrico ambulatorio y al pago de los costes de extinción y de los daños a los 185 propietarios. El tribunal aprecia eximente incompleta: piromanía y discapacidad intelectual leve — la motivación real, seis años después de que la estadística oficial EGIF archivara el fuego como «quema ganadera» (SAP AV 107/2006).",
    type: "judicial",
    sourceUrl: URL_SAP,
  },
  {
    _key: "judicial-permiso-2009",
    date: "2009-01-21",
    title: "Cumpliendo condena: permiso penitenciario denegado",
    description:
      "La Audiencia Provincial de Valladolid — provincia de la prisión donde cumple condena — desestima el recurso del condenado contra la denegación de un permiso ordinario: pese a su buena conducta, el historial de piromanía, la gravedad del incendio de Navahondilla y el riesgo de reincidencia lo desaconsejan (AAP VA 20/2009). El auto acredita que la condena de 2006 era firme y se estaba cumpliendo.",
    type: "judicial",
    sourceUrl: URL_AAP,
  },
];

const JUDICIAL = [
  {
    _key: "jud-0",
    court: "Audiencia Provincial de Ávila",
    date: "2006-04-27",
    result: "convicted",
    description:
      "Condena por los dos incendios provocados el 10/09/2000: 5 años de prisión, 5 años de tratamiento psiquiátrico ambulatorio e indemnización de los costes de extinción y de los daños a 185 propietarios (320 ha según los hechos probados; el pueblo tuvo que ser evacuado). Eximente incompleta por piromanía y discapacidad intelectual leve (SAP AV 107/2006). Firmeza acreditada positivamente: en 2009 el condenado cumplía prisión por esta causa (AAP VA 20/2009, permiso penitenciario denegado por riesgo de reincidencia).",
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
      _key: "jud-sap-2006",
      label:
        "SAP Ávila 107/2006, 27/04/2006 — condena: 5 años por los dos fuegos de Navahondilla · ECLI:ES:APAV:2006:107",
      type: "Sentencia",
      url: URL_SAP,
    },
    {
      _key: "jud-aap-2009",
      label:
        "AAP Valladolid 20/2009, 21/01/2009 — permiso penitenciario denegado al condenado (cumplimiento de condena acreditado) · ECLI:ES:APVA:2009:20",
      type: "Sentencia",
      url: URL_AAP,
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
