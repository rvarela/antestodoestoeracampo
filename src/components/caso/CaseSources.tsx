"use client";

import { motion } from "framer-motion";
import type { Source, SourceType } from "@/types/case";

const TYPE_LABELS: Record<SourceType, string> = {
  EGIF: "EGIF",
  Catastro: "Catastro",
  BOE: "BOE",
  Sentencia: "Sentencia",
  Prensa: "Prensa",
  Otro: "Otro",
};

export default function CaseSources({ sources }: { sources: Source[] }) {
  return (
    <section
      className="px-6 md:px-12 py-12 md:py-16"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <motion.p
        className="type-label mb-6"
        style={{ color: "var(--muted)" }}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
      >
        Fuentes
      </motion.p>

      <ul className="flex flex-col gap-3 max-w-2xl">
        {sources.map((s, i) => (
          <motion.li
            key={i}
            className="flex items-start gap-3"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Type badge */}
            <span
              className="type-label shrink-0 px-2 py-0.5 rounded-sm mt-0.5"
              style={{
                fontSize: "9px",
                backgroundColor: "var(--surface)",
                color: "var(--muted)",
                border: "1px solid var(--border)",
              }}
            >
              {TYPE_LABELS[s.type]}
            </span>

            {/* Label / link + optional verification note */}
            <div className="flex flex-col gap-1">
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="type-small hover:underline"
                  style={{ color: "var(--foreground)" }}
                >
                  {s.label}
                </a>
              ) : (
                <span className="type-small" style={{ color: "var(--muted)" }}>
                  {s.label}
                </span>
              )}
              {s.note && (
                <span
                  className="type-label"
                  style={{ fontSize: "9px", color: "var(--accent)", letterSpacing: "0.5px" }}
                >
                  ⚠ {s.note}
                </span>
              )}
            </div>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
