"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pushApprovedLinks } from "../actions";

export function PushButton({
  slug,
  toPushCount,
  approvedSearches,
}: {
  slug: string;
  toPushCount: number;
  approvedSearches: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ pushed?: number } | null>(null);
  const router = useRouter();

  // Local guard: after a successful push the button stays disabled even if
  // the server re-render is briefly stale (CDN cache)
  const nothingToPush = toPushCount === 0 || result !== null;

  function handlePush() {
    startTransition(async () => {
      const res = await pushApprovedLinks(slug);
      setResult(res);
      router.refresh();
    });
  }

  const searchNote = approvedSearches > 0
    ? `${approvedSearches} búsqueda${approvedSearches !== 1 ? "s" : ""} aprobada${approvedSearches !== 1 ? "s" : ""} ya pública${approvedSearches !== 1 ? "s" : ""} en «Búsquedas útiles» del caso`
    : null;

  if (nothingToPush) {
    return (
      <p className="type-small" style={{ color: "var(--muted)", margin: 0 }}>
        {result?.pushed
          ? `✓ ${result.pushed} fuente${result.pushed !== 1 ? "s" : ""} añadida${result.pushed !== 1 ? "s" : ""} al caso`
          : "✓ Todo lo aprobado ya está en el caso"}
        {searchNote ? ` · ${searchNote}` : ""}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
        {isPending
          ? "Enviando…"
          : `Enviar ${toPushCount} aprobado${toPushCount !== 1 ? "s" : ""} a Sanity`}
      </button>
      {searchNote && (
        <p className="type-small" style={{ color: "var(--muted)", margin: 0 }}>
          {searchNote}
        </p>
      )}
    </div>
  );
}
