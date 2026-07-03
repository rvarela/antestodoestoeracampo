import { notFound } from "next/navigation";
import Link from "next/link";
import { PortableText } from "@portabletext/react";
import FadeIn from "@/components/FadeIn";
import BackLink from "@/components/BackLink";
import { client } from "@/sanity/lib/client";
import { caseBySlugQuery, allCaseSlugsQuery, approvedSearchLinksQuery } from "@/sanity/lib/queries";
import type { CaseDetail } from "@/types/case";
import CaseSearchLinks, { type SearchLink } from "@/components/caso/CaseSearchLinks";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import CaseHero from "@/components/caso/CaseHero";
import CaseTimeline from "@/components/caso/CaseTimeline";
import CaseConnections from "@/components/caso/CaseConnections";
import CaseJudicial from "@/components/caso/CaseJudicial";
import CaseSources from "@/components/caso/CaseSources";
import CaseCatastro from "@/components/caso/CaseCatastro";

export async function generateStaticParams() {
  const slugs: string[] = await client.fetch(allCaseSlugsQuery);
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const case_: CaseDetail | null = await client.fetch(caseBySlugQuery, { slug });
  if (!case_) return {};
  return {
    title: `${case_.title} · antestodoestoeracampo.es`,
    description: case_.excerpt,
  };
}

export default async function CasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [case_, searchLinks] = await Promise.all([
    client.fetch<CaseDetail | null>(caseBySlugQuery, { slug }),
    client.fetch<SearchLink[]>(approvedSearchLinksQuery, { slug }),
  ]);

  if (!case_) notFound();

  return (
    <>
      <Navigation />

      <main style={{ backgroundColor: "var(--background)" }}>
        {/* Full-bleed hero — sits behind the fixed nav */}
        <CaseHero case_={case_} />

        {/* Back link — below hero */}
        <div className="px-6 md:px-12 pt-8">
          <BackLink
            fallback="/casos"
            className="type-label inline-flex items-center gap-1 transition-colors"
            style={{ color: "var(--muted)", fontSize: "10px" }}
          >
            ← Todos los casos
          </BackLink>
        </div>

        {/* Overview — Portable Text */}
        {case_.overview && case_.overview.length > 0 && (
          <section
            className="px-6 md:px-12 py-10 md:py-12"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <p className="type-label mb-8" style={{ color: "var(--muted)" }}>
              El caso
            </p>
            <FadeIn>
              <div
                className="max-w-2xl"
                style={{
                  fontFamily: "var(--font-inter), system-ui, sans-serif",
                  fontSize: "18px",
                  lineHeight: "28px",
                  color: "var(--foreground)",
                }}
              >
                <PortableText
                  value={case_.overview}
                  components={{
                    block: {
                      normal: ({ children }) => (
                        <p className="mb-5 last:mb-0">{children}</p>
                      ),
                    },
                  }}
                />
              </div>
            </FadeIn>
          </section>
        )}

        {/* Timeline */}
        {case_.timeline && case_.timeline.length > 0 && (
          <CaseTimeline events={case_.timeline} accentColor={case_.accentColor} />
        )}

        {/* Catastro — modification histogram + flagged parcels */}
        {case_.catastroYears && case_.catastroYears.length > 0 && (
          <CaseCatastro
            years={case_.catastroYears}
            parcels={case_.catastroParcels ?? []}
            boxTotal={case_.catastroBoxTotal}
            boxUrban={case_.catastroBoxUrban}
            fireYear={case_.year}
            urbanParcels={case_.urbanParcels}
            catastroSignal={case_.catastroSignal}
          />
        )}

        {/* Political connections */}
        {case_.connections && case_.connections.length > 0 && (
          <CaseConnections connections={case_.connections} />
        )}

        {/* Judicial */}
        {case_.judicial && case_.judicial.length > 0 && (
          <CaseJudicial events={case_.judicial} />
        )}

        {/* Sources */}
        {case_.sources && case_.sources.length > 0 && (
          <CaseSources sources={case_.sources} />
        )}

        {/* Approved search leads */}
        {searchLinks.length > 0 && <CaseSearchLinks links={searchLinks} />}

        {/* Open data — per-case export */}
        <section
          className="px-6 md:px-12 py-8"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <p className="type-label mb-3" style={{ color: "var(--muted)" }}>
            Datos abiertos
          </p>
          <p className="type-small flex flex-wrap items-center gap-x-2" style={{ color: "var(--muted)" }}>
            Descarga los datos de este caso:
            <a
              href={`/api/casos/${case_.slug}`}
              className="type-data text-[12px] underline underline-offset-2"
              style={{ color: "var(--accent)" }}
            >
              JSON
            </a>
            ·
            <a
              href={`/api/casos/${case_.slug}?format=csv`}
              className="type-data text-[12px] underline underline-offset-2"
              style={{ color: "var(--accent)" }}
            >
              CSV
            </a>
            <span>
              — cita <Link href="/metodologia" className="underline underline-offset-2">antestodoestoeracampo.es</Link> como fuente.
            </span>
          </p>
        </section>

        {/* Bottom nav */}
        <div
          className="px-6 md:px-12 py-12 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <BackLink
            fallback="/casos"
            className="type-small transition-colors"
            style={{ color: "var(--muted)" }}
          >
            ← Volver a todos los casos
          </BackLink>
        </div>
      </main>

      <Footer />
    </>
  );
}
