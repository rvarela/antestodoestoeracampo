import type { PoliticalConnection } from "@/types/case";

export default function CaseConnections({
  connections,
}: {
  connections: PoliticalConnection[];
}) {
  return (
    <section
      className="px-6 md:px-12 py-12 md:py-16"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <p className="type-label mb-8" style={{ color: "var(--muted)" }}>
        Conexiones políticas
      </p>

      <div className="flex flex-col gap-4 max-w-2xl">
        {connections.map((c, i) => (
          <div
            key={i}
            className="p-5 md:p-6 rounded-sm"
            style={{
              backgroundColor: "var(--surface)",
              borderLeft: "3px solid var(--muted)",
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <div>
                <p
                  style={{
                    fontFamily: "var(--font-newsreader), Georgia, serif",
                    fontSize: "18px",
                    fontWeight: 400,
                    color: "var(--foreground)",
                  }}
                >
                  {c.name}
                </p>
                <p className="type-small mt-0.5" style={{ color: "var(--muted)" }}>
                  {c.role}
                </p>
              </div>
              {c.party && (
                <span
                  className="type-label px-2.5 py-1 rounded-sm shrink-0"
                  style={{
                    fontSize: "9px",
                    backgroundColor: "var(--border)",
                    color: "var(--muted)",
                  }}
                >
                  {c.party}
                </span>
              )}
            </div>
            <p className="type-body" style={{ color: "var(--foreground)", whiteSpace: "normal" }}>
              {c.connection}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
