#!/usr/bin/env tsx
/**
 * seed-research-links.ts
 *
 * Seeds Sanity with researchLink documents for every published case.
 * Each link is a pre-filled search URL for a specific source (CENDOJ, BOE,
 * CCAA gazette, press archives, Catastro, Google Maps satellite).
 *
 * Safe to re-run — skips cases that already have research links seeded.
 *
 * Usage:
 *   npm run research:seed              # seed all published cases
 *   npm run research:seed -- --dry-run # preview without writing
 *   npm run research:seed -- --slug=benidorm-1992-0000
 *   npm run research:seed -- --force   # re-seed even if links exist (replaces pending ones)
 */

import { readFileSync } from "fs";
import path from "path";
import { createClient } from "@sanity/client";

function loadEnvLocal() {
  try {
    const contents = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* no .env.local */ }
}

loadEnvLocal();

// ── CCAA gazettes ─────────────────────────────────────────────────────────────

const CCAA_GAZETTE: Record<string, { name: string; searchUrl: (m: string, y: number) => string }> = {
  "Andalucía":           { name: "BOJA",  searchUrl: (m, y) => `https://www.juntadeandalucia.es/buscar.html?q=${enc(m + " urbanismo incendio")}` },
  "Aragón":              { name: "BOA",   searchUrl: (m, y) => `https://www.boa.aragon.es/cgi-bin/EBOA/BRSCGI?CMD=VERDOC&SECT=BUSCADO&CONF=BDIELO.cnf&base=BOA&WORD=${enc(m + " " + y)}` },
  "Asturias":            { name: "BOPA",  searchUrl: (m, y) => `https://sede.asturias.es/bopa#q=${enc(m + " " + y)}` },
  "Baleares":            { name: "BOIB",  searchUrl: (m, y) => `https://www.caib.es/boib/buscadorResultados.do?search=${enc(m + " urbanismo " + y)}` },
  "Canarias":            { name: "BOC",   searchUrl: (m, y) => `https://www.google.com/search?q=site:gobiernodecanarias.org/boc+${enc(m + " urbanismo " + y)}` },
  "Cantabria":           { name: "BOC",   searchUrl: (m, y) => `https://boc.cantabria.es/boces/verBuscador.do?texto=${enc(m + " " + y)}` },
  "Castilla-La Mancha":  { name: "DOCM",  searchUrl: (m, y) => `https://docm.castillalamancha.es/buscador/?q=${enc(m + " urbanismo")}` },
  "Castilla y León":     { name: "BOCyL", searchUrl: (m, y) => `https://www.google.com/search?q=site:bocyl.jcyl.es+${enc(m + " urbanismo " + y)}` },
  "Cataluña":            { name: "DOGC",  searchUrl: (m, y) => `https://dogc.gencat.cat/ca/inici/?text=${enc(m + " urbanisme")}` },
  "Comunidad Valenciana":{ name: "DOGV",  searchUrl: (m, y) => `https://www.google.com/search?q=site:dogv.gva.es+${enc(m + " urbanismo " + y)}` },
  "Extremadura":         { name: "DOE",   searchUrl: (m, y) => `https://doe.juntaex.es/index.php?q=${enc(m + " " + y)}` },
  "Galicia":             { name: "DOG",   searchUrl: (m, y) => `https://www.google.com/search?q=site:xunta.gal/dog+${enc(m + " urbanismo " + y)}` },
  "La Rioja":            { name: "BOR",   searchUrl: (m, y) => `https://ias1.larioja.org/boletin/Bor_Boletin.buscador?n_q=${enc(m + " " + y)}` },
  "Madrid":              { name: "BOCM",  searchUrl: (m, y) => `https://www.bocm.es/boletin/CM_Orden_BOCM/buscador?texto=${enc(m + " urbanismo")}` },
  "Murcia":              { name: "BORM",  searchUrl: (m, y) => `https://www.borm.es/borm/vista/buscador/buscar.jsf?texto=${enc(m + " " + y)}` },
  "Navarra":             { name: "BON",   searchUrl: (m, y) => `https://bon.navarra.es/es/boletin/-/boletin/search?texto=${enc(m + " urbanismo")}` },
  "País Vasco":          { name: "BOPV",  searchUrl: (m, y) => `https://www.euskadi.eus/y22-bopv/es/bopv2/datos/buscador/?q=${enc(m + " " + y)}` },
};

