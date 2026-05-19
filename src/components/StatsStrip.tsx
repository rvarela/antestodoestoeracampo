import { STATS } from "@/data/stats";

export default function StatsStrip({
  caseCount,
  totalHectares,
}: {
  caseCount: number;
  totalHectares: string;
}) {
  const stats = STATS.map((s) => {
    if (s.key === "caseCount") return { ...s, value: String(caseCount) };
    if (s.key === "totalHa") return { ...s, value: totalHectares };
    return s;
  });

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-4"
      style={{ backgroundColor: "var(--foreground)" }}
    >
      {stats.map((stat, i) => (
        <div
          key={i}
          className="flex flex-col gap-1 px-6 py-6 md:px-10 md:py-8"
          style={{
            borderRight:
              i < stats.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
            borderBottom:
              i < 2 ? "1px solid rgba(255,255,255,0.08)" : "none",
          }}
        >
          <span
            className="type-data-lg"
            style={{ color: "white" }}
          >
            {stat.value}
          </span>
          <span
            className="type-small mt-1"
            style={{ color: "var(--muted)" }}
          >
            {stat.label}
          </span>
          <span
            className="type-label mt-2"
            style={{ color: "rgba(140,136,128,0.5)", fontSize: "9px" }}
          >
            {stat.source}
          </span>
        </div>
      ))}
    </div>
  );
}
