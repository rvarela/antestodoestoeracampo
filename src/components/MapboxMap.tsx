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

// Log scale: 100ha → 8px, 100 000ha → 32px
function pinSize(hectares: number): number {
  const minPx = 8, maxPx = 32;
  const t = Math.max(0, Math.min(1,
    (Math.log(Math.max(1, hectares)) - Math.log(100)) / (Math.log(100000) - Math.log(100))
  ));
  return Math.round(minPx + t * (maxPx - minPx));
}

// Only show cases within Spain + Canaries bounds
function isInSpain(c: CaseSummary): boolean {
  if (!c.coordinates) return false;
  const { lat, lng } = c.coordinates;
  return lat >= 26 && lat <= 44.5 && lng >= -22 && lng <= 5;
}

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
      maxBounds: [[-22, 26], [12, 50]],
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", () => {
      // Apply editorial colour overrides
      STYLE_OVERRIDES.forEach(([layer, prop, value]) => {
        if (!map.getLayer(layer)) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.setPaintProperty(layer, prop as any, value);
      });

      // Filter to valid Spanish coordinates only
      const validCases = cases.filter(isInSpain);

      // GeoJSON source — renders in WebGL, stays perfectly synced with tiles
      map.addSource("cases", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: validCases.map(c => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [c.coordinates!.lng, c.coordinates!.lat] },
            properties: {
              slug: c.slug,
              title: c.title,
              hectares: c.hectares,
              year: c.year,
              municipality: c.municipality ?? "",
              accentColor: c.accentColor ?? "#C4622D",
            },
          })),
        },
      });

      // Pulse ring — larger, transparent stroke
      map.addLayer({
        id: "cases-ring",
        type: "circle",
        source: "cases",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["ln", ["max", ["get", "hectares"], 1]],
            Math.log(100), 12,
            Math.log(100000), 42,
          ],
          "circle-color": "transparent",
          "circle-stroke-width": 1.5,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "circle-stroke-color": ["get", "accentColor"] as any,
          "circle-stroke-opacity": 0.3,
        },
      });

      // Dot — filled circle
      map.addLayer({
        id: "cases-dot",
        type: "circle",
        source: "cases",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["ln", ["max", ["get", "hectares"], 1]],
            Math.log(100), 8,
            Math.log(100000), 32,
          ],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "circle-color": ["get", "accentColor"] as any,
          "circle-stroke-width": 2,
          "circle-stroke-color": "white",
          "circle-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.85, 1],
          "circle-radius-transition": { duration: 150 },
        },
      });

      // Popup
      const popup = new mapboxgl.Popup({
        closeButton: false,
        maxWidth: "260px",
        className: "antes-popup",
      });

      let hoveredId: string | number | null = null;

      map.on("mouseenter", "cases-dot", (e) => {
        map.getCanvas().style.cursor = "pointer";
        if (!e.features?.length) return;

        const f = e.features[0];
        if (hoveredId !== null) map.setFeatureState({ source: "cases", id: hoveredId }, { hover: false });
        hoveredId = f.id ?? null;
        if (hoveredId !== null) map.setFeatureState({ source: "cases", id: hoveredId }, { hover: true });

        const props = f.properties!;
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];

        popup.setLngLat(coords).setHTML(`
          <div style="padding:4px 2px">
            <p style="font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#8C8880;margin:0 0 6px">${props.year} · ${props.municipality}</p>
            <p style="font-size:17px;line-height:1.3;color:#1A180F;margin:0 0 6px;font-family:Georgia,serif;font-style:italic">${props.title}</p>
            <p style="font-size:13px;color:#1A180F;margin:0 0 2px;font-family:monospace">${Number(props.hectares).toLocaleString("es-ES")} ha</p>
            <p style="font-size:11px;color:#8C8880;margin:0 0 10px">superficie calcinada</p>
            <a href="/casos/${props.slug}" style="font-size:12px;color:#C4622D;text-decoration:none;font-family:system-ui">Leer caso →</a>
          </div>
        `).addTo(map);
      });

      map.on("mouseleave", "cases-dot", () => {
        map.getCanvas().style.cursor = "";
        if (hoveredId !== null) map.setFeatureState({ source: "cases", id: hoveredId }, { hover: false });
        hoveredId = null;
        popup.remove();
      });

      map.on("click", "cases-dot", (e) => {
        if (!e.features?.length) return;
        const slug = e.features[0].properties!.slug;
        window.location.href = `/casos/${slug}`;
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [cases]);

  return <div ref={containerRef} className="w-full h-full" />;
}
