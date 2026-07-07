#!/usr/bin/env tsx
/**
 * wire-tejeda-2017.ts — one-off: resolves tejeda-2017-2017350035 as «Archivado»
 * (2nd Archivado after arenas-de-san-pedro-2009).
 *
 * Facts verified from two Canarias7 articles (user-surfaced via the queue +
 * direct URLs resolved 2026-07-07):
 *  - «Carin murió por salvar a sus animales» (23/09/2017): Carin Birgitta
 *    Ostman, sueca, ~60 años, 15 años en su finca de Los Llanos de Ana López;
 *    desaparecida el miércoles del fuego, hallada muerta tres días después.
 *  - «En libertad por el gran incendio de Tejeda» (10/07/2020): el Juzgado de
 *    Instrucción nº 7 de Las Palmas archiva la causa a instancias de la
 *    Fiscalía de Medio Ambiente; el único sospechoso, José E. R. (cuidaba
 *    ganado; ictus 06/02/2018; no declaró), queda libre — sin «la suficiente
 *    contundencia o una carga probatoria inequívoca». Seprona vinculó el fuego
 *    (mechero, 1.909 ha) con otros dos de junio 2016 y junio 2017: quemas
 *    para regenerar pasto. EGIF codes the case [401] quemas agrícolas — same
 *    theory, government-coded.
 *
 * Creates 2 manual approved researchLinks + receipted timeline entries
 * (keys via timelineKeyForLink so /research shows «✓ en cronología»),
 * judicial[] archivo entry, status/outcome/excerpt, p-status swap.
 * Idempotent; full arrays fetched and written back per Conventions.
 *
 *   npx tsx scripts/wire-tejeda-2017.ts [--dry-run]
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
const SLUG = "tejeda-2017-2017350035";

const URL_ARCHIVO = "https://www.canarias7.es/sociedad/en-libertad-por-el-gran-incendio-de-tejeda-DM9428207";
const URL_CARIN = "https://www.canarias7.es/canarias/gran-canaria/encontrada-muerta-la-desaparecida-en-el-incendio-XG2190189";

const EXCERPT =
  "1.909 ha en la cumbre de Gran Canaria en 2017 y una víctima mortal: Carin Birgitta Ostman, muerta al intentar proteger a sus animales en Los Llanos de Ana López. La causa contra el único sospechoso — un ganadero de la zona — fue archivada en 2020 sin prueba concluyente.";

const OUTCOME =
  "Causa archivada en 2020 (Juzgado de Instrucción nº 7 de Las Palmas, a instancias de la Fiscalía de Medio Ambiente): el único sospechoso quedó libre sin prueba concluyente. El autor nunca fue identificado judicialmente.";

const P_STATUS_TEXT =
  "La causa judicial fue archivada en 2020 sin acusados. Consulta la sección judicial para el detalle del procedimiento.";

function linkIdFor(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  return `rl-${SLUG}-manual-${hash.toString(36)}`;
}

const LINKS = [
  {
    _id: linkIdFor(URL_CARIN),
    label: "«Carin murió por salvar a sus animales» - Canarias7 (23/09/2017)",
    url: URL_CARIN,
    note:
      "Aportado por el editor. La única víctima mortal del incendio: Carin Birgitta Ostman, sueca, 15 años viviendo en su finca de Los Llanos de Ana López; desapareció la tarde del fuego y fue hallada muerta tres días después.",
  },
  {
    _id: linkIdFor(URL_ARCHIVO),
    label: "«En libertad por el gran incendio de Tejeda» - Canarias7 (10/07/2020)",
    url: URL_ARCHIVO,
    note:
      "Encontrado en la cola (copia en tejeda-2007, reasignado aquí). Archivo de la causa: JI nº 7 de Las Palmas, a instancias de la Fiscalía de Medio Ambiente; el único sospechoso (José E. R., ganadero) libre por falta de «carga probatoria inequívoca». Seprona vinculó el fuego con otros de junio 2016 y junio 2017 (quemas para pasto).",
  },
];

const TIMELINE_ADD = [
  {
    _key: timelineKeyForLink(linkIdFor(URL_CARIN)),
    date: "2017-09-23",
    title: "Hallada muerta la única víctima del incendio",
    description:
      "Carin Birgitta Ostman, sueca de unos 60 años que llevaba 15 viviendo en su pequeña finca de Los Llanos de Ana López, muere al intentar proteger a sus animales. Desapareció la tarde en que el fuego alcanzó la zona — «cuando me di la vuelta había desaparecido», relata una vecina — y fue hallada muerta tres días después. Las llamas se detuvieron justo al borde de su propiedad.",
    type: "fire",
    sourceUrl: URL_CARIN,
  },
  {
    _key: timelineKeyForLink(linkIdFor(URL_ARCHIVO)),
    date: "2020-07-10",
    title: "Archivada la causa: el único sospechoso, libre",
    description:
      "El Juzgado de Instrucción nº 7 de Las Palmas archiva la causa a instancias de la Fiscalía de Medio Ambiente y José E. R., el único sospechoso, queda en libertad. El Seprona vinculó «con gran probabilidad» este incendio (iniciado con un mechero) con otros dos de junio de 2016 y junio de 2017 en la misma zona, con las quemas para regenerar pasto como móvil, pero la investigación no alcanzó «la suficiente contundencia o una carga probatoria inequívoca». El autor del fuego que mató a una persona y quemó 1.909 hectáreas nunca fue identificado judicialmente. (Fecha de la noticia; el auto es de julio de 2020.)",
    type: "judicial",
    sourceUrl: URL_ARCHIVO,
  },
];

const JUDICIAL = [
  {
    _key: "jud-0",
    court: "Juzgado de Instrucción nº 7 de Las Palmas de Gran Canaria",
    date: "2020-07",
    result: "archived",
    description:
      "Archivo de la causa a instancias del informe de la Fiscalía de Medio Ambiente. Único investigado: José E. R., que cuidaba ganado en la zona (sufrió un ictus el 06/02/2018 y se acogió a su derecho a no declarar). El Seprona conectó el incendio con otros dos de junio de 2016 y junio de 2017 — quemas para regenerar pasto —, pero el juez consideró que la prueba carecía de «la suficiente contundencia o una carga probatoria inequívoca» para vencer la presunción de inocencia. Coincide con la motivación que registra el propio EGIF para este fuego: quemas agrícolas/ganaderas.",
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
    `*[_type=="case" && slug.current==$slug][0]{ _id, status, timeline, judicial, overview }`,
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
    console.log(`[dry-run] ${doc._id}: status ${doc.status} → Archivado`);
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
    .set({ status: "Archivado", outcome: OUTCOME, excerpt: EXCERPT, timeline, judicial: JUDICIAL, overview })
    .commit();

  console.log(`✓ ${SLUG} wired: Archivado, ${timeline.length} timeline entries, ${LINKS.length} links, 1 judicial`);
}
main().catch((e) => { console.error(e); process.exit(1); });
