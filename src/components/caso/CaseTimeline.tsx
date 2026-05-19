import type { TimelineEvent, EventType } from "@/types/case";

const TYPE_LABELS: Record<EventType, string> = {
  fire: "Incendio",
  purchase: "Compraventa",
  rezoning: "Recalificación",
  permit: "Permiso de obra",
  construction: "Construcción",
  judicial: "Judicial",
  political: "Político",
  other: "Otro",
};

const TYPE_COLORS: Record<EventType, string> = {
  fire: "var(--accent)",
  purchase: "var(--foreground)",
  rezoning: "var(--foreground)",
  permit: "var(--foreground)",
  construction: "var(--foreground)",
  judicial: "var(--forest)",
  political: "var(--muted)",
  other: "var(--muted)",
};

function EventDot({ type }: { type: EventType }) {
  return (
    <div
      className="shrink-0 w-2.5 h-2.5 rounded-full mt-1.5 z-10 relative"
      style={{ backgroundColor: TYPE_COLORS[type] ?? "var(--muted)" }}
    />
  );
}

export default function CaseTimeline({
  events,
  accentColor,
}: {
  events: TimelineEvent[];
  accentColor?: string;
}) {
  return (
    <section
      className="px-6 md:px-12 py-12 md:py-16"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <p className="type-label mb-8" style={{ color: "var(--muted)" }}>
        Cronología
      </p>

      <div className="relative max-w-2xl">
        {/* Vertical line */}
        <div
          className="absolute left-[4px] top-2 bottom-2 w-px"
          style={{ backgroundColor: "var(--border)" }}
        />

        <div className="flex flex-col gap-8">
          {events.map((event, i) => (
            <div key={i} className="flex gap-6 pl-1">
              <EventDot type={event.type} />

              <div className="pb-2">
                {/* Type label + date */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span
                    className="type-label px-2 py-0.5 rounded-sm"
                    style={{
                      fontSize: "9px",
                      backgroundColor: `${TYPE_COLORS[event.type]}18`,
                      color: TYPE_COLORS[event.type] ?? "var(--muted)",
                    }}
                  >
                    {TYPE_LABELS[event.type]}
                  </span>
                  <span className="type-data text-[12px]" style={{ color: "var(--muted)" }}>
                    {event.date}
                  </span>
                </div>

                {/* Event title */}
                <p
                  style={{
                    fontFamily: "var(--font-newsreader), Georgia, serif",
                    fontSize: "20px",
                    lineHeight: "28px",
                    fontWeight: 400,
                    color: "var(--foreground)",
                  }}
                >
                  {event.title}
                </p>

                {/* Description */}
                {event.description && (
                  <p
                    className="type-body mt-2"
                    style={{ color: "var(--muted)", whiteSpace: "normal" }}
                  >
                    {event.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
