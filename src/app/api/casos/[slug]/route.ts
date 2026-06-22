import { NextRequest, NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";
import { caseBySlugQuery, approvedSearchLinksQuery } from "@/sanity/lib/queries";
import type { CaseDetail } from "@/types/case";
import type { PortableTextBlock } from "@portabletext/react";

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

/** Portable Text → plain-text paragraphs */
function overviewText(blocks?: PortableTextBlock[]): string[] {
  if (!blocks) return [];
  return blocks
    .map(b =>
      Array.isArray(b.children)
        ? b.children.map(c => (typeof c.text === "string" ? c.text : "")).join("")
        : ""
    )
    .filter(Boolean);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const format = req.nextUrl.searchParams.get("format") ?? "json";
  const [c, busquedas] = await Promise.all([
    client.fetch<CaseDetail | null>(caseBySlugQuery, { slug }),
    client.fetch<Array<{ label: string; url: string; sourceType: string }>>(
      approvedSearchLinksQuery,
      { slug }
    ),
  ]);

  if (!c) {
    return NextResponse.json({ error: "Caso no encontrado" }, { status: 404, headers: HEADERS });
  }

  if (format === "csv") {
    // Flat rows: one per timeline event, judicial event and source
    const header = ["seccion", "fecha", "tipo", "titulo", "descripcion", "url"];
    const rows: Array<Array<string | number | undefined>> = [
      ...(c.timeline ?? []).map(t => ["cronologia", t.date, t.type, t.title, t.description, ""]),
      ...(c.judicial ?? []).map(j => ["judicial", j.date, j.result, j.court, j.description, ""]),
      ...(c.sources ?? []).map(s => ["fuente", "", s.type, s.label, s.note, s.url]),
      ...busquedas.map(b => ["busqueda", "", b.sourceType, b.label, "", b.url]),
    ];
    const meta = [
      `# ${c.title} — ${c.hectares} ha, ${c.municipality} (${c.region}), ${c.year}`,
      `# Estado: ${c.status} · ${SITE}/casos/${c.slug}`,
    ];
    const csv =
      "﻿" +
      [...meta, header.join(","), ...rows.map(r => r.map(csvField).join(","))].join("\n");
    return new NextResponse(csv, {
      headers: {
        ...HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="antestodoestoeracampo-${c.slug}.csv"`,
      },
    });
  }

  return NextResponse.json(
    {
      fuente: `${SITE}/casos/${c.slug}`,
      slug: c.slug,
      titulo: c.title,
      municipio: c.municipality,
      region: c.region,
      año: c.year,
      hectareas: c.hectares,
      estado: c.status,
      coordenadas: c.coordinates ?? null,
      resumen: c.excerpt,
      caso: overviewText(c.overview),
      cronologia: c.timeline ?? [],
      conexiones: c.connections ?? [],
      judicial: c.judicial ?? [],
      fuentes: c.sources ?? [],
      busquedas,
    },
    { headers: HEADERS }
  );
}
