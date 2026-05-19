import type { JudicialEvent, JudicialResult } from "@/types/case";

const RESULT_LABELS: Record<JudicialResult, string> = {
  convicted: "Condenado",
  acquitted: "Absuelto",
  pending: "Pendiente",
  archived: "Archivado",
};

const RESULT_COLORS: Record<JudicialResult, string> = {
  convicted: "var(--accent)",
  acquitted: "var(--forest)",
  pending: "var(--muted)",
  archived: "var(--muted)",
};

export default function CaseJudicial({ events }: { events: JudicialEvent[] }) {
  return (
    <section
      className="px-6 md:px-12 py-12 md:py-16"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <p className="type-label mb-8" style={{ color: "var(--muted)" }}>
        Historia judicial
      </p>

      <div className="flex flex-col gap-6 max-w-2xl">
        {events.map((e, i) => (
          <div key={i} className="flex gap-5">
            {/* Result indicator */}
            <div
              className="shrink-0 w-1 rounded-full"
              style={{ backgroundColor: RESULT_COLORS[e.result] ?? "var(--muted)" }}
            />

            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <span
                  className="type-label px-2 py-0.5 rounded-sm"
                  style={{
                    fontSize: "9px",
                    backgroundColor: `${RESULT_COLORS[e.result]}18`,
                    color: RESULT_COLORS[e.result] ?? "var(--muted)",
                  }}
                >
                  {RESULT_LABELS[e.result]}
                </span>
                <span className="type-data text-[12px]" style={{ color: "var(--muted)" }}>
                  {e.date}
                </span>
              </div>
              <p
                style={{
                  fontFamily: "var(--font-newsreader), Georgia, serif",
                  fontSize: "18px",
                  fontWeight: 400,
                  color: "var(--foreground)",
                  marginBottom: "6px",
                }}
              >
                {e.court}
              </p>
              {e.description && (
                <p className="type-body" style={{ color: "var(--muted)", whiteSpace: "normal" }}>
                  {e.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
