"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { CaseSummary, CaseStatus } from "@/types/case";

// ── Shared tokens ─────────────────────────────────────────────────────────────

const ACCENT = "#C4622D";
const FOREST = "#2D4A3E";
const BORDER = "#E2DDD6";
const MUTED  = "#8C8880";
const FG     = "#1A180F";
const MONO   = "var(--font-jetbrains-mono, 'JetBrains Mono', monospace)";
const SANS   = "var(--font-inter, Inter, system-ui, sans-serif)";

const STATUS_COLORS: Record<CaseStatus, string> = {
  "Sentencia firme":   ACCENT,
  "En investigación":  FOREST,
  "Archivado":         MUTED,
  "Sobreseído":        "#B5B0A8",
};

// ── Chart 1: cases by year ────────────────────────────────────────────────────

function ChartByYear({ cases }: { cases: CaseSummary[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !cases.length) return;

    const byYear = d3.rollup(cases, v => v.length, d => d.year);
    const minY   = d3.min([...byYear.keys()])!;
    const maxY   = d3.max([...byYear.keys()])!;
    const years  = d3.range(minY, maxY + 1);
    const data   = years.map(y => ({ year: y, count: byYear.get(y) ?? 0 }));

    const W = 800, H = 200;
    const m = { top: 16, right: 16, bottom: 28, left: 28 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${W} ${H}`);

    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    const x = d3.scaleBand()
      .domain(years.map(String))
      .range([0, iw])
      .padding(0.25);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.count)! + 1])
      .range([ih, 0]);

    // Grid lines
    g.append("g")
      .call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(() => ""))
      .call(gg => gg.select(".domain").remove())
      .call(gg => gg.selectAll("line")
        .attr("stroke", BORDER)
        .attr("stroke-dasharray", "2,3"));

    // Bars
    g.selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x",      d => x(String(d.year))!)
      .attr("y",      d => y(d.count))
      .attr("width",  x.bandwidth())
      .attr("height", d => ih - y(d.count))
      .attr("fill",   d => d.count > 0 ? ACCENT : BORDER)
      .attr("rx", 1);

    // X axis — every other year
    g.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x)
        .tickValues(years.filter((_, i) => i % 2 === 0).map(String))
        .tickSize(3))
      .call(gg => gg.select(".domain").attr("stroke", BORDER))
      .call(gg => gg.selectAll("line").attr("stroke", BORDER))
      .call(gg => gg.selectAll("text")
        .attr("fill", MUTED)
        .attr("font-size", "11px")
        .attr("font-family", MONO)
        .attr("dy", "1.4em"));

    // Y axis
    g.append("g")
      .call(d3.axisLeft(y).ticks(4).tickSize(0))
      .call(gg => gg.select(".domain").remove())
      .call(gg => gg.selectAll("text")
        .attr("fill", MUTED)
        .attr("font-size", "11px")
        .attr("font-family", MONO)
        .attr("dx", "-4px"));

  }, [cases]);

  return <svg ref={svgRef} className="w-full" />;
}

// ── Chart 2: hectares by region ───────────────────────────────────────────────

function ChartByRegion({ cases }: { cases: CaseSummary[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !cases.length) return;

    const byRegion = d3.rollup(
      cases,
      v => ({ ha: d3.sum(v, d => d.hectares ?? 0), count: v.length }),
      d => d.region ?? "Sin región"
    );

    const data = [...byRegion.entries()]
      .map(([region, { ha, count }]) => ({ region, ha, count }))
      .sort((a, b) => b.ha - a.ha);

    const ROW_H = 34;
    const W = 800;
    const H = data.length * ROW_H + 16;
    const m = { top: 4, right: 100, bottom: 4, left: 168 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${W} ${H}`);

    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    const x = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.ha)!])
      .range([0, iw])
      .nice();

    const y = d3.scaleBand()
      .domain(data.map(d => d.region))
      .range([0, ih])
      .padding(0.35);

    // Track
    g.selectAll(".track")
      .data(data)
      .join("rect")
      .attr("class", "track")
      .attr("x", 0)
      .attr("y", d => y(d.region)!)
      .attr("width", iw)
      .attr("height", y.bandwidth())
      .attr("fill", BORDER)
      .attr("rx", 1);

    // Bar
    g.selectAll(".bar")
      .data(data)
      .join("rect")
      .attr("class", "bar")
      .attr("x", 0)
      .attr("y", d => y(d.region)!)
      .attr("width", d => x(d.ha))
      .attr("height", y.bandwidth())
      .attr("fill", FOREST)
      .attr("rx", 1);

    // Region label left
    g.selectAll(".lbl-region")
      .data(data)
      .join("text")
      .attr("class", "lbl-region")
      .attr("x", -10)
      .attr("y", d => y(d.region)! + y.bandwidth() / 2)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("fill", FG)
      .attr("font-size", "12px")
      .attr("font-family", SANS)
      .text(d => d.region);

    // Ha label right
    g.selectAll(".lbl-ha")
      .data(data)
      .join("text")
      .attr("class", "lbl-ha")
      .attr("x", iw + 10)
      .attr("y", d => y(d.region)! + y.bandwidth() / 2)
      .attr("dominant-baseline", "middle")
      .attr("fill", MUTED)
      .attr("font-size", "11px")
      .attr("font-family", MONO)
      .text(d => d.ha >= 1000
        ? `${(d.ha / 1000).toFixed(0)}k ha`
        : `${d.ha} ha`);

  }, [cases]);

  return <svg ref={svgRef} className="w-full" />;
}

