"use client";

import { useState, useMemo, useRef } from "react";
import type { CaseSummary } from "@/types/case";
import CaseCard from "./CaseCard";

type Filter = "Todos" | "Sentencia firme" | string;

/** Accent-insensitive lowercase for Spanish search (Ávila → avila) */
function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function matchesQuery(c: CaseSummary, q: string) {
  const haystack = normalize(
    `${c.title} ${c.municipality} ${c.region} ${c.year}`
  );
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export default function CasesSection({ cases }: { cases: CaseSummary[] }) {
  const [activeFilter, setActiveFilter] = useState<Filter>("Todos");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState(""); // committed search
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build filter list dynamically from the data
  const filters = useMemo<Filter[]>(() => {
    const regions = [...new Set(cases.map((c) => c.region).filter(Boolean))].sort();
    return ["Todos", "Sentencia firme", ...regions];
  }, [cases]);

  const suggestions = useMemo(() => {
    const q = normalize(input.trim());
    if (!q) return [];
    return cases.filter((c) => matchesQuery(c, q)).slice(0, 8);
  }, [cases, input]);

  const filtered = cases.filter((c) => {
    if (activeFilter === "Sentencia firme" && c.status !== "Sentencia firme") return false;
    if (activeFilter !== "Todos" && activeFilter !== "Sentencia firme" && c.region !== activeFilter) return false;
    const q = normalize(query.trim());
    return !q || matchesQuery(c, q);
  });

  const commit = (value: string) => {
    setInput(value);
    setQuery(value);
    setOpen(false);
    setHighlighted(-1);
  };

  const clear = () => {
    setInput("");
    setQuery("");
    setOpen(false);
    setHighlighted(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && highlighted >= 0 && suggestions[highlighted]) {
        commit(suggestions[highlighted].title);
      } else {
        commit(input);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlighted(-1);
    }
  };

  return (
    <section id="casos" className="px-6 md:px-12 py-16 md:py-24 scroll-mt-14 md:scroll-mt-16">
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

      {/* Search */}
      <div className="relative max-w-md mb-6">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--muted)"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-label="Buscar casos"
          placeholder="Buscar por municipio, región o año…"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
            setHighlighted(-1);
            if (e.target.value.trim() === "") setQuery("");
          }}
          onKeyDown={onKeyDown}
          onFocus={() => input.trim() && setOpen(true)}
          onBlur={() => setOpen(false)}
          className="w-full pl-11 pr-10 py-2.5 rounded-full type-small outline-none transition-colors duration-150 focus:border-[var(--muted)]"
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          }}
        />
        {input && (
          <button
            onClick={clear}
            aria-label="Limpiar búsqueda"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full transition-colors duration-150 hover:bg-[var(--border)]"
            style={{ color: "var(--muted)" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Suggestions dropdown */}
        {open && suggestions.length > 0 && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-full mt-2 rounded-xl overflow-hidden shadow-lg z-20"
            style={{
              backgroundColor: "var(--background)",
              border: "1px solid var(--border)",
            }}
          >
            {suggestions.map((c, i) => (
              <li
                key={c.slug}
                role="option"
                aria-selected={i === highlighted}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep input focus, fire before blur
                  commit(c.title);
                }}
                onMouseEnter={() => setHighlighted(i)}
                className="px-4 py-2.5 cursor-pointer flex items-baseline justify-between gap-3"
                style={{
                  backgroundColor: i === highlighted ? "var(--surface)" : "transparent",
                }}
              >
                <span className="type-small truncate" style={{ color: "var(--foreground)" }}>
                  {c.title}
                </span>
                <span className="type-data shrink-0" style={{ color: "var(--muted)", fontSize: "12px" }}>
                  {c.region} · {c.year}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-10">
        {filters.map((f) => {
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
          {query.trim()
            ? `No hay casos que coincidan con «${query.trim()}».`
            : "No hay casos documentados para este filtro todavía."}
        </p>
      )}
    </section>
  );
}
