"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLinkStatus } from "../actions";

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
}

function confidenceColor(c: number): string {
  if (c >= 70) return "#166534"; // green — likely the right fire
  if (c >= 45) return "#B45309"; // amber — plausible, verify
  return "#B91C1C";              // red — probably noise
}

export function LinkCard({ id, label, url, sourceType, note, status: initialStatus, isSearch, confidence }: LinkCardProps) {
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function update(next: "approved" | "rejected" | "pending") {
    setStatus(next); // optimistic
    startTransition(async () => {
      await setLinkStatus(id, next);
      // Re-render server data so the push button picks up the new approval
      router.refresh();
    });
  }

  const color = SOURCE_COLORS[sourceType] ?? "#6B7280";
  const isApproved = status === "approved";
  const isRejected = status === "rejected";

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
      </div>
    </div>
  );
}
