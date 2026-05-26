"use client";

import { useState, useTransition } from "react";
import { setLinkStatus } from "../actions";

const SOURCE_LABELS: Record<string, string> = {
  CENDOJ: "CENDOJ",
  BOE: "BOE",
  CCAA: "CCAA",
  ElPais: "El País",
  ElMundo: "El Mundo",
  ABC: "ABC",
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
}

export function LinkCard({ id, label, url, sourceType, note, status: initialStatus }: LinkCardProps) {
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();

  function update(next: "approved" | "rejected" | "pending") {
    setStatus(next); // optimistic
    startTransition(async () => {
      await setLinkStatus(id, next);
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
