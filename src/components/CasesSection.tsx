"use client";

import { useState } from "react";
import { CASES, FILTERS, type Filter } from "@/data/cases";
import CaseCard from "./CaseCard";

export default function CasesSection() {
  const [activeFilter, setActiveFilter] = useState<Filter>("Todos");

  const filtered = CASES.filter((c) => {
    if (activeFilter === "Todos") return true;
    if (activeFilter === "Sentencia firme") return c.status === "Sentencia firme";
    return c.region === activeFilter;
  });

  return (
    <section className="px-6 md:px-12 py-16 md:py-24">
      {/* Section header */}
      <div className="mb-10 md:mb-14">
        <p className="type-label mb-4" style={{ color: "var(--muted)" }}>
          Casos documentados
        </p>
        <h2 className="type-h1" style={{ color: "var(--foreground)" }}>
          El rastro del fuego
        </h2>
        <p
          className="type-body-lg mt-4 max-w-2xl"
          style={{ color: "var(--muted)", whiteSpace: "normal" }}
        >
          Cada punto en el mapa es un caso donde el fuego fue seguido por
          cambios en la calificación del suelo. Datos de fuentes públicas:
          EGIF, catastro, BOE y sentencias judiciales.
        </p>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-10">
        {FILTERS.map((f) => {
          const active = f === activeFilter;
          return (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className="px-4 py-1.5 rounded-full type-small transition-all duration-150"
              style={{
                backgroundColor: active ? "var(--foreground)" : "var(--surface)",
                color: active ? "white" : "var(--muted)",
                border: active ? "none" : "1px solid var(--border)",
              }}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 md:gap-6">
          {filtered.map((c) => (
            <CaseCard key={c.slug} case_={c} />
          ))}
        </div>
      ) : (
        <p className="type-body" style={{ color: "var(--muted)" }}>
          No hay casos documentados para este filtro todavía.
        </p>
      )}
    </section>
  );
}
