"use client";

import { useMemo, useState, useTransition } from "react";
import type { TriageCase } from "./page";
import { setCaseHidden } from "./actions";

const BUCKET = {
  A: { label: "Ruido probable", color: "#C4622D", help: "Casco medio-urbanizado + pico de re-versionado en un solo año. Mismo patrón que los 25 ya ocultados, justo por debajo del corte." },
  B: { label: "Señal vacía", color: "#B45309", help: "Apenas hay parcelas urbanas tras el incendio (<30). Incendio rural sin urbanización posterior detectable." },
  C: { label: "Rural modesto", color: "#2D4A3E", help: "Terreno mayoritariamente rural con algo de desarrollo repartido en varios años. Pista legítima, aunque débil." },
} as const;

type Filter = "todos" | "A" | "B" | "C" | "ocultos";

function staticMap(token: string, lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null || !token) return null;
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/pin-s+c4622d(${lng},${lat})/${lng},${lat},12.5,0/360x190@2x?access_token=${token}`;
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span
      className="type-data"
      style={{
        fontSize: 11, padding: "2px 7px", borderRadius: 4,
        backgroundColor: "var(--surface)", border: "1px solid var(--border)",
        color: tone ?? "var(--foreground)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: "var(--muted)" }}>{label} </span>{value}
    </span>
  );
}

function Card({ c, token, hidden, onToggle }: { c: TriageCase; token: string; hidden: boolean; onToggle: (slug: string, hidden: boolean) => void }) {
  const [isPending, start] = useTransition();
  const map = staticMap(token, c.lat, c.lng);
  const b = BUCKET[c.bucket];

  function act(next: boolean) {
    onToggle(c.slug, next); // optimistic — re-sorts the grid immediately
    start(async () => { await setCaseHidden(c.slug, next); });
  }

  return (
    <div style={{
      borderRadius: 8, border: `1px solid ${hidden ? "var(--border)" : b.color + "40"}`,
      backgroundColor: hidden ? "var(--surface)" : "var(--background)", overflow: "hidden",
      opacity: hidden ? 0.55 : 1, display: "flex", flexDirection: "column", transition: "opacity .15s",
    }}>
      {/* Satellite thumb */}
      <div style={{ position: "relative", height: 150, backgroundColor: "var(--surface)" }}>
        {map ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={map} alt={`Satélite ${c.title}`} width={360} height={150}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: hidden ? "grayscale(1)" : "none" }} />
        ) : (
          <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
            <span className="type-label" style={{ color: "var(--muted)", fontSize: 10 }}>sin coordenadas</span>
          </div>
        )}
        <span className="type-label" style={{
          position: "absolute", top: 8, left: 8, fontSize: 9, padding: "3px 8px", borderRadius: 4,
          backgroundColor: b.color, color: "#F7F4EF", whiteSpace: "nowrap",
        }}>{c.bucket} · {b.label}</span>
        {hidden && (
          <span className="type-label" style={{
            position: "absolute", top: 8, right: 8, fontSize: 9, padding: "3px 8px", borderRadius: 4,
            backgroundColor: "var(--foreground)", color: "var(--background)",
          }}>OCULTO</span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div>
          <a href={`/casos/${c.slug}`} target="_blank" rel="noopener noreferrer"
            className="hover:underline"
            style={{ fontFamily: "var(--font-newsreader)", fontStyle: "italic", fontSize: 17, color: "var(--foreground)", textDecoration: "none" }}>
            {c.title}
          </a>
          <p className="type-label" style={{ fontSize: 10, color: "var(--muted)", margin: "3px 0 0" }}>
            {c.region} · {c.hectares.toLocaleString("es-ES", { maximumFractionDigits: 0 })} ha
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          <Chip label="señal" value={String(c.signal)} tone={b.color} />
          <Chip label="urbano" value={`${c.urbanPct}%`} tone={c.urbanPct > 60 ? "#C4622D" : undefined} />
          <Chip label="pico" value={`${c.spikePct}%`} tone={c.spikePct > 60 ? "#C4622D" : undefined} />
          <Chip label="parcelas" value={String(c.winUrban)} />
          <Chip label="años" value={String(c.spreadYears)} />
        </div>

        <div style={{ display: "flex", gap: 7, marginTop: "auto", alignItems: "center" }}>
          {!hidden ? (
            <button onClick={() => act(true)} disabled={isPending} className="type-label"
              style={{ fontSize: 11, padding: "6px 12px", borderRadius: 5, cursor: "pointer",
                border: `1px solid ${BUCKET.A.color}`, backgroundColor: "#FBEDE5", color: "#9A4419", opacity: isPending ? 0.5 : 1 }}>
              Ocultar
            </button>
          ) : (
            <button onClick={() => act(false)} disabled={isPending} className="type-label"
              style={{ fontSize: 11, padding: "6px 12px", borderRadius: 5, cursor: "pointer",
                border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)", opacity: isPending ? 0.5 : 1 }}>
              ↺ Restaurar
            </button>
          )}
          <a href={`/casos/${c.slug}`} target="_blank" rel="noopener noreferrer" className="type-label"
            style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>Ver caso ↗</a>
          {c.lat != null && c.lng != null && (
            <a href={`https://www.google.com/maps/@?api=1&map_action=map&center=${c.lat},${c.lng}&zoom=15&basemap=satellite`}
              target="_blank" rel="noopener noreferrer" className="type-label"
              style={{ fontSize: 11, color: "var(--muted)", textDecoration: "none", marginLeft: "auto" }}>Satélite ↗</a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TriageReview({ cases, counts, mapboxToken }:
  { cases: TriageCase[]; counts: Record<string, number>; mapboxToken: string }) {
  const [filter, setFilter] = useState<Filter>("todos");
  // Hidden state lifted here so hiding a card re-sorts it to the bottom instantly
  const [hidden, setHidden] = useState<Record<string, boolean>>(
    () => Object.fromEntries(cases.map((c) => [c.slug, c.hidden]))
  );
  const onToggle = (slug: string, h: boolean) => setHidden((m) => ({ ...m, [slug]: h }));

  const visible = useMemo(() => {
    let rows = cases;
    if (filter === "ocultos") rows = cases.filter((c) => hidden[c.slug]);
    else if (filter !== "todos") rows = cases.filter((c) => c.bucket === filter);
    // hidden cards sink to the bottom, original order preserved within each group
    return [...rows].sort((a, b) => Number(hidden[a.slug] ?? false) - Number(hidden[b.slug] ?? false));
  }, [cases, filter, hidden]);

  const hiddenCount = cases.filter((c) => hidden[c.slug]).length;

  const pills: { key: Filter; label: string; n: number; color?: string }[] = [
    { key: "todos", label: "Todos", n: cases.length },
    { key: "A", label: `A · ${BUCKET.A.label}`, n: counts.A ?? 0, color: BUCKET.A.color },
    { key: "B", label: `B · ${BUCKET.B.label}`, n: counts.B ?? 0, color: BUCKET.B.color },
    { key: "C", label: `C · ${BUCKET.C.label}`, n: counts.C ?? 0, color: BUCKET.C.color },
    { key: "ocultos", label: "Ocultados", n: hiddenCount },
  ];

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--background)", fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "20px 40px" }}>
        <p className="type-label" style={{ color: "var(--muted)", fontSize: 10, marginBottom: 4 }}>HERRAMIENTA EDITORIAL</p>
        <h1 style={{ fontFamily: "var(--font-newsreader)", fontSize: 28, fontStyle: "italic", fontWeight: 400, color: "var(--foreground)", margin: 0 }}>
          Revisión de casos débiles
        </h1>
        <p className="type-small" style={{ color: "var(--muted)", margin: "8px 0 0", maxWidth: 720 }}>
          Casos en vivo con señal Catastro depurada baja (&lt;20). Mira el satélite: si ya es un casco urbano,
          la «señal» es ruido → ocultar. Si era monte y hay algo de construcción repartida, es una pista legítima → mantener.
          Ocultar es reversible (restaura aquí o en Studio).
        </p>
      </div>

      {/* Filters + bucket legend */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "14px 40px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {pills.map((p) => (
          <button key={p.key} onClick={() => setFilter(p.key)} className="type-label"
            style={{
              fontSize: 11, padding: "6px 12px", borderRadius: 999, cursor: "pointer",
              border: `1px solid ${filter === p.key ? (p.color ?? "var(--foreground)") : "var(--border)"}`,
              backgroundColor: filter === p.key ? (p.color ?? "var(--foreground)") : "transparent",
              color: filter === p.key ? "#F7F4EF" : (p.color ?? "var(--muted)"),
            }}>
            {p.label} ({p.n})
          </button>
        ))}
      </div>

      {filter !== "todos" && filter !== "ocultos" && (
        <div style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "10px 40px" }}>
          <p className="type-small" style={{ color: "var(--muted)", margin: 0 }}>{BUCKET[filter as "A"|"B"|"C"].help}</p>
        </div>
      )}

      {/* Grid */}
      <div style={{ padding: "24px 40px 80px" }}>
        <p className="type-data" style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>{visible.length} casos</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 18 }}>
          {visible.map((c) => <Card key={c.slug} c={c} token={mapboxToken} hidden={hidden[c.slug] ?? false} onToggle={onToggle} />)}
        </div>
      </div>
    </div>
  );
}
