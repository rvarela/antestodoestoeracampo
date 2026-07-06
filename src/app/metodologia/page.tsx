import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import FadeIn from "@/components/FadeIn";
import { client } from "@/sanity/lib/client";
import { allCasesQuery } from "@/sanity/lib/queries";
import type { CaseSummary } from "@/types/case";

export const revalidate = 60;

export const metadata = {
  title: "Metodología — antestodoestoeracampo.es",
  description:
    "Cómo se construye esta base de datos: registros EGIF de incendios intencionados, análisis de modificaciones catastrales posteriores y verificación documental.",
};

const SOURCES = [
  {
    name: "EGIF — Estadística General de Incendios Forestales",
    org: "MITECO",
    use: "Registro nacional de partes de incendio: fecha, municipio, superficie, causa y motivación.",
    url: "https://www.miteco.gob.es/es/biodiversidad/temas/incendios-forestales.html",
  },
  {
    name: "Catastro INSPIRE (WFS de parcelas catastrales)",
    org: "Dirección General del Catastro",
    use: "Parcelas en el área de cada incendio: clasificación de suelo y fecha de última modificación registrada.",
    url: "https://www.catastro.hacienda.gob.es/webinspire/index.html",
  },
  {
    name: "Registro de Penados (tabla 25997)",
    org: "INE",
    use: "Condenados por delitos de incendio, para la tasa de condena en /datos.",
    url: "https://www.ine.es/jaxiT3/Tabla.htm?t=25997",
  },
  {
    name: "España en llamas",
    org: "Civio",
    use: "Investigación de referencia sobre grandes incendios (también sobre datos EGIF) y su base propia de sentencias 2007–2013: condenas, absoluciones y causas archivadas.",
    url: "https://civio.es/espana-en-llamas/",
  },
];

const ENDPOINTS = [
  { path: "/api/casos", desc: "todos los casos publicados (JSON)" },
  { path: "/api/casos?format=csv", desc: "el mismo listado en CSV" },
  { path: "/api/casos?format=geojson", desc: "GeoJSON para herramientas de mapas" },
  { path: "/api/casos/{slug}", desc: "un caso completo: cronología, conexiones, judicial y fuentes (JSON)" },
  { path: "/api/casos/{slug}?format=csv", desc: "el mismo caso en CSV plano" },
];

function Section({
  label,
  title,
  id,
  children,
}: {
  label: string;
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="px-6 md:px-12 max-w-4xl mx-auto py-14 scroll-mt-20"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <p className="type-label mb-4" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <h2 className="type-h2 mb-8" style={{ color: "var(--foreground)" }}>
        {title}
      </h2>
      <FadeIn>
        <div
          className="max-w-2xl flex flex-col gap-5"
          style={{
            fontFamily: "var(--font-inter), system-ui, sans-serif",
            fontSize: "17px",
            lineHeight: "27px",
            color: "var(--foreground)",
          }}
        >
          {children}
        </div>
      </FadeIn>
    </section>
  );
}

