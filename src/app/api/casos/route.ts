import { NextRequest, NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";
import { allCasesQuery } from "@/sanity/lib/queries";
import type { CaseSummary } from "@/types/case";

export const revalidate = 300;

const SITE = "https://antestodoestoeracampo.es";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

function csvField(v: string | number | undefined | null) {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function caseRow(c: CaseSummary) {
  return {
    slug: c.slug,
    titulo: c.title,
    municipio: c.municipality,
    region: c.region,
    año: c.year,
    hectareas: c.hectares,
    parcelas_urbanas_modificadas: c.urbanParcels ?? null,
    motivacion_egif: c.motivation ?? null,
    codigo_motivacion_egif: c.motivationCode ?? null,
    estado: c.status,
    lat: c.coordinates?.lat ?? null,
    lng: c.coordinates?.lng ?? null,
    url: `${SITE}/casos/${c.slug}`,
  };
}

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format") ?? "json";
  const cases: CaseSummary[] = await client.fetch(allCasesQuery);

  if (format === "csv") {
    const rows = cases.map(caseRow);
    const header = Object.keys(rows[0] ?? {});
    const csv =
      "﻿" +
      [header.join(","), ...rows.map(r => header.map(h => csvField(r[h as keyof typeof r])).join(","))].join("\n");
    return new NextResponse(csv, {
      headers: {
        ...HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="antestodoestoeracampo-casos.csv"`,
      },
    });
  }

  if (format === "geojson") {
    const features = cases
      .filter(c => c.coordinates)
      .map(c => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [c.coordinates!.lng, c.coordinates!.lat] },
        properties: (({ lat: _lat, lng: _lng, ...rest }) => rest)(caseRow(c)),
      }));
    return NextResponse.json(
      { type: "FeatureCollection", features },
      { headers: { ...HEADERS, "Content-Type": "application/geo+json; charset=utf-8" } }
    );
  }

  return NextResponse.json(
    {
      fuente: SITE,
      descripcion:
        "Incendios forestales intencionados (≥100 ha, EGIF/MITECO) con análisis de modificaciones catastrales posteriores (Catastro INSPIRE). Metodología: " +
        `${SITE}/metodologia`,
      generado: new Date().toISOString(),
      total: cases.length,
      casos: cases.map(caseRow),
    },
    { headers: HEADERS }
  );
}
