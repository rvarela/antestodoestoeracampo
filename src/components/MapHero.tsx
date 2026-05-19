// MapHero — placeholder until Mapbox token is available.
// Replace the inner div with <MapboxMap /> once NEXT_PUBLIC_MAPBOX_TOKEN is set.

import { CASES } from "@/data/cases";

export default function MapHero() {
  return (
    <section
      className="relative w-full"
      style={{ height: "100svh", backgroundColor: "var(--map-water)" }}
    >
      {/* Map placeholder */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="w-[55%] max-w-[680px] aspect-[4/3] rounded-sm flex items-center justify-center"
          style={{ backgroundColor: "var(--map-land)" }}
        >
          <p className="type-label" style={{ color: "var(--muted)" }}>
            Mapa interactivo — Mapbox GL
          </p>
        </div>

        {/* Case dots (decorative — will be real pins on the map) */}
        {CASES.map((c) => (
          <span
            key={c.slug}
            className="absolute w-3 h-3 rounded-full border-2"
            style={{
              backgroundColor: c.accentColor,
              borderColor: "white",
              // Rough positions on the placeholder — will be replaced by Mapbox coords
              top: c.slug === "monteferro-nigran" ? "25%" : c.slug === "terra-mitica-benidorm" ? "60%" : "52%",
              left: c.slug === "monteferro-nigran" ? "24%" : c.slug === "terra-mitica-benidorm" ? "62%" : "60%",
            }}
          />
        ))}
      </div>

      {/* Editorial headline — bottom-left floating panel */}
      <div
        className="absolute bottom-12 left-6 md:left-12 max-w-[480px] md:max-w-[560px] p-6 md:p-8 rounded-sm"
        style={{ backgroundColor: "rgba(247,244,239,0.93)" }}
      >
        <h1 style={{ color: "var(--foreground)" }}>
          <span className="type-h1 md:type-display block" style={{ fontStyle: "italic" }}>
            Antes todo esto
          </span>
          <span className="type-h1 md:type-display block" style={{ color: "var(--accent)" }}>
            era campo.
          </span>
        </h1>
        <p className="type-small md:type-body mt-4" style={{ color: "var(--muted)" }}>
          Incendios, recalificaciones y poder en España.
        </p>
      </div>

      {/* Case count badge — top-right */}
      <div
        className="absolute top-20 md:top-24 right-6 md:right-12 px-4 py-2 rounded-full"
        style={{ backgroundColor: "var(--foreground)" }}
      >
        <span className="type-data text-[11px] md:text-[12px]" style={{ color: "white" }}>
          {CASES.length} casos documentados
        </span>
      </div>
    </section>
  );
}
