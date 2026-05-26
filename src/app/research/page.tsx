import Link from "next/link";
import { client } from "@/sanity/lib/client";

interface CaseRow {
  slug: string;
  title: string;
  region: string;
  year: number;
  hectares: number;
  pending: number;
  approved: number;
  rejected: number;
}

export const revalidate = 0;

export default async function ResearchPage() {
  // Fetch all researchLink documents grouped by case
  const links = await client.fetch<Array<{
    caseSlug: string;
    status: string;
  }>>(`*[_type == "researchLink"]{ caseSlug, status }`);

  // Fetch published cases
  const cases = await client.fetch<Array<{
    slug: string;
    title: string;
    region: string;
    year: number;
    hectares: number;
  }>>(`*[_type == "case" && hidden == false] | order(hectares desc){
    "slug": slug.current, title, region, year, hectares
  }`);

  // Aggregate link counts per case
  const counts: Record<string, { pending: number; approved: number; rejected: number }> = {};
  for (const l of links) {
    if (!counts[l.caseSlug]) counts[l.caseSlug] = { pending: 0, approved: 0, rejected: 0 };
    const s = l.status as "pending" | "approved" | "rejected";
    if (counts[l.caseSlug][s] !== undefined) counts[l.caseSlug][s]++;
  }

  const rows: CaseRow[] = cases.map(c => ({
    ...c,
    pending:  counts[c.slug]?.pending  ?? 0,
    approved: counts[c.slug]?.approved ?? 0,
    rejected: counts[c.slug]?.rejected ?? 0,
  }));

  // Sort: cases with pending links first, then by hectares
  rows.sort((a, b) => (b.pending - a.pending) || (b.hectares - a.hectares));

  const totalPending  = rows.reduce((n, r) => n + r.pending, 0);
  const totalApproved = rows.reduce((n, r) => n + r.approved, 0);
  const unseeded      = rows.filter(r => r.pending + r.approved + r.rejected === 0).length;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--background)", fontFamily: "var(--font-inter), system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p className="type-label" style={{ color: "var(--muted)", fontSize: "10px", marginBottom: 4 }}>
            HERRAMIENTA DE INVESTIGACIÓN
          </p>
          <h1 style={{ fontFamily: "var(--font-newsreader)", fontSize: 28, fontStyle: "italic", fontWeight: 400, color: "var(--foreground)", margin: 0 }}>
            Research Queue
          </h1>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <span className="type-data" style={{ fontSize: 20, color: "var(--foreground)" }}>{totalPending}</span>
            <p className="type-label" style={{ fontSize: "9px", color: "var(--muted)", margin: 0 }}>pendientes</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="type-data" style={{ fontSize: 20, color: "#2D7A4A" }}>{totalApproved}</span>
            <p className="type-label" style={{ fontSize: "9px", color: "var(--muted)", margin: 0 }}>aprobados</p>
          </div>
          {unseeded > 0 && (
            <div style={{ textAlign: "right" }}>
              <span className="type-data" style={{ fontSize: 20, color: "var(--accent)" }}>{unseeded}</span>
              <p className="type-label" style={{ fontSize: "9px", color: "var(--muted)", margin: 0 }}>sin sembrar</p>
            </div>
          )}
        </div>
      </div>

      {/* Seed hint */}
      {unseeded > 0 && (
        <div style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "10px 40px" }}>
          <p className="type-small" style={{ color: "var(--muted)", margin: 0 }}>
            {unseeded} caso(s) sin enlaces generados. Ejecuta{" "}
            <code style={{ backgroundColor: "var(--border)", padding: "1px 6px", borderRadius: 3, fontSize: 12 }}>
              npm run research:seed
            </code>{" "}
            para generarlos.
          </p>
        </div>
      )}

      {/* Table */}
      <div style={{ padding: "0 40px 60px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 32 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Caso", "Región", "Año", "Ha", "Pendientes", "Aprobados", "Rechazados", ""].map(h => (
                <th key={h} className="type-label" style={{ fontSize: "9px", color: "var(--muted)", textAlign: "left", padding: "0 12px 8px", fontWeight: 500 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={r.slug}
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td style={{ padding: "12px" }}>
                  <Link href={`/research/${r.slug}`} className="type-small hover:underline" style={{ color: "var(--foreground)", fontWeight: r.pending > 0 ? 500 : 400 }}>
                    {r.title}
                  </Link>
                </td>
                <td className="type-label" style={{ padding: "12px", fontSize: "10px", color: "var(--muted)" }}>{r.region}</td>
                <td className="type-data" style={{ padding: "12px", fontSize: "12px", color: "var(--muted)" }}>{r.year}</td>
                <td className="type-data" style={{ padding: "12px", fontSize: "12px", color: "var(--muted)" }}>{r.hectares.toLocaleString("es-ES", { maximumFractionDigits: 0 })}</td>
                <td style={{ padding: "12px" }}>
                  {r.pending > 0 ? (
                    <span className="type-data" style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 600 }}>{r.pending}</span>
                  ) : <span style={{ color: "var(--border)" }}>—</span>}
                </td>
                <td style={{ padding: "12px" }}>
                  {r.approved > 0 ? (
                    <span className="type-data" style={{ fontSize: 13, color: "#2D7A4A" }}>{r.approved}</span>
                  ) : <span style={{ color: "var(--border)" }}>—</span>}
                </td>
                <td style={{ padding: "12px" }}>
                  {r.rejected > 0 ? (
                    <span className="type-data" style={{ fontSize: 13, color: "var(--muted)" }}>{r.rejected}</span>
                  ) : <span style={{ color: "var(--border)" }}>—</span>}
                </td>
                <td style={{ padding: "12px" }}>
                  <Link
                    href={`/research/${r.slug}`}
                    className="type-label"
                    style={{ fontSize: "10px", color: "var(--accent)" }}
                  >
                    Revisar →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
