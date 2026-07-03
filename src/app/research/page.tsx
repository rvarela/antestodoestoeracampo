import { client as cdnClient } from "@/sanity/lib/client";
import { QueueTable, type QueueRow } from "./QueueTable";

// Internal editorial tool — always read fresh so approvals/pushes reflect immediately
const client = cdnClient.withConfig({ useCdn: false });

export const revalidate = 0;

export default async function ResearchPage() {
  // Fetch all researchLink documents grouped by case
  const links = await client.fetch<Array<{
    caseSlug: string;
    status: string;
    confidence?: number;
    isSearch?: boolean;
  }>>(`*[_type == "researchLink"]{ caseSlug, status, confidence, isSearch }`);

  // Fetch published cases
  const cases = await client.fetch<Array<{
    slug: string;
    title: string;
    region: string;
    year: number;
    hectares: number;
    catastroSignal?: number;
  }>>(`*[_type == "case" && hidden == false] | order(hectares desc){
    "slug": slug.current, title, region, year, hectares, catastroSignal
  }`);

  // Aggregate link counts + best pending-document confidence per case
  const counts: Record<string, { pending: number; approved: number; rejected: number; maxConf: number | null }> = {};
  for (const l of links) {
    if (!counts[l.caseSlug]) counts[l.caseSlug] = { pending: 0, approved: 0, rejected: 0, maxConf: null };
    const s = l.status as "pending" | "approved" | "rejected";
    if (counts[l.caseSlug][s] !== undefined) counts[l.caseSlug][s]++;
    if (s === "pending" && !l.isSearch && typeof l.confidence === "number") {
      const cur = counts[l.caseSlug].maxConf;
      if (cur === null || l.confidence > cur) counts[l.caseSlug].maxConf = l.confidence;
    }
  }

  const rows: QueueRow[] = cases.map(c => ({
    slug: c.slug,
    title: c.title,
    region: c.region,
    year: c.year,
    hectares: c.hectares,
    signal: c.catastroSignal ?? null,
    maxConf: counts[c.slug]?.maxConf ?? null,
    pending:  counts[c.slug]?.pending  ?? 0,
    approved: counts[c.slug]?.approved ?? 0,
    rejected: counts[c.slug]?.rejected ?? 0,
  }));

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

      {/* Table — sortable by any column; default: best pending lead first */}
      <div style={{ padding: "0 40px 60px" }}>
        <QueueTable rows={rows} />
      </div>
    </div>
  );
}
