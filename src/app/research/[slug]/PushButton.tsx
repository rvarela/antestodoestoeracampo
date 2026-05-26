"use client";

import { useState, useTransition } from "react";
import { pushApprovedLinks } from "../actions";

export function PushButton({ slug, approvedCount }: { slug: string; approvedCount: number }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ pushed?: number; alreadyPresent?: number } | null>(null);

  if (approvedCount === 0) return null;

  function handlePush() {
    startTransition(async () => {
      const res = await pushApprovedLinks(slug);
      setResult(res);
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button
        onClick={handlePush}
        disabled={isPending}
        style={{
          padding: "10px 20px",
          borderRadius: 6,
          border: "none",
          backgroundColor: isPending ? "var(--muted)" : "var(--accent)",
          color: "var(--accent-foreground)",
          fontFamily: "var(--font-inter), system-ui",
          fontSize: 13,
          fontWeight: 500,
          cursor: isPending ? "not-allowed" : "pointer",
          transition: "background-color 0.15s",
        }}
      >
        {isPending ? "Enviando…" : `Enviar ${approvedCount} aprobado${approvedCount !== 1 ? "s" : ""} a Sanity`}
      </button>
      {result && (
        <p className="type-small" style={{ color: "var(--muted)", margin: 0 }}>
          {result.pushed
            ? `✓ ${result.pushed} fuente${result.pushed !== 1 ? "s" : ""} añadida${result.pushed !== 1 ? "s" : ""} al caso`
            : result.alreadyPresent
            ? `Ya presentes en el caso`
            : "Nada nuevo que añadir"}
        </p>
      )}
    </div>
  );
}
