"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { CaseSummary, CaseStatus } from "@/types/case";
import { convictionRateByYear } from "@/data/justicia";

// ── Shared tokens ─────────────────────────────────────────────────────────────

const ACCENT = "#C4622D";
const FOREST = "#2D4A3E";
const BORDER = "#E2DDD6";
const MUTED  = "#8C8880";
const FG     = "#1A180F";
const MONO   = "var(--font-jetbrains-mono, 'JetBrains Mono', monospace)";
const SANS   = "var(--font-inter, Inter, system-ui, sans-serif)";

// Draw at the container's real width so in-chart text keeps its true pixel
// size on mobile (a fixed 800px viewBox scales 11px labels down to ~5px).
function useMeasuredWidth(ref: React.RefObject<SVGSVGElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(Math.round(w));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

const STATUS_COLORS: Record<CaseStatus, string> = {
  "Sentencia firme":   ACCENT,
  "En investigación":  FOREST,
  "Archivado":         MUTED,
  "Sobreseído":        "#B5B0A8",
};

// ── Chart 1: cases by year ────────────────────────────────────────────────────

function ChartByYear({ cases }: { cases: CaseSummary[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const width = useMeasuredWidth(svgRef);

  useEffect(() => {
    if (!svgRef.current || !cases.length || !width) return;

    const byYear = d3.rollup(cases, v => v.length, d => d.year);
    const minY   = d3.min([...byYear.keys()])!;
    const maxY   = d3.max([...byYear.keys()])!;
    const years  = d3.range(minY, maxY + 1);
    const data   = years.map(y => ({ year: y, count: byYear.get(y) ?? 0 }));

    const narrow = width < 500;
    const W = width, H = 200;
    const m = { top: 16, right: 8, bottom: 28, left: 28 };
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

    // X axis — every other year (every 4th on narrow screens)
    const tickStep = narrow ? 4 : 2;
    g.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x)
        .tickValues(years.filter((_, i) => i % tickStep === 0).map(String))
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

  }, [cases, width]);

  return <svg ref={svgRef} className="w-full" />;
}

// ── Chart 2: hectares by region ───────────────────────────────────────────────

const REGION_ABBR: Record<string, string> = {
  "Comunidad Valenciana": "C. Valenciana",
  "Castilla y León":      "C. y León",
  "Castilla-La Mancha":   "C.-La Mancha",
};

function ChartByRegion({ cases }: { cases: CaseSummary[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const width = useMeasuredWidth(svgRef);

  useEffect(() => {
    if (!svgRef.current || !cases.length || !width) return;

    const byRegion = d3.rollup(
      cases,
      v => ({ ha: d3.sum(v, d => d.hectares ?? 0), count: v.length }),
      d => d.region ?? "Sin región"
    );

    const data = [...byRegion.entries()]
      .map(([region, { ha, count }]) => ({ region, ha, count }))
      .sort((a, b) => b.ha - a.ha);

    const narrow = width < 500;
    const ROW_H = 34;
    const W = width;
    const H = data.length * ROW_H + 16;
    const m = { top: 4, right: narrow ? 58 : 100, bottom: 4, left: narrow ? 104 : 168 };
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
      .attr("font-size", narrow ? "11px" : "12px")
      .attr("font-family", SANS)
      .text(d => narrow ? (REGION_ABBR[d.region] ?? d.region) : d.region);

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
        : `${Math.round(d.ha)} ha`);

  }, [cases, width]);

  return <svg ref={svgRef} className="w-full" />;
}

// ── Chart 3: status breakdown ─────────────────────────────────────────────────

function ChartByStatus({ cases }: { cases: CaseSummary[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const width = useMeasuredWidth(svgRef);

  useEffect(() => {
    if (!svgRef.current || !cases.length || !width) return;

    const byStatus = d3.rollup(cases, v => v.length, d => d.status ?? "Archivado");
    const statuses: CaseStatus[] = ["Sentencia firme", "En investigación", "Archivado", "Sobreseído"];
    const data = statuses
      .map(s => ({ status: s, count: byStatus.get(s) ?? 0 }))
      .filter(d => d.count > 0);
    const total = d3.sum(data, d => d.count);

    const narrow = width < 500;
    const cols = narrow ? 1 : 2;
    const W = width, BAR_H = 28;
    const legendRows = Math.ceil(data.length / cols);
    const H = BAR_H + 14 + legendRows * 22 + 8;

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

    // Legend below — 2 per row (1 per row on narrow screens)
    const legendG = g.append("g").attr("transform", `translate(0,${BAR_H + 14})`);
    const COL_W = W / cols;

    segments.forEach((d, i) => {
      const lx = (i % cols) * COL_W;
      const ly = Math.floor(i / cols) * 22;
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

  }, [cases, width]);

  return <svg ref={svgRef} className="w-full" />;
}

// ── Chart 4: conviction rate over time ────────────────────────────────────────

function ChartConvictionRate() {
  const svgRef = useRef<SVGSVGElement>(null);
  const width = useMeasuredWidth(svgRef);

  useEffect(() => {
    if (!svgRef.current || !width) return;

    const data = convictionRateByYear.map(d => ({
      ...d,
      rate: (d.convictions / d.intentionalFires) * 100,
    }));

    const narrow = width < 500;
    const W = width, H = 240;
    const m = { top: 28, right: 8, bottom: 44, left: 36 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${W} ${H}`);

    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    const x = d3.scaleBand()
      .domain(data.map(d => String(d.year)))
      .range([0, iw])
      .padding(0.35);

    const y = d3.scaleLinear()
      .domain([0, Math.ceil(d3.max(data, d => d.rate)!) + 1])
      .range([ih, 0]);

    // Grid lines
    g.append("g")
      .call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(() => ""))
      .call(gg => gg.select(".domain").remove())
      .call(gg => gg.selectAll("line")
        .attr("stroke", BORDER)
        .attr("stroke-dasharray", "2,3"));

    // Bars
    g.selectAll(".bar")
      .data(data)
      .join("rect")
      .attr("class", "bar")
      .attr("x",      d => x(String(d.year))!)
      .attr("y",      d => y(d.rate))
      .attr("width",  x.bandwidth())
      .attr("height", d => ih - y(d.rate))
      .attr("fill",   ACCENT)
      .attr("rx", 1);

    // Rate label above each bar
    g.selectAll(".lbl-rate")
      .data(data)
      .join("text")
      .attr("class", "lbl-rate")
      .attr("x", d => x(String(d.year))! + x.bandwidth() / 2)
      .attr("y", d => y(d.rate) - 7)
      .attr("text-anchor", "middle")
      .attr("fill", FG)
      .attr("font-size", narrow ? "9px" : "11px")
      .attr("font-family", MONO)
      .text(d => `${d.rate.toFixed(1).replace(".", ",")}%`);

    // Convictions count below each year
    g.selectAll(".lbl-conv")
      .data(data)
      .join("text")
      .attr("class", "lbl-conv")
      .attr("x", d => x(String(d.year))! + x.bandwidth() / 2)
      .attr("y", ih + 34)
      .attr("text-anchor", "middle")
      .attr("fill", MUTED)
      .attr("font-size", narrow ? "9px" : "10px")
      .attr("font-family", MONO)
      .text(d => `${d.convictions}`);

    // X axis — years (abbreviated on narrow screens)
    g.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x)
        .tickFormat(y => narrow ? `'${y.slice(2)}` : y)
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
      .call(d3.axisLeft(y).ticks(4).tickSize(0).tickFormat(d => `${d}%`))
      .call(gg => gg.select(".domain").remove())
      .call(gg => gg.selectAll("text")
        .attr("fill", MUTED)
        .attr("font-size", "11px")
        .attr("font-family", MONO)
        .attr("dx", "-4px"));

  }, [width]);

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
          Justicia · incendios intencionados vs. condenas
        </p>
        <h2 className="type-h3 mb-8" style={{ color: "var(--foreground)" }}>
          ¿Cuántos incendios provocados acaban en condena?
        </h2>
        <ChartConvictionRate />
        <p className="type-small mt-4" style={{ color: "var(--muted)" }}>
          Condenados por delitos de incendio (INE, Registro Central de Penados) como porcentaje
          de los incendios registrados como intencionados ese año (EGIF, MITECO). La cifra bajo
          cada año es el número absoluto de condenas. Se cuentan en el año de la sentencia, no
          del incendio, e incluyen todos los delitos de incendio del Código Penal — la tasa real
          sobre incendio forestal es aún menor.
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