function enc(s: string) { return encodeURIComponent(s); }

// ── URL generators ────────────────────────────────────────────────────────────

function cendojUrl(municipality: string, fromYear: number, toYear: number): string {
  return `https://www.poderjudicial.es/search/indexAN.jsp#texto=${enc("incendio forestal " + municipality)}&fechaDesde=${fromYear}-01-01&fechaHasta=${toYear}-12-31`;
}

function boeUrl(municipality: string, fromYear: number, toYear: number): string {
  const capped = Math.min(toYear, new Date().getFullYear());
  const params = new URLSearchParams({
    "campo[0]": "ORIS", "dato[0][1]": "1", "dato[0][2]": "2", "dato[0][3]": "3",
    "dato[0][4]": "4", "dato[0][5]": "5", "dato[0][T]": "T", "operador[0]": "and",
    "campo[1]": "TITULOS", "dato[1]": municipality, "operador[1]": "and",
    "campo[6]": "FPU", "dato[6][0]": `${fromYear}-01-01`, "dato[6][1]": `${capped}-12-31`,
  });
  return `https://www.boe.es/buscar/boe.php?${params.toString()}`;
}

function elPaisUrl(m: string, y: number): string {
  return `https://elpais.com/buscador/?q=${enc("incendio " + m)}&df=${y}-01-01&dt=${y + 5}-12-31`;
}

function elMundoUrl(m: string): string {
  return `https://ariadna.elmundo.es/buscador/archivo.html?q=${enc("incendio forestal " + m)}`;
}

function abcUrl(m: string, y: number): string {
  return `https://www.abc.es/hemeroteca/?q=${enc("incendio " + m)}&fromDate=${y}-01-01&toDate=${y + 5}-12-31`;
}

function catastroUrl(lat?: number, lng?: number): string {
  if (!lat || !lng) return "https://www.sedecatastro.gob.es/";
  const r = 0.02;
  return `https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=CP:CadastralParcel&SRSNAME=EPSG:4326&BBOX=${lat - r},${lng - r},${lat + r},${lng + r},urn:ogc:def:crs:EPSG::4326`;
}

function googleMapsUrl(lat?: number, lng?: number): string {
  if (!lat || !lng) return "";
  return `https://www.google.com/maps/@${lat},${lng},14z/data=!3m1!1e3`;
}

// ── Build link definitions for a case ────────────────────────────────────────

