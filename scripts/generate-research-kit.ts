#!/usr/bin/env tsx
/**
 * generate-research-kit.ts
 *
 * Generates a research kit CSV for editorial teams — one row per published case,
 * with pre-filled search URLs for every relevant Spanish public data source.
 *
 * The political/judicial layer cannot be automated:
 *   - CENDOJ (judicial) triggers CAPTCHA for programmatic access
 *   - Urban planning docs (PGOU) are in 17 different CCAA gazettes
 *   - Property ownership is behind the Registro de la Propiedad (paywalled)
 *
 * This script automates the research SETUP: each URL opens the right search
 * page pre-filtered for the specific case, so journalists click once and land
 * in exactly the right place rather than starting from scratch.
 *
 * Output: scripts/data/research-kit.csv
 *
 * Usage:
 *   npm run research:kit
 *   npm run research:kit -- --min-ha=500    # only large fires
 *   npm run research:kit -- --region=Galicia
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { createClient } from "@sanity/client";

// ── Load .env.local ───────────────────────────────────────────────────────────

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

// ── CCAA gazette URLs ─────────────────────────────────────────────────────────

const CCAA_GAZETTE: Record<string, { name: string; searchUrl: (q: string) => string }> = {
  "Andalucía": {
    name: "BOJA",
    searchUrl: (q) => `https://www.juntadeandalucia.es/boja/buscador?texto=${encodeURIComponent(q)}`,
  },
  "Aragón": {
    name: "BOA",
    searchUrl: (q) => `https://www.boa.aragon.es/cgi-bin/EBOA/BRSCGI?CMD=VERDOC&SECT=BUSCADO&CONF=BDIELO.cnf&base=BOA&SAMEH=ORD&rng=10&SAMEP=1&WORD=${encodeURIComponent(q)}`,
  },
  "Asturias": {
    name: "BOPA",
    searchUrl: (q) => `https://sede.asturias.es/bopa#q=${encodeURIComponent(q)}`,
  },
  "Baleares": {
    name: "BOIB",
    searchUrl: (q) => `https://www.caib.es/boib/buscadorResultados.do?search=${encodeURIComponent(q)}`,
  },
  "Canarias": {
    name: "BOC",
    searchUrl: (q) => `https://www.gobiernodecanarias.org/boc/busqueda/?q=${encodeURIComponent(q)}`,
  },
  "Cantabria": {
    name: "BOC",
    searchUrl: (q) => `https://boc.cantabria.es/boces/verBuscador.do?texto=${encodeURIComponent(q)}`,
  },
  "Castilla-La Mancha": {
    name: "DOCM",
    searchUrl: (q) => `https://docm.castillalamancha.es/buscador/?q=${encodeURIComponent(q)}`,
  },
  "Castilla y León": {
    name: "BOCyL",
    searchUrl: (q) => `https://bocyl.jcyl.es/buscador.do?texto=${encodeURIComponent(q)}`,
  },
  "Cataluña": {
    name: "DOGC",
    searchUrl: (q) => `https://dogc.gencat.cat/ca/pdogc_canals_interns/pdogc_cercaavancada/?text=${encodeURIComponent(q)}`,
  },
  "Comunidad Valenciana": {
    name: "DOGV",
    searchUrl: (q) => `https://www.dogv.gva.es/datos/2024/01/10/pdf/2024_122.pdf`, // Base - use text search
    // Note: DOGV search is at https://www.dogv.gva.es/portal/ficha_disposicion_pc.jsp?text=QUERY
  },
  "Extremadura": {
    name: "DOE",
    searchUrl: (q) => `https://doe.juntaex.es/web/guest/buscador?p_p_id=Buscador_WAR_buscadorportlet&_Buscador_WAR_buscadorportlet_query=${encodeURIComponent(q)}`,
  },
  "Galicia": {
    name: "DOG",
    searchUrl: (q) => `https://www.xunta.gal/dog/Publicados/search?query=${encodeURIComponent(q)}`,
  },
  "La Rioja": {
    name: "BOR",
    searchUrl: (q) => `https://ias1.larioja.org/boletin/Bor_Boletin.buscador?capa=0&n_q=${encodeURIComponent(q)}`,
  },
  "Madrid": {
    name: "BOCM",
    searchUrl: (q) => `https://www.bocm.es/boletin/CM_Boletin_BOCM/2024/04/10/BOCM-20240410-1.PDF`, // Base
  },
  "Murcia": {
    name: "BORM",
    searchUrl: (q) => `https://www.borm.es/borm/vista/buscador/buscar.jsf?texto=${encodeURIComponent(q)}`,
  },
  "Navarra": {
    name: "BON",
    searchUrl: (q) => `https://bon.navarra.es/es/boletin/-/boletin/search?texto=${encodeURIComponent(q)}`,
  },
  "País Vasco": {
    name: "BOPV",
    searchUrl: (q) => `https://www.euskadi.eus/bopv2/datos/2024/01/2400001a.pdf`, // Base
  },
};

function gazettSearchUrl(region: string, municipality: string, fromYear: number, toYear: number): string {
  const gazette = CCAA_GAZETTE[region];
  if (!gazette) return "";
  const query = `${municipality} plan urbanismo ${fromYear}`;
  return gazette.searchUrl(query);
}

// ── Pre-filled search URLs per source ─────────────────────────────────────────

function cendojUrl(municipality: string, fromYear: number, toYear: number): string {
  const text = `incendio forestal ${municipality}`;
  // Note: CENDOJ requires session cookie + may trigger CAPTCHA for bots
  // These URLs work when opened manually in a browser
  return `https://www.poderjudicial.es/search/indexAN.jsp#texto=${encodeURIComponent(text)}&fechaDesde=${fromYear}-01-01&fechaHasta=${toYear}-12-31`;
}

function boeUrl(municipality: string, fromYear: number, toYear: number): string {
  const params = new URLSearchParams({
    "campo[0]": "ORIS", "dato[0][1]": "1", "dato[0][2]": "2", "dato[0][3]": "3",
    "dato[0][4]": "4", "dato[0][5]": "5", "dato[0][T]": "T", "operador[0]": "and",
    "campo[1]": "TITULOS", "dato[1]": municipality, "operador[1]": "and",
    "campo[6]": "FPU",
    "dato[6][0]": `${fromYear}-01-01`,
    "dato[6][1]": `${Math.min(toYear, new Date().getFullYear())}-12-31`,
  });
  return `https://www.boe.es/buscar/boe.php?${params.toString()}`;
}

function elPaisUrl(municipality: string, fromYear: number): string {
  return `https://elpais.com/buscador/?q=${encodeURIComponent(`incendio ${municipality}`)}&df=${fromYear}-01-01&dt=${fromYear + 5}-12-31`;
}

function elMundoUrl(municipality: string, fromYear: number): string {
  return `https://www.elmundo.es/buscador.html?q=${encodeURIComponent(`incendio forestal ${municipality}`)}`;
}

function abcUrl(municipality: string, fromYear: number): string {
  return `https://www.abc.es/hemeroteca/?q=${encodeURIComponent(`incendio ${municipality}`)}&fromDate=${fromYear}-01-01&toDate=${fromYear + 5}-12-31`;
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

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvEscape(val: string | number | undefined): string {
  if (val === undefined || val === null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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

  const minHa        = parseFloat(args["min-ha"] ?? "0");
  const regionFilter = args["region"] ?? null;

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset   = process.env.NEXT_PUBLIC_SANITY_DATASET?.replace(/["']/g, "");

  if (!projectId || !dataset) {
    console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID or NEXT_PUBLIC_SANITY_DATASET");
    process.exit(1);
  }

  const client = createClient({
    projectId, dataset, token: "",
    apiVersion: "2026-05-19",
    useCdn: true,
  });

  let docs = await client.fetch<Array<{
    slug: string;
    title: string;
    municipality: string;
    region: string;
    year: number;
    hectares: number;
    status: string;
    coordinates?: { lat: number; lng: number };
    connections?: unknown[];
    judicial?: unknown[];
  }>>(`
    *[_type == "case" && hidden == false] | order(hectares desc) {
      "slug": slug.current, title, municipality, region, year, hectares, status, coordinates,
      connections, judicial
    }
  `);

  if (minHa > 0) docs = docs.filter(d => d.hectares >= minHa);
  if (regionFilter) docs = docs.filter(d => d.region === regionFilter);

  console.log(`\nResearch kit — ${docs.length} published cases`);

  const headers = [
    "slug",
    "title",
    "municipality",
    "region",
    "year",
    "hectares",
    "status",
    "has_connections",
    "has_judicial",
    "CENDOJ (sentencias)",
    "BOE (nacional)",
    `CCAA gazette`,
    "El País hemeroteca",
    "El Mundo",
    "ABC hemeroteca",
    "Catastro WFS",
    "Google Maps satélite",
    "Sanity Studio",
  ];

  const rows = docs.map(doc => {
    const from = doc.year + 1;
    const to = doc.year + 15;
    const gazette = CCAA_GAZETTE[doc.region];

    return [
      doc.slug,
      doc.title,
      doc.municipality,
      doc.region,
      doc.year,
      doc.hectares,
      doc.status,
      doc.connections && doc.connections.length > 0 ? "sí" : "",
      doc.judicial && doc.judicial.length > 0 ? "sí" : "",
      cendojUrl(doc.municipality, from, to),
      boeUrl(doc.municipality, from, to),
      gazette ? gazettSearchUrl(doc.region, doc.municipality, from, to) : `(${doc.region} — buscar gazette manualmente)`,
      elPaisUrl(doc.municipality, doc.year),
      elMundoUrl(doc.municipality, doc.year),
      abcUrl(doc.municipality, doc.year),
      catastroUrl(doc.coordinates?.lat, doc.coordinates?.lng),
      googleMapsUrl(doc.coordinates?.lat, doc.coordinates?.lng),
      `https://antestodoestoeracampo.es/studio/desk/case;${doc.slug}`,
    ].map(csvEscape).join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const outPath = path.join("scripts/data/research-kit.csv");
  writeFileSync(outPath, "\uFEFF" + csv, "utf-8"); // BOM for Excel compatibility

  console.log(`  Written: ${outPath}`);
  console.log(`\nOpen in Google Sheets or Excel.`);
  console.log(`Each row = one case. Each URL column = pre-filled search for that source.\n`);
  console.log(`Columns:`);
  console.log(`  CENDOJ        — criminal sentences (open in browser; may trigger CAPTCHA)`);
  console.log(`  BOE           — national-level documents (laws, court notices)`);
  console.log(`  CCAA gazette  — regional official gazette (PGOU, land reclassification)`);
  console.log(`  El País / El Mundo / ABC — press archive search`);
  console.log(`  Catastro WFS  — raw parcel data around fire centroid`);
  console.log(`  Google Maps   — satellite view of fire area\n`);
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
