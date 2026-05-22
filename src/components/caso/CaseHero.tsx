"use client";

import { useRef } from "react";
import { useScroll, useTransform, motion } from "framer-motion";
import { urlFor } from "@/sanity/lib/image";
import type { CaseDetail } from "@/types/case";

function heroImageUrl(c: CaseDetail): string | null {
  if (c.coverImage?.asset) {
    return urlFor(c.coverImage).width(1280).height(720).fit("crop").auto("format").url();
  }
  if (c.coordinates) {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const { lat, lng } = c.coordinates;
    const ha = c.hectares ?? 1000;
    const t = Math.max(0, Math.min(1,
      (Math.log(Math.max(1, ha)) - Math.log(100)) / (Math.log(200000) - Math.log(100))
    ));
    const zoom = Math.round(13 - t * 5);
    return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/pin-l+C4622D(${lng},${lat})/${lng},${lat},${zoom}/1280x720?access_token=${token}`;
  }
  return null;
}

export default function CaseHero({ case_: c }: { case_: CaseDetail }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "40%"]);

  const imageUrl = heroImageUrl(c);
  const isConvicted = c.status === "Sentencia firme";

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        width: "100%",
        height: "80svh",
        minHeight: 480,
        overflow: "hidden",
        backgroundColor: c.accentColor ?? "#2D4A3E",
      }}
    >
      {/* Parallax image layer — oversized vertically so it has room to travel */}
      {imageUrl && (
        <motion.div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "-20%",
            height: "140%",
            y,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={c.coverImage?.alt ?? `Vista satélite — ${c.title}`}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </motion.div>
      )}

      {/* Gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.08) 100%)",
        }}
      />

      {/* Text — bottom-left */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "clamp(24px, 5vw, 56px)",
          paddingBottom: "clamp(32px, 5vw, 56px)",
        }}
      >
        {/* Eyebrow */}
        <p
          className="type-label"
          style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", letterSpacing: "1.5px", marginBottom: 16 }}
        >
          {[c.region, c.municipality, c.year].filter(Boolean).join(" · ")}
        </p>

        {/* Title */}
        <h1
          style={{
            fontFamily: "var(--font-newsreader), Georgia, serif",
            fontSize: "clamp(36px, 5.5vw, 72px)",
            lineHeight: 1.05,
            fontStyle: "italic",
            fontWeight: 400,
            color: "#fff",
            maxWidth: "18ch",
            textShadow: "0 2px 16px rgba(0,0,0,0.4)",
            margin: 0,
          }}
        >
          {c.title}
        </h1>

        {/* Status pill + hectares */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 20 }}>
          <span
            className="type-label"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: "10px",
              backgroundColor: isConvicted ? "var(--accent)" : "rgba(255,255,255,0.15)",
              color: "#fff",
              border: isConvicted ? "none" : "1px solid rgba(255,255,255,0.3)",
              backdropFilter: "blur(6px)",
            }}
          >
            {c.status}
          </span>
          {c.hectares && (
            <span
              className="type-data"
              style={{ color: "rgba(255,255,255,0.65)", fontSize: "13px" }}
            >
              {c.hectares.toLocaleString("es-ES")} ha calcinadas
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