// ── Chart 3: status breakdown ─────────────────────────────────────────────────

function ChartByStatus({ cases }: { cases: CaseSummary[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !cases.length) return;

    const byStatus = d3.rollup(cases, v => v.length, d => d.status ?? "Archivado");
    const statuses: CaseStatus[] = ["Sentencia firme", "En investigación", "Archivado", "Sobreseído"];
    const data = statuses
      .map(s => ({ status: s, count: byStatus.get(s) ?? 0 }))
      .filter(d => d.count > 0);
    const total = d3.sum(data, d => d.count);

    const W = 800, BAR_H = 28, LEGEND_H = 52;
    const H = BAR_H + LEGEND_H;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${W} ${H}`);

    const g = svg.append("g");

    // Stacked bar
    let cursor = 0;
    const segments = data.map(d => {
      const w = (d.count / total) * W;
      const seg = { ...d, x: cursor, w };
      cursor += w;
      return seg;
    });

    g.selectAll("rect")
      .data(segments)
      .join("rect")
      .attr("x",      d => d.x)
      .attr("y",      0)
      .attr("width",  d => Math.max(0, d.w - 1))
      .attr("height", BAR_H)
      .attr("fill",   d => STATUS_COLORS[d.status as CaseStatus] ?? MUTED);

    // Legend below — 2 per row
    const legendG = g.append("g").attr("transform", `translate(0,${BAR_H + 14})`);
    const COL_W = W / 2;

    segments.forEach((d, i) => {
      const lx = (i % 2) * COL_W;
      const ly = Math.floor(i / 2) * 22;
      const color = STATUS_COLORS[d.status as CaseStatus] ?? MUTED;

      legendG.append("circle")
        .attr("cx", lx + 5).attr("cy", ly + 5).attr("r", 4)
        .attr("fill", color);

      legendG.append("text")
        .attr("x", lx + 16).attr("y", ly + 5)
        .attr("dominant-baseline", "middle")
        .attr("fill", FG)
        .attr("font-size", "12px")
        .attr("font-family", SANS)
        .text(d.status);

      legendG.append("text")
        .attr("x", lx + 16 + d.status.length * 7.2)
        .attr("y", ly + 5)
        .attr("dominant-baseline", "middle")
        .attr("fill", MUTED)
        .attr("font-size", "11px")
        .attr("font-family", MONO)
        .text(`  ${d.count} (${Math.round((d.count / total) * 100)}%)`);
    });

  }, [cases]);

  return <svg ref={svgRef} className="w-full" />;
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function DatosCharts({ cases }: { cases: CaseSummary[] }) {
  return (
    <div className="max-w-4xl mx-auto px-6 md:px-12 pb-24 space-y-20">

      <section>
        <p className="type-label mb-3" style={{ color: "var(--muted)" }}>
          Casos documentados · por año
        </p>
        <h2 className="type-h3 mb-8" style={{ color: "var(--foreground)" }}>
          Distribución temporal
        </h2>
        <ChartByYear cases={cases} />
        <p className="type-small mt-4" style={{ color: "var(--muted)" }}>
          Casos publicados con datos catastrales. No representa el total de incendios en España.
        </p>
      </section>

      <hr style={{ borderColor: "var(--border)" }} />

      <section>
        <p className="type-label mb-3" style={{ color: "var(--muted)" }}>
          Superficie · por comunidad autónoma
        </p>
        <h2 className="type-h3 mb-8" style={{ color: "var(--foreground)" }}>
          Hectáreas calcinadas por región
        </h2>
        <ChartByRegion cases={cases} />
        <p className="type-small mt-4" style={{ color: "var(--muted)" }}>
          Suma de hectáreas en los casos documentados. Fuente: EGIF (MITECO).
        </p>
      </section>

      <hr style={{ borderColor: "var(--border)" }} />

      <section>
        <p className="type-label mb-3" style={{ color: "var(--muted)" }}>
          Estado judicial · casos documentados
        </p>
        <h2 className="type-h3 mb-8" style={{ color: "var(--foreground)" }}>
          ¿Qué pasó en los tribunales?
        </h2>
        <ChartByStatus cases={cases} />
        <p className="type-small mt-6" style={{ color: "var(--muted)" }}>
          Estado actual de los {cases.length} casos en esta base de datos.
        </p>
      </section>

    </div>
  );
}
