#!/usr/bin/env tsx
/**
 * wire-tejeda-2007.ts — one-off: resolves tejeda-2007-2007350042 (incendio de
 * Inagua, Gran Canaria, 27/07/2007) as «Sentencia firme».
 *
 * Chain verified from full texts + CENDOJ corpus (session 21):
 *  - SAP GC 2891/2017 (04/12/2017, Sección 6ª AP Las Palmas, Tribunal del
 *    Jurado, rollo 102/2014; instrucción JPII nº 2 de Arucas, jurado 1/2009):
 *    vigilante forestal de GESPLAN condenado a 8 años 6 meses (arts. 352 y 353
 *    CP en relación con 332 y 338) por provocar el fuego buscando la
 *    ampliación de su contrato. RC directa + GESPLAN y Cabildo subsidiarios.
 *  - STSJ ICAN 27/2019 (11/02/2019): desestima los 3 recursos — todos sobre
 *    responsabilidad civil; el condenado NO apeló su condena — y confirma.
 *  - Firmeza: CENDOJ "Inagua" (43 docs) y "incendio forestal"+"GESPLAN" no
 *    contienen casación TS 6+ años después; prensa (eldiario.es) recoge que el
 *    acusado se conformó con la pena pedida por el fiscal.
 *
 * Idempotent — entries replaced by _key; full arrays fetched and written back
 * (never projected fetch + set, per Conventions).
 *
 *   npx tsx scripts/wire-tejeda-2007.ts [--dry-run]
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
const SLUG = "tejeda-2007-2007350042";

const SAP_URL = "https://www.poderjudicial.es/search/AN/openDocument/6ba36d9779bcb1e4/20190218";
const STSJ_URL = "https://www.poderjudicial.es/search/AN/openDocument/64510f8cc5f04295/20190425";

const EXCERPT =
  "19.291 ha en Gran Canaria (2007): ~4.550 evacuados y la reserva de Inagua arrasada — «la mayor tragedia medioambiental» de Canarias según la sentencia. El autor, vigilante forestal de GESPLAN, buscaba que le ampliaran el contrato: condena firme de 8 años y 6 meses.";

const OUTCOME =
  "Autor condenado a 8 años y 6 meses de prisión (firme: el condenado no recurrió y no consta casación). GESPLAN y el Cabildo de Gran Canaria, responsables civiles subsidiarios de las indemnizaciones a 76 perjudicados.";

const TIMELINE_ADD = [
  {
    _key: "evac-2007",
    date: "2007-07-27",
    title: "Evacuación de unas 4.550 personas",
    description:
      "Con 36 °C, rachas de viento de hasta 75 km/h y un 22 % de humedad, el fuego obliga a evacuar a ~4.550 personas de Tejeda, Mogán, San Bartolomé y Santa Lucía de Tirajana, incluido el parque zoológico Palmitos Park. Arde la totalidad de la Reserva Natural Integral de Inagua — hábitat de los ~200 ejemplares del pinzón azul de Gran Canaria, en peligro de extinción — y el 70 % del Parque Natural de Pilancones. La sentencia lo describe como «la mayor tragedia medioambiental producida en Canarias».",
    type: "fire",
    sourceUrl: STSJ_URL,
  },
  {
    _key: "judicial-2017",
    date: "2017-12-04",
    title: "Condena del Tribunal del Jurado: 8 años y 6 meses",
    description:
      "La Audiencia Provincial de Las Palmas (Sección 6ª, Tribunal del Jurado) condena al vigilante forestal contratado por la empresa pública GESPLAN, que confesó haber prendido el fuego con una cerilla junto a la pista de El Juncal para que le ampliaran el contrato de la campaña contra incendios. Pena: 8 años y 6 meses de prisión y multa (arts. 352 y 353 CP, en relación con los arts. 332 y 338 — espacio natural protegido). GESPLAN y el Cabildo de Gran Canaria responden civilmente de forma subsidiaria ante 76 perjudicados (SAP GC 2891/2017).",
    type: "judicial",
    sourceUrl: SAP_URL,
  },
  {
    _key: "judicial-2019",
    date: "2019-02-11",
    title: "El TSJ de Canarias confirma la condena",
    description:
      "El Tribunal Superior de Justicia desestima los tres recursos de apelación — todos sobre la responsabilidad civil (un perjudicado, la Plataforma Más Nunca y Aspro Parks, propietaria de Palmitos Park); el condenado no recurrió su condena — y confirma íntegramente la sentencia (STSJ ICAN 27/2019). No consta casación posterior ante el Tribunal Supremo: la condena es firme.",
    type: "judicial",
    sourceUrl: STSJ_URL,
  },
];

const JUDICIAL = [
  {
    _key: "jud-0",
    court: "Audiencia Provincial de Las Palmas, Sección 6ª (Tribunal del Jurado)",
    date: "2017-12-04",
    result: "convicted",
    description:
      "Condena de 8 años y 6 meses de prisión y multa por incendio forestal agravado en espacio natural protegido (arts. 352 y 353 CP en relación con 332 y 338). El jurado declara probado que el vigilante forestal de GESPLAN prendió el fuego para lograr la ampliación de su contrato, eligiendo un punto de fácil propagación a 300 m de la Casa Forestal del plan de recuperación del pinzón azul. Responsabilidad civil directa del autor y subsidiaria de GESPLAN y el Cabildo de Gran Canaria (76 perjudicados). Instrucción: Juzgado de Primera Instancia e Instrucción nº 2 de Arucas (jurado 1/2009); el procedimiento estuvo paralizado más de cuatro años por la acreditación de la responsabilidad civil (SAP GC 2891/2017).",
  },
  {
    _key: "jud-1",
    court: "Tribunal Superior de Justicia de Canarias, Sala de lo Civil y Penal",
    date: "2019-02-11",
    result: "convicted",
    description:
      "Desestima los tres recursos de apelación — limitados a la responsabilidad civil; el condenado no apeló — y confirma íntegramente la sentencia del Tribunal del Jurado (STSJ ICAN 27/2019). Sin casación posterior localizable en CENDOJ: condena firme.",
  },
];

const SOURCES_ADD = [
  {
    _key: "jud-sap-2017",
    label:
      "SAP Las Palmas (Tribunal del Jurado), 04/12/2017 — condena a 8 años y 6 meses por el incendio de Inagua · ECLI:ES:APGC:2017:2891",
    type: "Sentencia",
    url: SAP_URL,
  },
  {
    _key: "jud-stsj-2019",
    label:
      "STSJ Canarias, 11/02/2019 — desestima las apelaciones (solo responsabilidad civil) y confirma la condena · ECLI:ES:TSJICAN:2019:27",
    type: "Sentencia",
    url: STSJ_URL,
  },
];

const P_STATUS_TEXT =
  "Este caso cuenta con sentencia judicial firme. Consulta la sección judicial para más detalles sobre el procedimiento y el fallo.";

function sortKeyOf(date: string): number {
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return parseInt(iso[1] + iso[2] + iso[3], 10);
  const y = date.match(/^(\d{4})$/);
  if (y) return parseInt(y[1] + "0101", 10);
  return 99999999;
}

async function main() {
  if (EXCERPT.length > 280) {
    console.error(`Excerpt too long (${EXCERPT.length} > 280)`);
    process.exit(1);
  }

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset || (!token && !DRY)) { console.error("Missing Sanity env"); process.exit(1); }
  const client = createClient({ projectId, dataset, token: token ?? "", apiVersion: "2026-05-19", useCdn: false });

  // Full arrays — never projected (Conventions)
  const doc = await client.fetch<any>(
    `*[_type=="case" && slug.current==$slug][0]{ _id, status, timeline, judicial, sources, overview }`,
    { slug: SLUG }
  );
  if (!doc) { console.error(`${SLUG} not found`); process.exit(1); }

  // Timeline: replace ours by _key, insert chronologically (fire-0 pinned first on ties)
  const addKeys = new Set(TIMELINE_ADD.map((t) => t.date + "|" + t._key));
  const keepKeys = new Set(TIMELINE_ADD.map((t) => t._key));
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
  void addKeys;

  // Sources: replace ours by _key, keep the rest
  const srcKeys = new Set(SOURCES_ADD.map((s) => s._key));
  const sources = [
    ...(doc.sources ?? []).filter((s: any) => !srcKeys.has(s._key)),
    ...SOURCES_ADD,
  ];

  // Overview: swap only the p-status block text (full array written back)
  const overview = (doc.overview ?? []).map((b: any) =>
    b._key === "p-status"
      ? {
          ...b,
          children: [{ _type: "span", _key: "p-status-span", text: P_STATUS_TEXT, marks: [] }],
        }
      : b
  );

  const patch = {
    status: "Sentencia firme",
    outcome: OUTCOME,
    excerpt: EXCERPT,
    timeline,
    judicial: JUDICIAL,
    sources,
    overview,
  };

  if (DRY) {
    console.log(`[dry-run] would patch ${doc._id}:`);
    console.log(`  status: ${doc.status} → Sentencia firme`);
    console.log(`  timeline: ${(doc.timeline ?? []).length} → ${timeline.length} entries: ${timeline.map((t: any) => `${t.date} ${t._key}`).join(" · ")}`);
    console.log(`  judicial: ${JUDICIAL.length} entries · sources: ${sources.length} · excerpt ${EXCERPT.length} chars`);
    return;
  }

  await client.patch(doc._id).set(patch).commit();
  console.log(`✓ ${SLUG} wired: Sentencia firme, ${timeline.length} timeline entries, ${JUDICIAL.length} judicial, ${sources.length} sources`);
}
main().catch((e) => { console.error(e); process.exit(1); });
