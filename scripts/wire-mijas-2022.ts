#!/usr/bin/env tsx
/**
 * wire-mijas-2022.ts — one-off: crono for the Sierra de Mijas fire
 * (15/07–03/08/2022, 1.861,65 ha EGIF / 1.875 press, 3 municipios,
 * >3.000 evacuados). Receipts from the RTV Alhaurín el Grande live-blog
 * (user-found): nivel 1 + evacuations, Bendodo 29/07 «fue intencionado»
 * según los indicios (informe BIFF en curso; FCSE/Seprona activados),
 * ZAE del Consejo de Ministros 23/08/2022 (same national acuerdo as
 * Bonares–Almonte). Author never identified → status stays
 * «En investigación»; EGIF motivación [400] desconocida.
 *
 *   npx tsx scripts/wire-mijas-2022.ts [--dry-run]
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
const SLUG = "mijas-2022-2022290065";
const URL_BLOG = "https://rtvalhaurinelgrande.com/incendio-forestal-en-la-sierra-de-mijas-julio-2022/";

const TIMELINE_ADD = [
  {
    _key: "evac-2022",
    date: "2022-07-16",
    title: "Nivel 1: más de 3.000 personas desalojadas",
    description:
      "El fuego, declarado el 15 de julio al mediodía en la Sierra de Mijas, se extiende a los términos de Alhaurín el Grande y Alhaurín de la Torre y obliga a activar el nivel 1 del Plan de Emergencias por incendios forestales: más de 3.000 personas son desalojadas en los tres municipios. El incendio permanecerá activo veinte días, hasta su extinción el 3 de agosto.",
    type: "fire",
    sourceUrl: URL_BLOG,
  },
  {
    _key: "intencionado-2022",
    date: "2022-07-29",
    title: "La Junta: «fue intencionado», según los indicios",
    description:
      "El consejero Elías Bendodo afirma que el incendio «fue intencionado» según los indicios, con el informe de la Brigada de Investigación de Incendios Forestales (BIFF) del Infoca aún en elaboración. La Junta pide a la Delegación del Gobierno la colaboración urgente de las Fuerzas y Cuerpos de Seguridad del Estado — con el Seprona y la Unidad de Policía adscrita ya actuando — «para esclarecer los hechos y detener a las personas responsables». El autor nunca ha sido identificado.",
    type: "judicial",
    sourceUrl: URL_BLOG,
  },
  {
    _key: "zae-2022",
    date: "2022-08-23",
    title: "Declarado zona catastrófica por el Consejo de Ministros",
    description:
      "El Consejo de Ministros declara la zona quemada «gravemente afectada por una emergencia de protección civil» (zona catastrófica), dentro del mismo acuerdo nacional del 23 de agosto de 2022 que cubrió los grandes incendios del verano — incluidos los gemelos de Bonares y Almonte. La declaración abre ayudas estatales por fallecimiento, destrucción de vivienda, daños agrícolas y ganaderos y a entidades locales.",
    type: "political",
    sourceUrl: URL_BLOG,
  },
];

async function main() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (!projectId || !dataset || (!token && !DRY)) { console.error("Missing Sanity env"); process.exit(1); }
  const client = createClient({ projectId, dataset, token: token ?? "", apiVersion: "2026-05-19", useCdn: false });

  const doc = await client.fetch<any>(
    `*[_type=="case" && slug.current==$slug][0]{ _id, timeline }`,
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

  if (DRY) {
    console.log(`[dry-run] ${doc._id}:`);
    console.log(timeline.map((t: any) => `  ${t.date} · ${t.title?.slice(0, 60)}`).join("\n"));
    return;
  }

  await client.patch(doc._id).set({ timeline }).commit();
  console.log(`✓ ${SLUG} wired: ${timeline.length} timeline entries`);
}
main().catch((e) => { console.error(e); process.exit(1); });
