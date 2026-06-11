"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addManualLink } from "../actions";

const TYPES = [
  { value: "Prensa", label: "Prensa (artículo)" },
  { value: "CENDOJ", label: "CENDOJ (sentencia)" },
  { value: "BOE", label: "BOE (documento)" },
  { value: "CCAA", label: "Boletín CCAA (documento)" },
  { value: "Catastro", label: "Catastro" },
  { value: "Otro", label: "Otro" },
];

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  backgroundColor: "var(--background)",
  color: "var(--foreground)",
  fontFamily: "var(--font-inter), system-ui",
  fontSize: 13,
  outline: "none",
};

export function AddResultForm({ slug }: { slug: string }) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState("Prensa");
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    setMsg(null);
    startTransition(async () => {
      const res = await addManualLink(slug, { label, url, sourceType: type });
      if (res.ok) {
        setUrl("");
        setLabel("");
        setMsg("✓ Añadido como aprobado — usa «Enviar aprobados» para pasarlo a fuentes");
        router.refresh();
      } else {
        setMsg(res.error);
      }
    });
  }

  return (
    <div
      style={{
        borderRadius: 6,
        border: "1px dashed var(--border)",
        backgroundColor: "var(--surface)",
        padding: "14px 16px",
        marginBottom: 40,
      }}
    >
      <p className="type-label" style={{ fontSize: "10px", color: "var(--muted)", marginBottom: 10 }}>
        AÑADIR RESULTADO ESPECÍFICO
      </p>
      <p className="type-small" style={{ color: "var(--muted)", marginBottom: 12, fontSize: 12 }}>
        Las búsquedas de arriba son leads: ábrelas, encuentra el documento o artículo
        concreto y pega aquí su URL. Se añade como aprobado.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="url"
          placeholder="https://… (URL del documento o artículo)"
          aria-label="URL del resultado"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ ...inputStyle, flex: "2 1 260px" }}
        />
        <input
          type="text"
          placeholder="Etiqueta — p. ej. «El País 14/8/2022 — incendio declarado intencionado»"
          aria-label="Etiqueta del resultado"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ ...inputStyle, flex: "3 1 300px" }}
        />
        <select
          aria-label="Tipo de fuente"
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={inputStyle}
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <button
          onClick={submit}
          disabled={isPending || !url.trim() || !label.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            backgroundColor: "var(--forest)",
            color: "var(--forest-foreground)",
            fontFamily: "var(--font-inter), system-ui",
            fontSize: 13,
            fontWeight: 500,
            cursor: isPending ? "not-allowed" : "pointer",
            opacity: isPending || !url.trim() || !label.trim() ? 0.5 : 1,
          }}
        >
          {isPending ? "Añadiendo…" : "Añadir"}
        </button>
      </div>
      {msg && (
        <p className="type-small" style={{ color: msg.startsWith("✓") ? "#166534" : "var(--accent)", marginTop: 10, marginBottom: 0, fontSize: 12 }}>
          {msg}
        </p>
      )}
    </div>
  );
}
