"use client";

import { motion } from "framer-motion";

const SOURCE_LABELS: Record<string, string> = {
  CENDOJ: "CENDOJ",
  BOE: "BOE",
  CCAA: "Boletín CCAA",
  ElPais: "El País",
  ElMundo: "El Mundo",
  ABC: "ABC",
  Prensa: "Prensa",
  Catastro: "Catastro",
  Maps: "Satélite",
  Otro: "Otro",
};

export interface SearchLink {
  label: string;
  url: string;
  sourceType: string;
}

export default function CaseSearchLinks({ links }: { links: SearchLink[] }) {
  return (
    <section
      className="px-6 md:px-12 py-12 md:py-16"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <motion.p
        className="type-label mb-3"
        style={{ color: "var(--muted)" }}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
      >
        Búsquedas útiles
      </motion.p>

      <motion.p
        className="type-small mb-6 max-w-2xl"
        style={{ color: "var(--muted)" }}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
      >
        Consultas preconfiguradas en registros públicos, hemerotecas y
        jurisprudencia para seguir investigando este caso. Son puntos de
        partida, no fuentes verificadas.
      </motion.p>

      <ul className="flex flex-col gap-3 max-w-2xl">
        {links.map((l, i) => (
          <motion.li
            key={l.url}
            className="flex items-start gap-3"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Type badge — dashed border marks it as a search, not a document */}
            <span
              className="type-label shrink-0 px-2 py-0.5 rounded-sm mt-0.5"
              style={{
                fontSize: "9px",
                backgroundColor: "transparent",
                color: "var(--muted)",
                border: "1px dashed var(--border)",
              }}
            >
              {SOURCE_LABELS[l.sourceType] ?? l.sourceType}
            </span>

            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="type-small hover:underline"
              style={{ color: "var(--foreground)" }}
            >
              {l.label} ↗
            </a>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
