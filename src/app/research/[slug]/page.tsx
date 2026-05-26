import { notFound } from "next/navigation";
import Link from "next/link";
import { client } from "@/sanity/lib/client";
import { LinkCard } from "./LinkCard";
import { PushButton } from "./PushButton";

export const revalidate = 0;

interface ResearchLink {
  _id: string;
  label: string;
  url: string;
  sourceType: string;
  note: string;
  status: "pending" | "approved" | "rejected";
}

interface CaseDoc {
  _id: string;
  title: string;
  municipality: string;
  region: string;
  year: number;
  hectares: number;
  status: string;
  sourcesCount: number;
}

export default async function ResearchCasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [caseDoc, links] = await Promise.all([
    client.fetch<CaseDoc | null>(
      `*[_type == "case" && slug.current == $slug][0]{
        _id, title, municipality, region, year, hectares, status,
        "sourcesCount": count(sources)
      }`,
      { slug }
    ),
    client.fetch<ResearchLink[]>(
      `*[_type == "researchLink" && caseSlug == $slug] | order(sourceType asc){
        _id, label, url, sourceType, note, status
      }`,
      { slug }
    ),
  ]);

  if (!caseDoc) notFound();

  const pending  = links.filter(l => l.status === "pending");
  const approved = links.filter(l => l.status === "approved");
  const rejected = links.filter(l => l.status === "rejected");

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--background)", fontFamily: "var(--font-inter), system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "20px 40px" }}>
        <Link
          href="/research"
          className="type-label"
          style={{ fontSize: "10px", color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 16 }}
        >
          ← Research Queue
        </Link>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div>
            <p className="type-label" style={{ color: "var(--muted)", fontSize: "10px", marginBottom: 6 }}>
              {caseDoc.region} · {caseDoc.year} · {caseDoc.hectares.toLocaleString("es-ES", { maximumFractionDigits: 0 })} ha
            </p>
            <h1 style={{ fontFamily: "var(--font-newsreader)", fontSize: 32, fontStyle: "italic", fontWeight: 400, color: "var(--foreground)", margin: 0 }}>
              {caseDoc.title}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center", flexShrink: 0 }}>
            <Stat label="pendientes" value={pending.length} color="var(--foreground)" />
            <Stat label="aprobados" value={approved.length} color="#166534" />
            <Stat label="rechazados" value={rejected.length} color="var(--muted)" />
            <Stat label="en caso" value={caseDoc.sourcesCount} color="var(--muted)" />
          </div>
        </div>

        {/* Push button */}
        {approved.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <PushButton slug={slug} approvedCount={approved.length} />
          </div>
        )}
      </div>

      {/* Links */}
      <div style={{ padding: "32px 40px", maxWidth: 900 }}>

        {links.length === 0 && (
          <div style={{ padding: "40px 0", color: "var(--muted)" }}>
            <p className="type-small">
              Sin enlaces generados para este caso. Ejecuta{" "}
              <code style={{ backgroundColor: "var(--border)", padding: "1px 6px", borderRadius: 3, fontSize: 12 }}>
                npm run research:seed -- --slug={slug}
              </code>
            </p>
          </div>
        )}

        {pending.length > 0 && (
          <Section title="Por revisar" count={pending.length}>
            {pending.map(l => <LinkCard key={l._id} id={l._id} label={l.label} url={l.url} sourceType={l.sourceType} note={l.note} status={l.status} />)}
          </Section>
        )}

        {approved.length > 0 && (
          <Section title="Aprobados" count={approved.length}>
            {approved.map(l => <LinkCard key={l._id} id={l._id} label={l.label} url={l.url} sourceType={l.sourceType} note={l.note} status={l.status} />)}
          </Section>
        )}

        {rejected.length > 0 && (
          <Section title="Rechazados" count={rejected.length}>
            {rejected.map(l => <LinkCard key={l._id} id={l._id} label={l.label} url={l.url} sourceType={l.sourceType} note={l.note} status={l.status} />)}
          </Section>
        )}
      </div>

      {/* Bottom actions */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "20px 40px", display: "flex", gap: 16, alignItems: "center" }}>
        <Link
          href={`/casos/${slug}`}
          target="_blank"
          className="type-label"
          style={{ fontSize: "10px", color: "var(--muted)" }}
        >
          Ver caso público →
        </Link>
        <Link
          href={`/studio/desk/case;${slug}`}
          target="_blank"
          className="type-label"
          style={{ fontSize: "10px", color: "var(--muted)" }}
        >
          Abrir en Studio →
        </Link>
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <p className="type-label" style={{ fontSize: "10px", color: "var(--muted)", marginBottom: 12 }}>
        {title.toUpperCase()} ({count})
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <span className="type-data" style={{ fontSize: 18, color }}>{value}</span>
      <p className="type-label" style={{ fontSize: "9px", color: "var(--muted)", margin: 0 }}>{label}</p>
    </div>
  );
}
