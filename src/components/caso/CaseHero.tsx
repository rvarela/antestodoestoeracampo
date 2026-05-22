"use client";

import { useRef } from "react";
import { useScroll, useTransform, motion } from "framer-motion";
import { urlFor } from "@/sanity/lib/image";
import type { CaseDetail } from "@/types/case";

function heroImageUrl(c: CaseDetail): string | null {
  if (c.coverImage?.asset) {
    return urlFor(c.coverImage).width(1800).height(900).fit("crop").auto("format").url();
  }
  if (c.coordinates) {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const { lat, lng } = c.coordinates;
    const ha = c.hectares ?? 1000;
    const t = Math.max(0, Math.min(1,
      (Math.log(Math.max(1, ha)) - Math.log(100)) / (Math.log(200000) - Math.log(100))
    ));
    const zoom = Math.round(13 - t * 5);
    return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/pin-l+C4622D(${lng},${lat})/${lng},${lat},${zoom}/1800x900?access_token=${token}`;
  }
  return null;
}

export default function CaseHero({ case_: c }: { case_: CaseDetail }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  // Image moves at 40% of scroll speed — classic parallax
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "40%"]);

  const imageUrl = heroImageUrl(c);
  const isConvicted = c.status === "Sentencia firme";

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden"
      style={{ height: "80svh", minHeight: 480 }}
    >
      {/* Parallax image layer */}
      {imageUrl ? (
        <motion.div
          className="absolute inset-0 w-full"
          style={{ y, height: "140%", top: "-20%" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={c.coverImage?.alt ?? `Vista satélite — ${c.title}`}
            className="w-full h-full object-cover"
          />
        </motion.div>
      ) : (
        // No image — solid dark background
        <div
          className="absolute inset-0"
          style={{ backgroundColor: c.accentColor ?? "var(--forest)" }}
        />
      )}

      {/* Gradient overlay — heavy at bottom for text legibility */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.05) 100%)",
        }}
      />

      {/* Text content — anchored bottom-left */}
      <div className="absolute inset-0 flex flex-col justify-end px-6 md:px-12 pb-10 md:pb-14">
        {/* Eyebrow */}
        <p
          className="type-label mb-4"
          style={{ color: "rgba(255,255,255,0.65)", fontSize: "11px", letterSpacing: "1.5px" }}
        >
          {c.region} · {c.municipality} · {c.year}
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
            textShadow: "0 2px 12px rgba(0,0,0,0.3)",
          }}
        >
          {c.title}
        </h1>

        {/* Status pill + hectares */}
        <div className="flex flex-wrap items-center gap-3 mt-5">
          <span
            className="inline-flex items-center px-3 py-1 rounded-full type-label"
            style={{
              fontSize: "10px",
              backgroundColor: isConvicted ? "var(--accent)" : "rgba(255,255,255,0.15)",
              color: "#fff",
              border: isConvicted ? "none" : "1px solid rgba(255,255,255,0.3)",
              backdropFilter: "blur(4px)",
            }}
          >
            {c.status}
          </span>
          {c.hectares && (
            <span
              className="type-data"
              style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px" }}
            >
              {c.hectares.toLocaleString("es-ES")} ha calcinadas
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
