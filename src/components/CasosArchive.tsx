"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CaseSummary } from "@/types/case";
import CaseCard from "./CaseCard";

type SortKey = "year" | "hectares" | "urbanParcels" | "catastroSignal";
type SortDir = "asc" | "desc";
type View = "tabla" | "tarjetas";

const STATUSES = ["Sentencia firme", "En investigación", "Absuelto", "Archivado", "Sobreseído"];

/** Accent-insensitive lowercase for Spanish search (Ávila → avila) */
function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function matchesQuery(c: CaseSummary, q: string) {
  const haystack = normalize(`${c.title} ${c.municipality} ${c.region} ${c.year}`);
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function csvField(v: string | number | undefined | null) {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(rows: CaseSummary[]) {
  const header = [
    "titulo", "municipio", "region", "año", "hectareas",
    "parcelas_urbanas_modificadas", "estado", "lat", "lng", "url",
  ];
  const lines = rows.map((c) =>
    [
      c.title, c.municipality, c.region, c.year, c.hectares,
      c.urbanParcels ?? "", c.status,
      c.coordinates?.lat ?? "", c.coordinates?.lng ?? "",
      `https://antestodoestoeracampo.es/casos/${c.slug}`,
    ].map(csvField).join(",")
  );
  // BOM so Excel reads UTF-8 (ñ, accents) correctly
  const csv = "﻿" + [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `antestodoestoeracampo-casos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const selectStyle: React.CSSProperties = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--foreground)",
};

export default function CasosArchive({ cases }: { cases: CaseSummary[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // State initialised from the URL once — then state is the source of truth
  // and gets written back (debounced) so filtered views are shareable links.
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [region, setRegion] = useState(sp.get("region") ?? "");
  const [status, setStatus] = useState(sp.get("estado") ?? "");
  const [sort, setSort] = useState<SortKey>((sp.get("orden") as SortKey) || "catastroSignal");
  const [dir, setDir] = useState<SortDir>((sp.get("dir") as SortDir) || "desc");
  const [view, setView] = useState<View>((sp.get("vista") as View) || "tabla");
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      if (region) p.set("region", region);
      if (status) p.set("estado", status);
      if (sort !== "catastroSignal") p.set("orden", sort);
      if (dir !== "desc") p.set("dir", dir);
      if (view !== "tabla") p.set("vista", view);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 350);
    return () => clearTimeout(t);
  }, [q, region, status, sort, dir, view, pathname, router]);

  const regions = useMemo(
    () => [...new Set(cases.map((c) => c.region).filter(Boolean))].sort(),
    [cases]
  );

  const filtered = useMemo(() => {
    const nq = normalize(q.trim());
    const rows = cases.filter((c) => {
      if (region && c.region !== region) return false;
      if (status && c.status !== status) return false;
      return !nq || matchesQuery(c, nq);
    });
    const mul = dir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      const av = a[sort] ?? -1;
      const bv = b[sort] ?? -1;
      if (av !== bv) return (av < bv ? -1 : 1) * mul;
      return a.title.localeCompare(b.title, "es");
    });
  }, [cases, q, region, status, sort, dir]);

  const totalHa = useMemo(
    () => filtered.reduce((s, c) => s + (c.hectares ?? 0), 0),
    [filtered]
  );

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir("desc");
    }
  };

  const sortIndicator = (key: SortKey) =>
    sort === key ? (dir === "desc" ? " ↓" : " ↑") : "";

  const thButton = (key: SortKey, label: string, align: "left" | "right" = "right") => (
    <th className={`px-3 py-2.5 text-${align} whitespace-nowrap`}>
      <button
        onClick={() => toggleSort(key)}
        className="type-label transition-colors duration-150 hover:text-[var(--foreground)]"
        style={{ color: sort === key ? "var(--foreground)" : "var(--muted)" }}
      >
        {label}{sortIndicator(key)}
      </button>
    </th>
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            aria-label="Buscar casos"
            placeholder="Buscar por municipio, región o año…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-full type-small outline-none transition-colors duration-150 focus:border-[var(--muted)]"
            style={selectStyle}
          />
        </div>

        {/* Region */}
        <select
          aria-label="Filtrar por comunidad autónoma"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="px-4 py-2.5 rounded-full type-small outline-none"
          style={selectStyle}
        >
          <option value="">Todas las CCAA</option>
          {regions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        {/* Status */}
        <select
          aria-label="Filtrar por estado judicial"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-4 py-2.5 rounded-full type-small outline-none"
          style={selectStyle}
        >
          <option value="">Todos los estados</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* View toggle */}
        <div
          className="flex rounded-full overflow-hidden"
          style={{ border: "1px solid var(--border)" }}
          role="group"
          aria-label="Cambiar vista"
        >
          {(["tabla", "tarjetas"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className="px-4 py-2 type-small transition-colors duration-150"
              style={{
                backgroundColor: view === v ? "var(--foreground)" : "var(--surface)",
                color: view === v ? "white" : "var(--muted)",
              }}
            >
              {v === "tabla" ? "Tabla" : "Tarjetas"}
            </button>
          ))}
        </div>

        {/* CSV export */}
        <button
          onClick={() => exportCsv(filtered)}
          disabled={filtered.length === 0}
          className="px-4 py-2 rounded-full type-small transition-opacity duration-150 hover:opacity-85 disabled:opacity-40"
          style={{ backgroundColor: "var(--forest)", color: "var(--forest-foreground)" }}
        >
          Exportar CSV ({filtered.length})
        </button>
      </div>

      {/* Result count */}
      <p className="type-data text-[12px] mb-6" style={{ color: "var(--muted)" }}>
        {filtered.length} {filtered.length === 1 ? "caso" : "casos"}
        {" · "}
        {Math.round(totalHa).toLocaleString("es-ES")} ha
      </p>

      {filtered.length === 0 ? (
        <p className="type-body py-12" style={{ color: "var(--muted)" }}>
          No hay casos que coincidan con estos filtros.
        </p>
      ) : view === "tabla" ? (
        <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--foreground)" }}>
                <th className="px-3 py-2.5 text-left">
                  <span className="type-label" style={{ color: "var(--muted)" }}>Caso</span>
                </th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">
                  <span className="type-label" style={{ color: "var(--muted)" }}>CCAA</span>
                </th>
                {thButton("year", "Año")}
                {thButton("hectares", "Hectáreas")}
                {thButton("catastroSignal", "Señal")}
                {thButton("urbanParcels", "Parcelas urbanas")}
                <th className="px-3 py-2.5 text-left whitespace-nowrap">
                  <span className="type-label" style={{ color: "var(--muted)" }}>Estado</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const convicted = c.status === "Sentencia firme";
                return (
                  <tr
                    key={c.slug}
                    className="group transition-colors duration-100 hover:bg-[var(--surface)]"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td className="px-3 py-3">
                      <Link
                        href={`/casos/${c.slug}`}
                        className="type-small block transition-colors duration-100 group-hover:text-[var(--accent)]"
                        style={{ color: "var(--foreground)" }}
                      >
                        {/* year + region live in their own columns */}
                        {c.title.replace(/\s*\(\d{4}\)\s*$/, "")}
                      </Link>
                    </td>
                    <td className="px-3 py-3 type-small whitespace-nowrap" style={{ color: "var(--muted)" }}>
                      {c.region}
                    </td>
                    <td className="px-3 py-3 type-data text-[13px] text-right" style={{ color: "var(--foreground)" }}>
                      {c.year}
                    </td>
                    <td className="px-3 py-3 type-data text-[13px] text-right whitespace-nowrap" style={{ color: "var(--foreground)" }}>
                      {Math.round(c.hectares).toLocaleString("es-ES")}
                    </td>
                    <td
                      className="px-3 py-3 type-data text-[13px] text-right"
                      style={{ color: c.catastroSignal ? "var(--accent)" : "var(--muted)" }}
                    >
                      {c.catastroSignal ?? "—"}
                    </td>
                    <td
                      className="px-3 py-3 type-data text-[13px] text-right"
                      style={{ color: "var(--muted)" }}
                    >
                      {c.urbanParcels ?? "—"}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full type-label"
                        style={{
                          fontSize: "9px",
                          backgroundColor: convicted ? "var(--accent)" : "transparent",
                          color: convicted ? "var(--accent-foreground)" : "var(--muted)",
                          border: convicted ? "none" : "1px solid var(--border)",
                        }}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 md:gap-6">
          {filtered.map((c) => (
            <CaseCard key={c.slug} case_={c} />
          ))}
        </div>
      )}

      {/* Column note */}
      <div className="type-small mt-8 max-w-2xl space-y-2" style={{ color: "var(--muted)" }}>
        <p>
          «Parcelas urbanas» = parcelas clasificadas como suelo urbano en el Catastro
          modificadas entre 1 y 15 años después del incendio, detectadas por consulta
          automatizada al WFS INSPIRE del Catastro.
        </p>
        <p>
          «Señal» es una versión depurada de ese recuento: prioriza incendios sobre
          terreno mayoritariamente rural cuyas parcelas urbanas aparecen repartidas en
          varios años, y descarta los cascos ya urbanizados y los picos de re-versionado
          catastral masivo (que inflan el recuento bruto sin indicar recalificación). El
          archivo se ordena por esta señal de forma predeterminada. Sigue siendo una pista
          para investigar, no una prueba de recalificación irregular.
        </p>
      </div>
    </div>
  );
}
