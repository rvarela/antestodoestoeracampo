"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { CaseSummary } from "@/types/case";

// Editorial map colours matching the design system
const STYLE_OVERRIDES: Array<[string, string, string]> = [
  // [layer-id, property, value]
  ["water",               "fill-color",   "#CED2D5"],
  ["land",                "background-color", "#DDE0D9"],
  ["landcover",           "fill-color",   "#D5D9D3"],
  ["national-park",       "fill-color",   "#D0D7CD"],
  ["landuse",             "fill-color",   "#DDE0D9"],
  ["road-simple",         "line-color",   "#C8CCC8"],
  ["admin-1-boundary",    "line-color",   "#C4C4C0"],
  ["admin-0-boundary",    "line-color",   "#B0B0AC"],
];

export default function MapboxMap({ cases }: { cases: CaseSummary[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-3.7, 39.8],
      zoom: 5.2,
      minZoom: 4,
      maxZoom: 12,
      scrollZoom: false,
      // Keep view within Spain + Canaries
      maxBounds: [[-22, 26], [12, 50]],
    });

    mapRef.current = map;

    // Minimal navigation — zoom only, no compass
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", () => {
      // Apply editorial colour overrides
      STYLE_OVERRIDES.forEach(([layer, prop, value]) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          map.setPaintProperty(layer, prop as any, value);
        } catch {
          // Layer may not exist in this style version — skip silently
        }
      });

      // Add case markers (only cases with coordinates)
      cases.filter(c => c.coordinates).forEach((c) => {
        // Custom marker element
        const el = document.createElement("div");
        el.style.cssText = `
          position: relative;
          width: 16px;
          height: 16px;
          cursor: pointer;
        `;

        // Pulse ring
        const ring = document.createElement("div");
        ring.style.cssText = `
          position: absolute;
          inset: -8px;
          border-radius: 50%;
          border: 1.5px solid ${c.accentColor}55;
          pointer-events: none;
        `;
        el.appendChild(ring);

        // Dot
        const dot = document.createElement("div");
        dot.style.cssText = `
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${c.accentColor};
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.2);
          transition: transform 0.15s ease;
        `;
        el.appendChild(dot);

        el.addEventListener("mouseenter", () => { dot.style.transform = "scale(1.35)"; });
        el.addEventListener("mouseleave", () => { dot.style.transform = "scale(1)"; });

        const popup = new mapboxgl.Popup({
          offset: 14,
          closeButton: false,
          maxWidth: "260px",
          className: "antes-popup",
        }).setHTML(`
          <div style="padding:4px 2px">
            <p style="font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#8C8880;margin:0 0 6px">${c.year} · ${c.municipality}</p>
            <p style="font-size:17px;line-height:1.3;color:#1A180F;margin:0 0 6px;font-family:Georgia,serif;font-style:italic">${c.title}</p>
            <p style="font-size:13px;color:#1A180F;margin:0 0 2px;font-family:monospace">${c.hectares.toLocaleString("es-ES")} ha</p>
            <p style="font-size:11px;color:#8C8880;margin:0 0 10px">superficie calcinada</p>
            <a href="/casos/${c.slug}" style="font-size:12px;color:#C4622D;text-decoration:none;font-family:system-ui">Leer caso →</a>
          </div>
        `);

        new mapboxgl.Marker({ element: el })
          .setLngLat([c.coordinates!.lng, c.coordinates!.lat])
          .setPopup(popup)
          .addTo(map);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [cases]);

  return <div ref={containerRef} className="w-full h-full" />;
}
