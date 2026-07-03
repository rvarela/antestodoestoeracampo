"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface QueueRow {
  slug: string;
  title: string;
  region: string;
  year: number;
  hectares: number;
  signal: number | null;
  maxConf: number | null;
  pending: number;
  approved: number;
  rejected: number;
}

type SortKey = keyof Omit<QueueRow, "slug">;

const COLUMNS: Array<{ key: SortKey; label: string; numeric: boolean; hint?: string }> = [
  { key: "title", label: "Caso", numeric: false },
  { key: "region", label: "Región", numeric: false },
  { key: "year", label: "Año", numeric: true },
  { key: "hectares", label: "Ha", numeric: true },
  { key: "signal", label: "Señal", numeric: true, hint: "Señal Catastro depurada (la que ordena /casos) — actividad urbana post-incendio sobre suelo rural" },
  { key: "maxConf", label: "Conf. máx", numeric: true, hint: "Confianza del mejor enlace pendiente — dónde espera la pista más prometedora sin revisar" },
  { key: "pending", label: "Pendientes", numeric: true },
  { key: "approved", label: "Aprobados", numeric: true },
  { key: "rejected", label: "Rechazados", numeric: true },
];

function confColor(c: number): string {
  if (c >= 70) return "#166534";
  if (c >= 45) return "#B45309";
  return "#B91C1C";
}

export function QueueTable({ rows }: { rows: QueueRow[] }) {
  // Default: where the most promising unreviewed lead waits
  const [sortKey, setSortKey] = useState<SortKey>("maxConf");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  function toggle(key: SortKey, numeric: boolean) {
    if (key === sortKey) {
      setDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(numeric ? "desc" : "asc"); // numbers: biggest first; text: A→Z
    }
  }

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      // nulls always sink, regardless of direction
      if (va === null && vb === null) return b.hectares - a.hectares;
      if (va === null) return 1;
      if (vb === null) return -1;
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "es");
      if (cmp === 0) cmp = (b.signal ?? -1) - (a.signal ?? -1) || b.hectares - a.hectares;
      else if (dir === "desc") cmp = -cmp;
      return cmp;
    });
    return out;
  }, [rows, sortKey, dir]);

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 32 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          {COLUMNS.map(col => {
            const active = col.key === sortKey;
            return (
              <th key={col.key} style={{ padding: 0 }}>
                <button
                  onClick={() => toggle(col.key, col.numeric)}
                  className="type-label"
                  title={col.hint}
                  style={{
                    fontSize: "9px",
                    color: active ? "var(--foreground)" : "var(--muted)",
                    fontWeight: active ? 700 : 500,
                    textAlign: "left",
                    padding: "0 12px 8px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    width: "100%",
                  }}
                >
                  {col.label}
                  <span style={{ marginLeft: 4, opacity: active ? 1 : 0.25 }}>
                    {active ? (dir === "desc" ? "▼" : "▲") : "↕"}
                  </span>
                </button>
              </th>
            );
          })}
          <th />
        </tr>
      </thead>
      <tbody>
        {sorted.map(r => (
          <tr key={r.slug} style={{ borderBottom: "1px solid var(--border)" }}>
            <td style={{ padding: "12px" }}>
              <Link href={`/research/${r.slug}`} className="type-small hover:underline" style={{ color: "var(--foreground)", fontWeight: r.pending > 0 ? 500 : 400 }}>
                {r.title}
              </Link>
            </td>
            <td className="type-label" style={{ padding: "12px", fontSize: "10px", color: "var(--muted)" }}>{r.region}</td>
            <td className="type-data" style={{ padding: "12px", fontSize: "12px", color: "var(--muted)" }}>{r.year}</td>
            <td className="type-data" style={{ padding: "12px", fontSize: "12px", color: "var(--muted)" }}>{r.hectares.toLocaleString("es-ES", { maximumFractionDigits: 0 })}</td>
            <td className="type-data" style={{ padding: "12px", fontSize: "12px", color: r.signal && r.signal >= 20 ? "var(--foreground)" : "var(--muted)" }}>
              {r.signal !== null ? r.signal : <span style={{ color: "var(--border)" }}>—</span>}
            </td>
            <td style={{ padding: "12px" }}>
              {r.maxConf !== null ? (
                <span className="type-data" style={{ fontSize: 12, color: confColor(r.maxConf), fontVariantNumeric: "tabular-nums" }}>
                  {r.maxConf}%
                </span>
              ) : <span style={{ color: "var(--border)" }}>—</span>}
            </td>
            <td style={{ padding: "12px" }}>
              {r.pending > 0 ? (
                <span className="type-data" style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 600 }}>{r.pending}</span>
              ) : <span style={{ color: "var(--border)" }}>—</span>}
            </td>
            <td style={{ padding: "12px" }}>
              {r.approved > 0 ? (
                <span className="type-data" style={{ fontSize: 13, color: "#2D7A4A" }}>{r.approved}</span>
              ) : <span style={{ color: "var(--border)" }}>—</span>}
            </td>
            <td style={{ padding: "12px" }}>
              {r.rejected > 0 ? (
                <span className="type-data" style={{ fontSize: 13, color: "var(--muted)" }}>{r.rejected}</span>
              ) : <span style={{ color: "var(--border)" }}>—</span>}
            </td>
            <td style={{ padding: "12px" }}>
              <Link href={`/research/${r.slug}`} className="type-label" style={{ fontSize: "10px", color: "var(--accent)" }}>
                Revisar →
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
