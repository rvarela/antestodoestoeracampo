import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import DatosCharts from "@/components/DatosCharts";
import { client } from "@/sanity/lib/client";
import { allCasesQuery } from "@/sanity/lib/queries";
import type { CaseSummary } from "@/types/case";

export const revalidate = 60;

export const metadata = {
  title: "Datos — antestodoestoeracampo.es",
  description: "Datos sobre incendios forestales, reclasificaciones catastrales y condenas en España.",
};

// Static editorial stats from EGIF / Civio
const STATS = [
  {
    value: "96%",
    label: "incendios de origen humano",
    source: "EGIF / MITECO",
  },
  {
    value: "82,6%",
    label: "de la superficie calcinada 2001–2010 fue por fuegos intencionados",
    source: "EGIF / MITECO",
  },
  {
    value: "~9%",
    label: "de los incendiarios identificados y condenados",
    source: "Estimación EGIF",
  },
  {
    value: "561",
    label: "condenas de 760 sentencias entre 2007 y 2012",
    source: "Civio",
  },
];

export default async function DatosPage() {
  const cases = await client.fetch<CaseSummary[]>(allCasesQuery);
  const totalHa = cases.reduce((s, c) => s + (c.hectares ?? 0), 0);

  return (
    <>
      <Navigation />
      <main>

        {/* Hero */}
        <section
          className="pt-32 pb-16 px-6 md:px-12 max-w-4xl mx-auto"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <p className="type-label mb-6" style={{ color: "var(--muted)" }}>
            Base de datos · {cases.length} casos documentados
          </p>
          <h1 className="type-h1 mb-6" style={{ color: "var(--foreground)" }}>
            Los números del fuego
          </h1>
          <p className="type-body-lg max-w-2xl" style={{ color: "var(--muted)" }}>
            En España, el 96% de los incendios forestales tienen origen humano.
            De ellos, menos del 9% acaban en condena. Esta base de datos cruza
            registros de incendios, datos del Catastro y documentación judicial
            para mostrar el patrón: fuego, reclasificación, construcción.
          </p>
        </section>

        {/* Editorial stats strip */}
        <section
          className="px-6 md:px-12 max-w-4xl mx-auto py-16"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <p className="type-label mb-8" style={{ color: "var(--muted)" }}>
            Contexto nacional · datos EGIF y Civio
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((s) => (
              <div key={s.value}>
                <p className="type-data-lg mb-2" style={{ color: "var(--accent)" }}>
                  {s.value}
                </p>
                <p className="type-small mb-3" style={{ color: "var(--foreground)" }}>
                  {s.label}
                </p>
                <p className="type-label" style={{ color: "var(--muted)" }}>
                  {s.source}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Summary row for this dataset */}
        <section
          className="px-6 md:px-12 max-w-4xl mx-auto py-12"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <p className="type-label mb-6" style={{ color: "var(--muted)" }}>
            Esta base de datos
          </p>
          <div className="flex flex-wrap gap-12">
            <div>
              <p className="type-data-lg" style={{ color: "var(--foreground)" }}>
                {cases.length}
              </p>
              <p className="type-small mt-1" style={{ color: "var(--muted)" }}>
                casos publicados
              </p>
            </div>
            <div>
              <p className="type-data-lg" style={{ color: "var(--foreground)" }}>
                {(totalHa / 1000).toFixed(0)}k
              </p>
              <p className="type-small mt-1" style={{ color: "var(--muted)" }}>
                hectáreas calcinadas
              </p>
            </div>
            <div>
              <p className="type-data-lg" style={{ color: "var(--foreground)" }}>
                {new Set(cases.map(c => c.region)).size}
              </p>
              <p className="type-small mt-1" style={{ color: "var(--muted)" }}>
                comunidades autónomas
              </p>
            </div>
            <div>
              <p className="type-data-lg" style={{ color: "var(--foreground)" }}>
                {cases.filter(c => c.status === "Sentencia firme").length}
              </p>
              <p className="type-small mt-1" style={{ color: "var(--muted)" }}>
                casos con sentencia firme
              </p>
            </div>
          </div>
        </section>

        {/* D3 charts */}
        <div className="pt-16">
          <DatosCharts cases={cases} />
        </div>

      </main>
      <Footer />
    </>
  );
}
