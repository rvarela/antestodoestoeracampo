"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLinkStatus, pushLinkToTimeline } from "../actions";

const EVENT_TYPES = [
  { value: "fire", title: "🔥 Incendio" },
  { value: "purchase", title: "🏠 Compraventa" },
  { value: "rezoning", title: "📋 Recalificación" },
  { value: "permit", title: "🔨 Permiso de obra" },
  { value: "construction", title: "🏗️ Construcción" },
  { value: "judicial", title: "⚖️ Judicial" },
  { value: "political", title: "🏛️ Político" },
  { value: "other", title: "📰 Otro" },
];

const SPANISH_MONTHS: Record<string, string> = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
};

/** Best-effort ISO date from a link label ("a 17 de septiembre de 2009", "29/07/2004"). */
function dateFromLabel(label: string): string {
  const es = label.match(/\ba?\s*(\d{1,2}) de (\p{L}+) de (\d{4})/iu);
  if (es) {
    const month = SPANISH_MONTHS[es[2].toLowerCase()];
    if (month) return `${es[3]}-${month}-${es[1].padStart(2, "0")}`;
  }
  const dmy = label.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return "";
}

/** ISO → DD/MM/YYYY for the form; year-only and free text stay as-is */
function displayDate(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

/** DD/MM/YYYY → ISO for storage (timeline convention); ISO/year-only pass through */
function isoDate(d: string): string {
  const dmy = d.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return d.trim();
}

const SOURCE_LABELS: Record<string, string> = {
  CENDOJ: "CENDOJ",
  BOE: "BOE",
  CCAA: "CCAA",
  ElPais: "El País",
  ElMundo: "El Mundo",
  ABC: "ABC",
  Prensa: "Prensa",
  Catastro: "Catastro",
  Maps: "Maps",
  Otro: "Otro",
};

const SOURCE_COLORS: Record<string, string> = {
  CENDOJ: "#1D4ED8",
  BOE: "#9333EA",
  CCAA: "#0F766E",
  ElPais: "#B45309",
  ElMundo: "#B45309",
  ABC: "#B45309",
  Prensa: "#C4622D",
  Catastro: "#047857",
  Maps: "#6B7280",
  Otro: "#6B7280",
};

interface LinkCardProps {
  id: string;
  label: string;
  url: string;
  sourceType: string;
  note: string;
  status: "pending" | "approved" | "rejected";
  isSearch?: boolean;
  confidence?: number;
  /** the entry this link already has in the case timeline — the form prefills from it */
  timelineEntry?: { date?: string; title?: string; description?: string; type?: string } | null;
}

function confidenceColor(c: number): string {
  if (c >= 70) return "#166534"; // green — likely the right fire
  if (c >= 45) return "#B45309"; // amber — plausible, verify
  return "#B91C1C";              // red — probably noise
}

export function LinkCard({ id, label, url, sourceType, note, status: initialStatus, isSearch, confidence, timelineEntry }: LinkCardProps) {
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [showTimelineForm, setShowTimelineForm] = useState(false);
  const [inTimeline, setInTimeline] = useState(!!timelineEntry);
  // Prefill from the existing timeline entry — re-opening the form must show
  // what was pushed, not a blank form that would overwrite it with empties
  const [tlDate, setTlDate] = useState(() => displayDate(timelineEntry?.date ?? dateFromLabel(label)));
  const [tlType, setTlType] = useState(timelineEntry?.type ?? (sourceType === "CENDOJ" ? "judicial" : "other"));
  const [tlTitle, setTlTitle] = useState(timelineEntry?.title ?? (label.length > 120 ? label.slice(0, 117) + "…" : label));
  const [tlDescription, setTlDescription] = useState(timelineEntry?.description ?? "");
  const [tlError, setTlError] = useState<string | null>(null);

  function update(next: "approved" | "rejected" | "pending") {
    setStatus(next); // optimistic
    startTransition(async () => {
      await setLinkStatus(id, next);
      // Re-render server data so the push button picks up the new approval
      router.refresh();
    });
  }

  function submitTimeline() {
    setTlError(null);
    startTransition(async () => {
      const res = await pushLinkToTimeline(id, {
        date: isoDate(tlDate), type: tlType, title: tlTitle, description: tlDescription,
      });
      if (!res.ok) {
        setTlError(res.error);
        return;
      }
      setInTimeline(true);
      setShowTimelineForm(false);
      router.refresh();
    });
  }

  const color = SOURCE_COLORS[sourceType] ?? "#6B7280";
  const isApproved = status === "approved";
  const isRejected = status === "rejected";

  const inputStyle: React.CSSProperties = {
    fontSize: 12,
    padding: "6px 8px",
    borderRadius: 4,
    border: "1px solid var(--border)",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    width: "100%",
  };

  return (
    <div
      style={{
        borderRadius: 6,
        border: `1px solid ${isApproved ? "#BBF7D0" : "var(--border)"}`,
        backgroundColor: isApproved ? "#F0FDF4" : isRejected ? "var(--surface)" : "var(--background)",
        opacity: isRejected ? 0.5 : 1,
        padding: "14px 16px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        flexWrap: "wrap",
        transition: "opacity 0.15s, background-color 0.15s",
      }}
    >
      {/* Source badge */}
      <span
        className="type-label shrink-0"
        style={{
          fontSize: "9px",
          padding: "3px 8px",
          borderRadius: 4,
          backgroundColor: color + "18",
          color,
          border: `1px solid ${color}30`,
          marginTop: 2,
          whiteSpace: "nowrap",
        }}
      >
        {SOURCE_LABELS[sourceType] ?? sourceType}
      </span>

      {typeof confidence === "number" && (
        <span
          className="type-data shrink-0"
          title="Relevancia estimada para este caso (heurística sobre el titular; 100% = añadido a mano). Orientativa — verifica antes de aprobar."
          style={{
            fontSize: "11px",
            padding: "3px 8px",
            borderRadius: 4,
            backgroundColor: confidenceColor(confidence) + "14",
            color: confidenceColor(confidence),
            border: `1px solid ${confidenceColor(confidence)}30`,
            marginTop: 2,
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {confidence}%
        </span>
      )}

      {isSearch && (
        <span
          className="type-label shrink-0"
          title="Página de resultados — no se envía a las fuentes públicas del caso. Abre el enlace, encuentra el documento concreto y añádelo con «Añadir resultado»."
          style={{
            fontSize: "9px",
            padding: "3px 8px",
            borderRadius: 4,
            backgroundColor: "var(--surface)",
            color: "var(--muted)",
            border: "1px dashed var(--border)",
            marginTop: 2,
            whiteSpace: "nowrap",
          }}
        >
          búsqueda
        </span>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="type-small hover:underline"
          style={{
            color: isRejected ? "var(--muted)" : "var(--foreground)",
            display: "block",
            marginBottom: 4,
            wordBreak: "break-word",
          }}
        >
          {label}
        </a>
        <p className="type-label" style={{ fontSize: "9px", color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
          {note}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
        {status !== "approved" && (
          <button
            onClick={() => update("approved")}
            disabled={isPending}
            className="type-label"
            style={{
              fontSize: "10px",
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid #BBF7D0",
              backgroundColor: "#F0FDF4",
              color: "#166534",
              cursor: "pointer",
              opacity: isPending ? 0.5 : 1,
            }}
          >
            ✓ Aprobar
          </button>
        )}
        {status !== "rejected" && (
          <button
            onClick={() => update("rejected")}
            disabled={isPending}
            className="type-label"
            style={{
              fontSize: "10px",
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid var(--border)",
              backgroundColor: "var(--surface)",
              color: "var(--muted)",
              cursor: "pointer",
              opacity: isPending ? 0.5 : 1,
            }}
          >
            ✗ Rechazar
          </button>
        )}
        {status !== "pending" && (
          <button
            onClick={() => update("pending")}
            disabled={isPending}
            className="type-label"
            style={{
              fontSize: "10px",
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid var(--border)",
              backgroundColor: "transparent",
              color: "var(--muted)",
              cursor: "pointer",
              opacity: isPending ? 0.5 : 1,
            }}
          >
            ↺
          </button>
        )}
        {!isSearch && !isRejected && (
          inTimeline ? (
            <button
              onClick={() => setShowTimelineForm(v => !v)}
              disabled={isPending}
              className="type-label"
              title="Ya tiene entrada en la cronología del caso — pulsa para editarla y volver a empujar."
              style={{
                fontSize: "10px",
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid #BFDBFE",
                backgroundColor: "#EFF6FF",
                color: "#1D4ED8",
                cursor: "pointer",
                opacity: isPending ? 0.5 : 1,
                whiteSpace: "nowrap",
              }}
            >
              ✓ en cronología
            </button>
          ) : (
            <button
              onClick={() => setShowTimelineForm(v => !v)}
              disabled={isPending}
              className="type-label"
              title="Crear una entrada en la cronología del caso a partir de este enlace (fecha, tipo y texto editables antes de empujar)."
              style={{
                fontSize: "10px",
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid var(--border)",
                backgroundColor: "transparent",
                color: "var(--foreground)",
                cursor: "pointer",
                opacity: isPending ? 0.5 : 1,
                whiteSpace: "nowrap",
              }}
            >
              → Cronología
            </button>
          )
        )}
      </div>

      {/* Inline timeline form */}
      {showTimelineForm && (
        <div
          style={{
            flexBasis: "100%",
            borderTop: "1px dashed var(--border)",
            paddingTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={tlDate}
              onChange={e => setTlDate(e.target.value)}
              placeholder="DD/MM/AAAA o AAAA"
              style={{ ...inputStyle, maxWidth: 150 }}
            />
            <select value={tlType} onChange={e => setTlType(e.target.value)} style={{ ...inputStyle, maxWidth: 190 }}>
              {EVENT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.title}</option>
              ))}
            </select>
          </div>
          <input
            value={tlTitle}
            onChange={e => setTlTitle(e.target.value)}
            placeholder="Título del evento"
            style={inputStyle}
          />
          <textarea
            value={tlDescription}
            onChange={e => setTlDescription(e.target.value)}
            placeholder="Descripción (opcional) — redacta el hecho en tono editorial; cita el documento como respaldo"
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
          {tlError && (
            <p className="type-small" style={{ color: "#B91C1C", margin: 0, fontSize: 11 }}>{tlError}</p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={submitTimeline}
              disabled={isPending || !tlDate.trim() || !tlTitle.trim()}
              className="type-label"
              style={{
                fontSize: "10px",
                padding: "6px 14px",
                borderRadius: 4,
                border: "1px solid #BFDBFE",
                backgroundColor: "#EFF6FF",
                color: "#1D4ED8",
                cursor: "pointer",
                opacity: isPending || !tlDate.trim() || !tlTitle.trim() ? 0.5 : 1,
              }}
            >
              {inTimeline ? "Actualizar entrada" : "Empujar a la cronología"}
            </button>
            <button
              onClick={() => setShowTimelineForm(false)}
              disabled={isPending}
              className="type-label"
              style={{
                fontSize: "10px",
                padding: "6px 14px",
                borderRadius: 4,
                border: "1px solid var(--border)",
                backgroundColor: "transparent",
                color: "var(--muted)",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
