import Link from "next/link";
import type { Case } from "@/data/cases";

interface CaseCardProps {
  case_: Case;
}

export default function CaseCard({ case_: c }: CaseCardProps) {
  const isConvicted = c.status === "Sentencia firme";

  return (
    <Link
      href={`/casos/${c.slug}`}
      className="group flex flex-col rounded-sm overflow-hidden transition-transform duration-200 hover:-translate-y-0.5"
      style={{ backgroundColor: "var(--surface)" }}
    >
      {/* Image / colour area */}
      <div
        className="h-44 md:h-52 relative flex items-end px-5 pb-4"
        style={{ backgroundColor: c.accentColor + "22" }}
      >
        {/* Year */}
        <span
          className="type-data text-[11px]"
          style={{ color: "var(--muted)" }}
        >
          {c.year}
        </span>

        {/* Hover arrow */}
        <span
          className="absolute right-5 bottom-4 type-data text-[11px] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{ color: "var(--accent)" }}
        >
          Leer caso →
        </span>
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: "var(--border)" }} />

      {/* Body */}
      <div className="flex flex-col flex-1 p-5 gap-3">
        <div>
          <h3 className="type-h3 text-[22px] md:text-[26px]" style={{ color: "var(--foreground)" }}>
            {c.title}
          </h3>
          <p className="type-small mt-1" style={{ color: "var(--muted)" }}>
            {c.municipality}
          </p>
        </div>

        {/* Hectares */}
        <div>
          <span className="type-data-lg text-[22px]" style={{ color: "var(--foreground)" }}>
            {c.hectares.toLocaleString("es-ES")} ha
          </span>
          <p className="type-label mt-0.5" style={{ color: "var(--muted)", fontSize: "9px" }}>
            superficie calcinada
          </p>
        </div>

        {/* Excerpt */}
        <p
          className="type-small flex-1"
          style={{ color: "var(--muted)", WebkitLineClamp: 3, overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical" }}
        >
          {c.excerpt}
        </p>

        {/* Status pill */}
        <div>
          <span
            className="inline-flex items-center px-3 py-1 rounded-full type-label"
            style={{
              fontSize: "10px",
              backgroundColor: isConvicted ? "var(--accent)" : "transparent",
              color: isConvicted ? "var(--accent-foreground)" : "var(--muted)",
              border: isConvicted ? "none" : "1px solid var(--border)",
            }}
          >
            {c.status}
          </span>
        </div>
      </div>
    </Link>
  );
}
