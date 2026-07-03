"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { CatastroYear, CatastroParcel } from "@/types/case";

// Design tokens as hex — CSS vars aren't readable by D3
const ACCENT = "#C4622D";
const MUTED = "#8C8880";
const BORDER = "#E2DDD6";
const FG = "#1A180F";
const SPIKE = "#B5B0A8";   // dominant-year bulk re-versioning — discounted
const OUTSIDE = "#D9D4CC"; // outside the 1–15y window — not counted

function useMeasuredWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

interface Props {
  years: CatastroYear[];
  parcels: CatastroParcel[];
  boxTotal?: number;
  boxUrban?: number;
  fireYear: number;
  urbanParcels?: number;
  catastroSignal?: number;
}

export default function CaseCatastro({ years, parcels, boxTotal, boxUrban, fireYear, urbanParcels, catastroSignal }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const width = useMeasuredWidth(chartRef);

  const urbanYears = years.filter(y => y.urbano > 0);

  // Dominant in-window year — same rule catastroSignal discounts
  const winStart = fireYear + 1;
  const winEnd = fireYear + 15;
  const inWindow = urbanYears.filter(y => y.year >= winStart && y.year <= winEnd);
  const spike = inWindow.length ? inWindow.reduce((a, b) => (b.urbano > a.urbano ? b : a)) : null;
  const windowedTotal = inWindow.reduce((n, y) => n + y.urbano, 0);
  const nonSpikeTotal = windowedTotal - (spike?.urbano ?? 0);

  useEffect(() => {
    if (!svgRef.current || !width || !urbanYears.length) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const narrow = width < 500;
    const margin = { top: 18, right: 8, bottom: 26, left: narrow ? 28 : 36 };
    const height = 190;
    svg.attr("width", width).attr("height", height);

    const minYear = Math.min(fireYear, urbanYears[0].year);
    const maxYear = Math.max(winEnd, urbanYears[urbanYears.length - 1].year);
    const domain: number[] = [];
    for (let y = minYear; y <= maxYear; y++) domain.push(y);

    const x = d3.scaleBand<number>().domain(domain).range([margin.left, width - margin.right]).padding(0.25);
    const yMax = d3.max(urbanYears, d => d.urbano) ?? 1;
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([height - margin.bottom, margin.top]);

    // 1–15y window shading
    const x0 = x(Math.max(winStart, minYear));
    const x1 = x(Math.min(winEnd, maxYear));
    if (x0 !== undefined && x1 !== undefined) {
      svg.append("rect")
        .attr("x", x0)
        .attr("y", margin.top)
        .attr("width", x1 - x0 + x.bandwidth())
        .attr("height", height - margin.top - margin.bottom)
        .attr("fill", BORDER)
        .attr("opacity", 0.28);
    }

    // Bars — urban modifications per year
    svg.selectAll("rect.bar")
      .data(urbanYears)
      .join("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.year) ?? 0)
      .attr("y", d => y(d.urbano))
      .attr("width", x.bandwidth())
      .attr("height", d => y(0) - y(d.urbano))
      .attr("fill", d => {
        if (spike && d.year === spike.year) return SPIKE;
        if (d.year >= winStart && d.year <= winEnd) return ACCENT;
        return OUTSIDE;
      });

    // Fire year marker
    const fx = x(fireYear);
    if (fx !== undefined) {
      svg.append("line")
        .attr("x1", fx + x.bandwidth() / 2)
        .attr("x2", fx + x.bandwidth() / 2)
        .attr("y1", margin.top - 6)
        .attr("y2", height - margin.bottom)
        .attr("stroke", FG)
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3");
      svg.append("text")
        .attr("x", fx + x.bandwidth() / 2)
        .attr("y", margin.top - 8)
        .attr("text-anchor", "middle")
        .attr("font-size", 9)
        .attr("font-family", "var(--font-jetbrains-mono), monospace")
        .attr("fill", FG)
        .text(`incendio ${fireYear}`);
    }

    // Axes
    const tickEvery = narrow ? Math.ceil(domain.length / 6) : Math.ceil(domain.length / 12);
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickValues(domain.filter((_, i) => i % tickEvery === 0)).tickFormat(d => `${d}`).tickSize(0))
      .call(g => g.select(".domain").attr("stroke", BORDER))
      .selectAll("text")
      .attr("font-size", 9)
      .attr("fill", MUTED);
    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(0))
      .call(g => g.select(".domain").remove())
      .selectAll("text")
      .attr("font-size", 9)
      .attr("fill", MUTED);
  }, [width, urbanYears, fireYear, winStart, winEnd, spike]);

  if (!urbanYears.length) return null;

  const pctUrban = boxTotal && boxUrban !== undefined
    ? Math.round((boxUrban / boxTotal) * 1000) / 10
    : null;

  return (
    <section className="px-6 md:px-12 py-12 md:py-16" style={{ borderTop: "1px solid var(--border)" }}>
      <p className="type-label mb-2" style={{ color: "var(--muted)" }}>Catastro</p>
      <h2
        className="mb-6"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontSize: 24, fontWeight: 400, color: "var(--foreground)" }}
      >
        Parcelas urbanas modificadas en el área analizada
      </h2>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6">
        {boxTotal !== undefined && (
          <Chip value={boxTotal.toLocaleString("es-ES")} label="parcelas en el área" />
        )}
        {pctUrban !== null && (
          <Chip value={`${pctUrban.toLocaleString("es-ES")}%`} label="suelo urbano" />
        )}
        {typeof urbanParcels === "number" && (
          <Chip value={urbanParcels.toLocaleString("es-ES")} label="urbanas modificadas 1–15 años tras el incendio" />
        )}
        {typeof catastroSignal === "number" && (
          <Chip value={String(catastroSignal)} label="señal depurada" accent />
        )}
      </div>

      {/* Histogram */}
      <div ref={chartRef} className="max-w-2xl">
        <svg ref={svgRef} />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 max-w-2xl">
        <Legend color={ACCENT} label="contabilizada en la señal (1–15 años tras el incendio)" />
        {spike && <Legend color={SPIKE} label={`año dominante (${spike.year}) — descontado como posible re-versionado masivo`} />}
        <Legend color={OUTSIDE} label="fuera de la ventana de análisis" />
      </div>

      {/* Bulk-edit collapse line */}
      {spike && spike.urbano > 1 && (
        <p className="type-small mt-4 max-w-2xl" style={{ color: "var(--muted)" }}>
          {spike.urbano.toLocaleString("es-ES")} parcelas urbanas comparten una única fecha de modificación
          ({spike.year}) — patrón típico de un re-versionado administrativo masivo, por lo que se descuentan
          de la señal.
        </p>
      )}

      {/* Receipts table */}
      {parcels.length > 0 && (
        <div className="mt-8 max-w-2xl">
          <p className="type-label mb-3" style={{ color: "var(--muted)" }}>
            Parcelas señaladas — consulta oficial
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Referencia catastral", "Superficie", "Modificada", ""].map(h => (
                  <th key={h} className="type-label" style={{ fontSize: "9px", color: "var(--muted)", textAlign: "left", padding: "0 10px 6px", fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parcels.map(p => (
                <tr key={p.rc} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="type-data" style={{ padding: "8px 10px", fontSize: "12px", color: "var(--foreground)" }}>{p.rc}</td>
                  <td className="type-data" style={{ padding: "8px 10px", fontSize: "12px", color: "var(--muted)" }}>
                    {p.areaM2.toLocaleString("es-ES")} m²
                  </td>
                  <td className="type-data" style={{ padding: "8px 10px", fontSize: "12px", color: "var(--muted)" }}>{p.year}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <a
                      href={`https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?refcat=${encodeURIComponent(p.rc)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="type-label hover:underline"
                      style={{ fontSize: "10px", color: "var(--accent)", whiteSpace: "nowrap" }}
                    >
                      Ver en el Catastro ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {nonSpikeTotal > parcels.length && (
            <p className="type-small mt-2" style={{ color: "var(--muted)", fontSize: 12 }}>
              … y {(nonSpikeTotal - parcels.length).toLocaleString("es-ES")} parcelas más (se muestran las de mayor superficie).
            </p>
          )}
        </div>
      )}

      {/* Caveat */}
      <p
        className="type-small max-w-2xl mt-8 px-4 py-3 rounded-sm"
        style={{
          fontSize: "12px",
          color: "var(--muted)",
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        ⚠ Las fechas proceden del registro catastral (INSPIRE) y corresponden a versiones administrativas:
        una modificación no implica una recalificación del suelo ni guarda necesariamente relación con el
        incendio. Es una señal para investigar, no una prueba.
      </p>
    </section>
  );
}

function Chip({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div>
      <span className="type-data" style={{ fontSize: 18, color: accent ? "var(--accent)" : "var(--foreground)" }}>{value}</span>
      <p className="type-label" style={{ fontSize: "9px", color: "var(--muted)", margin: 0, maxWidth: 180 }}>{label}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="type-small inline-flex items-center gap-2" style={{ fontSize: 11, color: "var(--muted)" }}>
      <span style={{ width: 10, height: 10, backgroundColor: color, borderRadius: 2, display: "inline-block" }} />
      {label}
    </span>
  );
}
