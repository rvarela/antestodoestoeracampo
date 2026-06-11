"use client";

import dynamic from "next/dynamic";
import type { CaseSummary } from "@/types/case";

const MapboxMap = dynamic(() => import("./MapboxMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full" style={{ backgroundColor: "var(--map-water)" }} />
  ),
});

// scrollIntoView's "smooth" speed isn't configurable — animate manually (~1.2s)
function scrollToCases() {
  const el = document.getElementById("casos");
  if (!el) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.scrollIntoView();
    return;
  }
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const from = window.scrollY;
  const to = el.getBoundingClientRect().top + from - margin;
  const duration = 1200;
  const start = performance.now();
  const easeInOutCubic = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const step = (now: number) => {
    const t = Math.min((now - start) / duration, 1);
    window.scrollTo(0, from + (to - from) * easeInOutCubic(t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export default function MapHero({ cases }: { cases: CaseSummary[] }) {
  return (
    <section
      className="relative w-full"
      style={{ height: "75svh", minHeight: "480px", backgroundColor: "var(--map-water)" }}
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

      {/* Case count badge — top-right, below nav; scrolls to the cases grid */}
      <button
        onClick={scrollToCases}
        aria-label="Ir a los casos documentados"
        className="group absolute top-20 md:top-24 right-6 md:right-12 px-4 py-2 rounded-full z-10 transition-transform duration-200 hover:scale-[1.04]"
        style={{ backgroundColor: "var(--foreground)" }}
      >
        <span className="type-data text-[11px] md:text-[12px]" style={{ color: "white" }}>
          {cases.length} casos documentados
          <span
            aria-hidden
            className="inline-block ml-2 transition-transform duration-200 group-hover:translate-y-[2px]"
          >
            ↓
          </span>
        </span>
      </button>
    </section>
  );
}
