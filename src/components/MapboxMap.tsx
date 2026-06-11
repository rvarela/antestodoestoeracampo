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
  const minPx = 4, maxPx = 16;
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
            Math.log(100), 6,
            Math.log(100000), 20,
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
            Math.log(100), 4,
            Math.log(100000), 16,
          ],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "circle-color": ["get", "accentColor"] as any,
          "circle-stroke-width": 2,
          "circle-stroke-color": "white",
          "circle-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.85, 1],
          "circle-radius-transition": { duration: 150 },
        },
      });

      // Popup — stays open while the cursor travels from the dot into it
      // (grace delay), and the whole card is one link so there's no tiny
      // target to hit.
      const popup = new mapboxgl.Popup({
        closeButton: false,
        maxWidth: "260px",
        className: "antes-popup",
      });

      let hoveredId: string | number | null = null;
      let closeTimer: number | null = null;

      const clearHover = () => {
        if (hoveredId !== null) map.setFeatureState({ source: "cases", id: hoveredId }, { hover: false });
        hoveredId = null;
      };

      const cancelClose = () => {
        if (closeTimer !== null) {
          window.clearTimeout(closeTimer);
          closeTimer = null;
        }
      };

      const scheduleClose = () => {
        cancelClose();
        closeTimer = window.setTimeout(() => {
          popup.remove();
          clearHover();
        }, 300);
      };

      map.on("mouseenter", "cases-dot", (e) => {
        map.getCanvas().style.cursor = "pointer";
        if (!e.features?.length) return;
        cancelClose();

        const f = e.features[0];
        clearHover();
        hoveredId = f.id ?? null;
        if (hoveredId !== null) map.setFeatureState({ source: "cases", id: hoveredId }, { hover: true });

        const props = f.properties!;
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];

        popup.setLngLat(coords).setHTML(`
          <a href="/casos/${props.slug}" style="display:block;padding:4px 2px;text-decoration:none;cursor:pointer">
            <p style="font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#8C8880;margin:0 0 6px">${props.year} · ${props.municipality}</p>
            <p style="font-size:17px;line-height:1.3;color:#1A180F;margin:0 0 6px;font-family:Georgia,serif;font-style:italic">${props.title}</p>
            <p style="font-size:13px;color:#1A180F;margin:0 0 2px;font-family:monospace">${Number(props.hectares).toLocaleString("es-ES")} ha</p>
            <p style="font-size:11px;color:#8C8880;margin:0 0 10px">superficie calcinada</p>
            <span style="font-size:12px;color:#C4622D;font-family:system-ui">Leer caso →</span>
          </a>
        `).addTo(map);

        // Keep the popup alive while the cursor is inside it. Property
        // assignment (not addEventListener) so re-entering the dot never
        // stacks duplicate handlers on a reused element.
        const el = popup.getElement();
        if (el) {
          el.onmouseenter = cancelClose;
          el.onmouseleave = scheduleClose;
        }
      });

      map.on("mouseleave", "cases-dot", () => {
        map.getCanvas().style.cursor = "";
        scheduleClose();
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
