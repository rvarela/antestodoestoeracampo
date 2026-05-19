import type { CaseDetail } from "@/types/case";

const STATUS_COLORS: Record<string, string> = {
  "Sentencia firme": "var(--accent)",
  "En investigación": "var(--forest)",
  "Archivado": "var(--muted)",
  "Sobreseído": "var(--muted)",
};

export default function CaseHero({ case_: c }: { case_: CaseDetail }) {
  return (
    <div className="px-6 md:px-12 pt-12 pb-10 md:pt-16 md:pb-14">
      {/* Eyebrow */}
      <p className="type-label mb-6" style={{ color: "var(--muted)" }}>
        {c.region} · {c.year}
      </p>

      {/* Title */}
      <h1
        style={{
          fontFamily: "var(--font-newsreader), Georgia, serif",
          fontSize: "clamp(40px, 6vw, 80px)",
          lineHeight: 1.05,
          fontStyle: "italic",
          fontWeight: 400,
          color: "var(--foreground)",
          maxWidth: "16ch",
        }}
      >
        {c.title}
      </h1>

      {/* Status + outcome row */}
      <div className="flex flex-wrap items-center gap-3 mt-6">
        <span
          className="inline-flex items-center px-3 py-1 rounded-full type-label"
          style={{
            fontSize: "10px",
            backgroundColor: c.status === "Sentencia firme" ? "var(--accent)" : "var(--surface)",
            color: c.status === "Sentencia firme" ? "var(--accent-foreground)" : "var(--muted)",
            border: c.status === "Sentencia firme" ? "none" : "1px solid var(--border)",
          }}
        >
          {c.status}
        </span>
        {c.outcome && (
          <span className="type-small" style={{ color: "var(--muted)" }}>
            {c.outcome}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div
        className="flex flex-wrap gap-6 md:gap-10 mt-8 pt-8"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div>
          <p
            className="type-data-lg"
            style={{ color: "var(--foreground)", fontSize: "clamp(22px, 3vw, 32px)" }}
          >
            {c.hectares?.toLocaleString("es-ES")} ha
          </p>
          <p className="type-label mt-1" style={{ color: "var(--muted)", fontSize: "9px" }}>
            superficie calcinada
          </p>
        </div>
        <div>
          <p
            className="type-data-lg"
            style={{ color: "var(--foreground)", fontSize: "clamp(22px, 3vw, 32px)" }}
          >
            {c.year}
          </p>
          <p className="type-label mt-1" style={{ color: "var(--muted)", fontSize: "9px" }}>
            año del incendio
          </p>
        </div>
        <div>
          <p
            className="type-data"
            style={{
              color: STATUS_COLORS[c.status] ?? "var(--muted)",
              fontSize: "clamp(14px, 1.5vw, 18px)",
              lineHeight: 1.8,
            }}
          >
            {c.status}
          </p>
          <p className="type-label mt-1" style={{ color: "var(--muted)", fontSize: "9px" }}>
            estado judicial
          </p>
        </div>
      </div>

      {/* Accent rule */}
      <div
        className="mt-10 h-px w-16"
        style={{ backgroundColor: c.accentColor ?? "var(--accent)" }}
      />
    </div>
  );
}
