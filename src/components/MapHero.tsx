"use client";

import dynamic from "next/dynamic";
import type { CaseSummary } from "@/types/case";

const MapboxMap = dynamic(() => import("./MapboxMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full" style={{ backgroundColor: "var(--map-water)" }} />
  ),
});

export default function MapHero({ cases }: { cases: CaseSummary[] }) {
  return (
    <section
      className="relative w-full"
      style={{ height: "100svh", backgroundColor: "var(--map-water)" }}
    >
      {/* Mapbox map — fills the entire section */}
      <div className="absolute inset-0">
        <MapboxMap cases={cases} />
      </div>

      {/* Editorial headline — bottom-left floating panel */}
      <div
        className="absolute bottom-10 left-6 md:left-12 max-w-[420px] md:max-w-[520px] p-6 md:p-8 rounded-sm z-10"
        style={{ backgroundColor: "rgba(247,244,239,0.93)" }}
      >
        <h1>
          <span
            className="block leading-none"
            style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontSize: "clamp(32px, 5vw, 56px)",
              fontStyle: "italic",
              fontWeight: 400,
              color: "var(--foreground)",
            }}
          >
            Antes todo esto
          </span>
          <span
            className="block leading-none mt-1"
            style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontSize: "clamp(32px, 5vw, 56px)",
              fontWeight: 400,
              color: "var(--accent)",
            }}
          >
            era campo.
          </span>
        </h1>
        <p
          className="mt-4 type-small md:type-body"
          style={{ color: "var(--muted)" }}
        >
          Incendios, recalificaciones y poder en España.
        </p>
      </div>

      {/* Case count badge — top-right, below nav */}
      <div
        className="absolute top-20 md:top-24 right-6 md:right-12 px-4 py-2 rounded-full z-10"
        style={{ backgroundColor: "var(--foreground)" }}
      >
        <span className="type-data text-[11px] md:text-[12px]" style={{ color: "white" }}>
          {cases.length} casos documentados
        </span>
      </div>
    </section>
  );
}
