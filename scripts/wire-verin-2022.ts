#!/usr/bin/env tsx
/**
 * wire-verin-2022.ts — one-off: resolves verin-2022-2022320477 as
 * «Sentencia firme» (4th conviction: Terra Mítica, Vilamarxant, Inagua, Verín).
 *
 * Chain (CENDOJ full texts read via editor-delegated review, 2026-07-07;
 * figures cross-checked against EGIF to the centiare):
 *  - AAP OU 765/2022 (13/12/2022) + AAP OU 550/2023 (04/10/2023): prisión
 *    provisional confirmada; AAP OU 316/2024 (21/05/2024): en libertad bajo
 *    fianza de 5.000 € (reducción denegada).
 *  - SAP OU 45/2025 (14/01/2025, conformidad): condena por delito continuado
 *    de incendio forestal — fuegos del 3-4/08/2022 en Verín; 933,74 ha
 *    totales, 706,76 ha forestales (= EGIF exacto); 3 años de prisión
 *    (eximente incompleta por alcoholismo crónico), multa de 18 meses,
 *    responsabilidad civil >1,1 M€ + daños a particulares.
 *  - Firme: conformidad + sin apelación ante el TSJ de Galicia en CENDOJ
 *    18 meses después (la cosecha «"incendio forestal" "Verín"» la habría
 *    recogido).
 *
 * Idempotent; full arrays per Conventions.
 *
 *   npx tsx scripts/wire-verin-2022.ts [--dry-run]
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
const SLUG = "verin-2022-2022320477";

const URL_SAP = "https://www.poderjudicial.es/search/AN/openDocument/3329827ea71742c3a0a8778d75e36f0d/20250408";
const URL_AAP_2024 = "https://www.poderjudicial.es/search/AN/openDocument/36e263e6c3cfdfc7a0a8778d75e36f0d/20240823";

const EXCERPT =
  "Diez focos simultáneos el 3 de agosto de 2022 — «un fuego totalmente intencionado» — y 933,74 ha quemadas en la comarca de Verín. La autora, detenida al mes, fue condenada en 2025 por conformidad: 3 años de prisión y más de 1,1 M€ de responsabilidad civil.";

const OUTCOME =
  "Autora condenada por conformidad a 3 años de prisión, multa de 18 meses y responsabilidad civil superior a 1,1 M€ (SAP OU 45/2025, delito continuado de incendio forestal; eximente incompleta por alcoholismo crónico). Firme: sin apelación conocida.";

const P_STATUS_TEXT =
  "Este caso cuenta con sentencia judicial firme. Consulta la sección judicial para más detalles sobre el procedimiento y el fallo.";

const TIMELINE_ADD = [
  {
    _key: "judicial-libertad-2024",
    date: "2024-05-21",
    title: "En libertad bajo fianza de 5.000 €",
    description:
      "Tras más de un año y medio en prisión provisional (confirmada por la Audiencia en diciembre de 2022 y octubre de 2023), la acusada queda en libertad bajo fianza de 5.000 €. La Audiencia Provincial de Ourense rechaza reducirla a 500 € — la hija de la acusada había pedido prestado el dinero — por la gravedad de los hechos y el daño causado (AAP OU 316/2024).",
    type: "judicial",
    sourceUrl: URL_AAP_2024,
  },
  {
    _key: "judicial-condena-2025",
    date: "2025-01-14",
    title: "Condenada por conformidad: 3 años y más de 1,1 M€",
    description:
      "La Audiencia Provincial de Ourense condena a la autora, por conformidad, como responsable de un delito continuado de incendio forestal por los fuegos del 3 y 4 de agosto de 2022: 933,74 ha quemadas — 706,76 forestales, la cifra exacta del parte EGIF de este caso —, con riesgo para núcleos habitados y daños extensos. Pena: 3 años de prisión (rebajada por eximente incompleta de alcoholismo crónico), multa de 18 meses y responsabilidad civil superior a 1,1 millones de euros más indemnizaciones a particulares (SAP OU 45/2025). Sin apelación conocida: la condena es firme.",
    type: "judicial",
    sourceUrl: URL_SAP,
  },
];

const JUDICIAL = [
  {
    _key: "jud-0",
    court: "Audiencia Provincial de Ourense",
    date: "2022-12-13",
    result: "pending",
    description:
      "Prisión provisional: la Audiencia desestima el primer recurso de la investigada contra la prisión decretada tras su detención (13/09/2022) — indicios fundados, riesgo de fuga y de reiteración (AAP OU 765/2022). Un segundo recurso, alegando prisión preventiva excesiva tras un año, fue igualmente desestimado (AAP OU 550/2023). En 2024 quedó en libertad bajo fianza de 5.000 €, cuya reducción se denegó (AAP OU 316/2024).",
  },
  {
    _key: "jud-1",
    court: "Audiencia Provincial de Ourense",
    date: "2025-01-14",
    result: "convicted",
    description:
      "Condena por conformidad: delito continuado de incendio forestal por los fuegos del 3-4 de agosto de 2022 en la comarca de Verín (933,74 ha, 706,76 forestales; riesgo para asentamientos). 3 años de prisión — con eximente incompleta por alcoholismo crónico —, multa de 18 meses y responsabilidad civil superior a 1,1 M€ más daños a particulares (SAP OU 45/2025). Firme: conformidad y sin recurso ante el TSJ de Galicia localizable en CENDOJ.",
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
      _key: "jud-sap-2025",
      label:
        "SAP Ourense 45/2025, 14/01/2025 — condena por conformidad: 3 años por delito continuado de incendio forestal · ECLI:ES:APOU:2025:45",
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
