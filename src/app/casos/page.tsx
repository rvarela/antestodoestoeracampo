import { Suspense } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import CasosArchive from "@/components/CasosArchive";
import { client } from "@/sanity/lib/client";
import { allCasesQuery } from "@/sanity/lib/queries";
import type { CaseSummary } from "@/types/case";

export const revalidate = 60;

export const metadata = {
  title: "Casos — antestodoestoeracampo.es",
  description:
    "Archivo completo de casos documentados: incendios forestales seguidos de modificaciones catastrales en España. Filtrable y exportable.",
};

export default async function CasosPage() {
  const cases = await client.fetch<CaseSummary[]>(allCasesQuery);

  return (
    <>
      <Navigation />
      <main>
        {/* Hero */}
        <section
          className="pt-32 pb-12 px-6 md:px-12 max-w-6xl mx-auto"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <p className="type-label mb-6" style={{ color: "var(--muted)" }}>
            Archivo · {cases.length} casos documentados
          </p>
          <h1 className="type-h1 mb-6" style={{ color: "var(--foreground)" }}>
            Todos los casos
          </h1>
          <p className="type-body-lg max-w-2xl" style={{ color: "var(--muted)" }}>
            El registro completo: cada incendio documentado, su superficie, las
            modificaciones catastrales detectadas después y su estado judicial.
            Filtra, ordena y exporta los datos — los enlaces con filtros se
            pueden compartir.
          </p>
        </section>

        {/* Archive */}
        <section className="px-6 md:px-12 max-w-6xl mx-auto py-12">
          <Suspense fallback={null}>
            <CasosArchive cases={cases} />
          </Suspense>
        </section>
      </main>
      <Footer />
    </>
  );
}