function buildLinks(doc: {
  _id: string;
  slug: string;
  municipality: string;
  region: string;
  year: number;
  coordinates?: { lat: number; lng: number };
}): Array<{ label: string; url: string; sourceType: string; note: string }> {
  const from = doc.year + 1;
  const to = doc.year + 15;
  const gazette = CCAA_GAZETTE[doc.region];
  const links = [];

  links.push({
    label: `CENDOJ — sentencias "incendio forestal ${doc.municipality}"`,
    url: cendojUrl(doc.municipality, from, to),
    sourceType: "CENDOJ",
    note: "Búsqueda de sentencias penales. Abre en el navegador (puede pedir CAPTCHA). Busca condenas por incendio forestal o urbanismo.",
  });

  links.push({
    label: `BOE — documentos nacionales "${doc.municipality}" (${from}–${to})`,
    url: boeUrl(doc.municipality, from, to),
    sourceType: "BOE",
    note: "El BOE contiene legislación nacional. Los PGOU y planes parciales están en el boletín autonómico, no en el BOE.",
  });

  if (gazette) {
    links.push({
      label: `${gazette.name} — "${doc.municipality}" urbanismo (${from}–${to})`,
      url: gazette.searchUrl(doc.municipality, from),
      sourceType: "CCAA",
      note: `Boletín Oficial de ${doc.region}. Aquí se publican los PGOU, planes parciales y reclasificaciones de suelo.`,
    });
  }

  links.push({
    label: `El País — "incendio ${doc.municipality}" (${doc.year}–${doc.year + 5})`,
    url: elPaisUrl(doc.municipality, doc.year),
    sourceType: "ElPais",
    note: "Hemeroteca El País. Busca artículos sobre el incendio y su aftermath.",
  });

  links.push({
    label: `El Mundo — "incendio forestal ${doc.municipality}"`,
    url: elMundoUrl(doc.municipality),
    sourceType: "ElMundo",
    note: "Hemeroteca El Mundo.",
  });

  links.push({
    label: `ABC — "incendio ${doc.municipality}" (${doc.year}–${doc.year + 5})`,
    url: abcUrl(doc.municipality, doc.year),
    sourceType: "ABC",
    note: "Hemeroteca ABC.",
  });

  const catUrl = catastroUrl(doc.coordinates?.lat, doc.coordinates?.lng);
  links.push({
    label: `Catastro INSPIRE WFS — parcelas en área del incendio`,
    url: catUrl,
    sourceType: "Catastro",
    note: "Consulta WFS directa. Devuelve XML con parcelas en un radio de ~2km alrededor del centroide del incendio.",
  });

  const mapsUrl = googleMapsUrl(doc.coordinates?.lat, doc.coordinates?.lng);
  if (mapsUrl) {
    links.push({
      label: `Google Maps satélite — ${doc.municipality}`,
      url: mapsUrl,
      sourceType: "Maps",
      note: "Vista satélite del área afectada. Usa el historial de imágenes para ver antes/después.",
    });
  }

  return links;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith("--"))
      .map(a => {
        const [k, ...v] = a.slice(2).split("=");
        return [k, v.length ? v.join("=") : "true"];
      })
  );

  const dryRun     = args["dry-run"] === "true";
  const slugFilter = args["slug"] ?? null;
  const force      = args["force"] === "true";

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset   = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");
  const token     = process.env.SANITY_WRITE_TOKEN;

  if (!projectId || !dataset || (!token && !dryRun)) {
    console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID, NEXT_PUBLIC_SANITY_DATASET, or SANITY_WRITE_TOKEN");
    process.exit(1);
  }

  const client = createClient({
    projectId, dataset, token: token ?? "",
    apiVersion: "2026-05-19",
    useCdn: false,
  });

  console.log(`\nSeed research links`);
  if (dryRun) console.log(`  Mode: DRY RUN`);

  // Fetch published cases
  const cases = await client.fetch<Array<{
    _id: string;
    slug: string;
    title: string;
    municipality: string;
    region: string;
    year: number;
    coordinates?: { lat: number; lng: number };
  }>>(
    slugFilter
      ? `*[_type == "case" && hidden == false && slug.current == $slug]{ _id, "slug": slug.current, title, municipality, region, year, coordinates }`
      : `*[_type == "case" && hidden == false]{ _id, "slug": slug.current, title, municipality, region, year, coordinates }`,
    slugFilter ? { slug: slugFilter } : {}
  );

  console.log(`  Cases: ${cases.length}`);

  // Find cases that already have research links
  const existingSlugs = new Set<string>(
    await client.fetch<string[]>(`*[_type == "researchLink"].caseSlug`)
  );

  let seeded = 0, skipped = 0, failed = 0;

  for (const doc of cases) {
    if (existingSlugs.has(doc.slug) && !force) {
      skipped++;
      continue;
    }

    const links = buildLinks(doc);

    if (dryRun) {
      console.log(`  [DRY RUN] ${doc.slug} — ${links.length} links`);
      links.forEach(l => console.log(`    · [${l.sourceType}] ${l.label.slice(0, 70)}`));
      seeded++;
      continue;
    }

    // If force, delete existing pending links first
    if (force && existingSlugs.has(doc.slug)) {
      const existingIds = await client.fetch<string[]>(
        `*[_type == "researchLink" && caseSlug == $slug && status == "pending"]._id`,
        { slug: doc.slug }
      );
      for (const id of existingIds) {
        await client.delete(id);
      }
    }

    // Create one researchLink doc per link
    for (const link of links) {
      const id = `rl-${doc.slug}-${link.sourceType.toLowerCase()}`;
      try {
        await client.createOrReplace({
          _type: "researchLink",
          _id: id,
          case: { _type: "reference", _ref: doc._id },
          caseSlug: doc.slug,
          label: link.label,
          url: link.url,
          sourceType: link.sourceType,
          status: "pending",
          note: link.note,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ ${id}: ${msg}`);
        failed++;
      }
    }

    process.stdout.write(`  ✓ ${doc.slug} — ${links.length} links\n`);
    seeded++;
  }

  console.log(`\n── Summary ──────────────────────────────────`);
  console.log(`   Seeded:  ${seeded} cases`);
  console.log(`   Skipped: ${skipped} (already seeded — use --force to re-seed)`);
  if (failed) console.log(`   Failed:  ${failed}`);
  console.log(`\nOpen the research UI: http://localhost:3000/research\n`);
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