export default async function MetodologiaPage() {
  const cases = await client.fetch<CaseSummary[]>(allCasesQuery);

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
            Metodología · {cases.length} casos publicados
          </p>
          <h1 className="type-h1 mb-6" style={{ color: "var(--foreground)" }}>
            Cómo se construye esta base de datos
          </h1>
          <p className="type-body-lg max-w-2xl" style={{ color: "var(--muted)" }}>
            Cada caso cruza dos registros públicos: el parte oficial del incendio
            y las modificaciones catastrales registradas en los años posteriores
            sobre el mismo terreno. Esta página explica de dónde salen los datos,
            qué significan y, sobre todo, qué no significan.
          </p>
        </section>

        <Section label="Paso 1 · Los incendios" title="De dónde salen los casos">
          <p>
            La base de partida es la Estadística General de Incendios Forestales
            (EGIF) del Ministerio para la Transición Ecológica: el registro
            oficial de cada parte de incendio en España, con más de 130 campos
            por siniestro. De ese registro seleccionamos los incendios cuya
            causa figura como <em>intencionado</em> (código 400) y cuya
            superficie forestal calcinada supera las 100 hectáreas, entre 1995
            y 2022.
          </p>
          <p>
            Cada caso conserva la referencia de su parte EGIF (visible en la
            cronología y en la URL), de modo que cualquier dato puede
            contrastarse con el registro oficial. Las coordenadas provienen de
            las UTM del parte; cuando el parte no las incluye, usamos el
            centroide del municipio, lo que significa que algunos puntos del
            mapa marcan el municipio y no el perímetro exacto del fuego.
          </p>
          <p>
            Los incendios que cruzan límites provinciales generan un parte por
            provincia; esos fragmentos se fusionan en un único caso con la
            superficie total para no contar el mismo fuego dos veces.
          </p>
        </Section>

        <Section label="Paso 2 · El catastro" title="El análisis de modificaciones catastrales">
          <p>
            Para cada incendio consultamos el servicio público INSPIRE del
            Catastro y recuperamos las parcelas en un radio alrededor del punto
            del incendio. De cada parcela nos interesan dos datos: su
            clasificación de suelo y la fecha de su última modificación
            registrada.
          </p>
          <p>
            Señalamos como relevantes las parcelas modificadas entre 1 y 15
            años después del fuego, y dentro de ellas contamos las clasificadas
            como suelo urbano. Ese número es la cifra de{" "}
            <em>parcelas urbanas modificadas</em> que aparece en cada caso y en
            el archivo.
          </p>
          <p style={{ color: "var(--muted)" }}>
            Tres límites importantes. Primero: una modificación catastral no es
            necesariamente una recalificación urbanística — puede deberse a
            regularizaciones, segregaciones o correcciones administrativas.
            Segundo: en zonas de parcelario muy denso la consulta usa un radio
            menor, así que las cifras de parcelas no son directamente
            comparables entre casos. Tercero: que el análisis no detecte
            modificaciones no significa que no las haya — desarrollos fuera del
            radio analizado o cambios de titularidad no aparecen en esta señal.
          </p>
        </Section>

        <Section label="Paso 3 · Verificación" title="Lo que esta base de datos afirma — y lo que no">
          <p>
            La coincidencia entre un incendio intencionado y modificaciones
            catastrales posteriores es una <strong>señal estadística</strong>,
            no una prueba de causalidad ni una imputación. Los casos publicados
            son puntos de partida para investigación periodística: cada uno
            enlaza sus fuentes (parte EGIF, consulta catastral, hemerotecas,
            boletines oficiales y, donde existen, sentencias).
          </p>
          <p>
            Las fuentes encontradas de forma automatizada se marcan como
            pendientes de verificación editorial hasta que se contrastan
            manualmente. Solo los casos con sentencia firme documentada —como
            Terra Mítica— afirman una conexión probada judicialmente.
          </p>
        </Section>

        <Section label="Datos abiertos" title="Reutiliza los datos">
          <p>
            Todo el contenido publicado puede descargarse y reutilizarse
            citando <strong>antestodoestoeracampo.es</strong> como fuente:
          </p>
          <ul className="flex flex-col gap-2">
            {ENDPOINTS.map((e) => (
              <li key={e.path}>
                <span
                  className="type-data text-[13px] px-1.5 py-0.5 rounded-sm"
                  style={{ backgroundColor: "var(--surface)", color: "var(--accent)" }}
                >
                  {e.path}
                </span>{" "}
                <span className="type-small" style={{ color: "var(--muted)" }}>
                  — {e.desc}
                </span>
              </li>
            ))}
          </ul>
          <p className="type-small" style={{ color: "var(--muted)" }}>
            El archivo de <a href="/casos" className="underline underline-offset-2">/casos</a> permite
            además exportar a CSV cualquier vista filtrada, y cada página de
            caso ofrece su descarga individual.
          </p>
        </Section>

        <Section id="fuentes" label="Fuentes" title="Registros públicos utilizados">
          <ul className="flex flex-col gap-6">
            {SOURCES.map((s) => (
              <li key={s.name}>
                <p style={{ color: "var(--foreground)" }}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    {s.name}
                  </a>{" "}
                  <span className="type-label" style={{ color: "var(--muted)", fontSize: "10px" }}>
                    {s.org}
                  </span>
                </p>
                <p className="type-small mt-1" style={{ color: "var(--muted)" }}>
                  {s.use}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      </main>
      <Footer />
    </>
  );
}
