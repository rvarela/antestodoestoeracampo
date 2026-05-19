import Link from "next/link";
import Image from "next/image";
import type { CaseSummary } from "@/types/case";
import { urlFor } from "@/sanity/lib/image";

interface CaseCardProps {
  case_: CaseSummary;
}

export default function CaseCard({ case_: c }: CaseCardProps) {
  const isConvicted = c.status === "Sentencia firme";
  const imageUrl = c.coverImage?.asset
    ? urlFor(c.coverImage).width(800).height(416).fit("crop").auto("format").url()
    : null;

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
        {imageUrl && (
          <Image
            src={imageUrl}
            alt={c.coverImage?.alt ?? c.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
          />
        )}
        {/* Gradient overlay so year label stays readable over images */}
        {imageUrl && (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 60%)" }}
          />
        )}

        {/* Year */}
        <span
          className="relative type-data text-[11px] z-10"
          style={{ color: imageUrl ? "rgba(255,255,255,0.8)" : "var(--muted)" }}
        >
          {c.year}
        </span>

        {/* Hover arrow */}
        <span
          className="absolute right-5 bottom-4 type-data text-[11px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10"
          style={{ color: imageUrl ? "white" : "var(--accent)" }}
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
