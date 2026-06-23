import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import FadeIn from "@/components/FadeIn";
import { client } from "@/sanity/lib/client";
import { allCasesQuery } from "@/sanity/lib/queries";
import type { CaseSummary } from "@/types/case";

export const revalidate = 60;

export const metadata = {
  title: "Sobre el proyecto — antestodoestoeracampo.es",
  description:
    "Por qué existe esta base de datos pública de incendios intencionados y reclasificaciones de suelo en España, quién está detrás y cómo colaborar.",
};

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

export default async function SobrePage() {
  const cases = await client.fetch<CaseSummary[]>(allCasesQuery);
  const totalHa = Math.round(cases.reduce((s, c) => s + (c.hectares ?? 0), 0));

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
            Sobre el proyecto
          </p>
          <h1 className="type-h1 mb-6" style={{ color: "var(--foreground)" }}>
            «Antes todo esto era campo»
          </h1>
          <p className="type-body-lg max-w-2xl" style={{ color: "var(--muted)" }}>
            Es la frase que decimos, entre la ironía y la resignación, delante
            de una urbanización levantada donde hubo monte. Este proyecto la
            pronuncia un paso antes: delante de la ceniza.
          </p>
        </section>

        <Section label="La idea" title="El nombre">
          <p>
            En España hay un patrón documentado que se repite desde hace
            décadas: un incendio forestal arrasa un terreno de alto valor
            —costa, periferia turística, suelo codiciado—, pasan los años, el
            suelo se recalifica y aparece la construcción. Cada pieza del
            patrón deja rastro en un registro público distinto: el incendio en
            la estadística forestal, la recalificación en el catastro y los
            boletines, las conexiones en los nombramientos y las sentencias.
          </p>
          <p>
            Lo que casi nunca existe es el cruce. Esta base de datos junta esos
            rastros en un solo lugar, caso por caso, para que cualquiera pueda
            leerlos: {cases.length.toLocaleString("es-ES")} incendios
            intencionados documentados, {totalHa.toLocaleString("es-ES")}{" "}
            hectáreas calcinadas, y las modificaciones de suelo que vinieron
            después.
          </p>
        </Section>

        <Section label="El hueco" title="Por qué existe">
          <p>
            El 96% de los incendios forestales en España tiene origen humano.
            De los intencionados, menos de uno de cada diez incendiarios es
            identificado y condenado. Y cuando hay condena, casi nunca alcanza
            a quien se benefició del suelo después.
          </p>
          <p>
            El periodismo de datos español ha hecho investigaciones brillantes
            sobre piezas sueltas de este patrón —Civio sobre las sentencias, El
            Confidencial sobre casos concretos—, pero no existía una plataforma
            pública, sistemática y permanente que mantuviera el cruce abierto a
            todo el mundo. Esto no es un blog ni una serie de artículos: es una
            herramienta de consulta pública, con{" "}
            <Link href="/metodologia" className="underline underline-offset-2">
              metodología documentada
            </Link>{" "}
            y datos descargables.
          </p>
        </Section>

        <Section label="Independencia" title="Quién está detrás">
          <p>
            Este es un proyecto independiente, sin financiación externa, sin
            publicidad y sin fines comerciales. No pertenece a ningún medio,
            partido ni organización.
          </p>
          <p>
            No hace falta que confíes en quién está detrás: cada caso enlaza
            sus fuentes públicas —la estadística oficial de incendios (EGIF) y
            el Catastro— para que cualquiera pueda comprobarlo por su cuenta.
          </p>
          <p>
            Lo mantiene una sola persona, a título individual. Nació como un
            experimento personal de un diseñador para aprender a trabajar con
            herramientas de IA y, de paso, dejar algo útil. Ni más, ni menos:
            ninguna agenda más allá de hacer accesibles unos datos que ya son
            públicos. Si eso cambiara, se diría aquí.
          </p>
        </Section>

        <Section label="Aviso importante" title="Lo que esta base de datos no dice">
          <p>
            Que un incendio fuera intencionado y que años después se
            modificara la clasificación del suelo en la misma zona es una{" "}
            <strong>coincidencia documentada, no una acusación</strong>. Salvo
            en los casos con sentencia firme, nada de lo publicado aquí imputa
            a ninguna persona física o jurídica, y rige siempre la presunción
            de inocencia.
          </p>
          <p>
            Si apareces mencionado en esta base de datos y consideras que hay
            un error, escríbenos: revisaremos el caso contra las fuentes y
            corregiremos o retiraremos lo que no se sostenga. Las correcciones
            se publican de forma visible en el caso afectado.
          </p>
        </Section>

        <Section label="Colabora" title="Qué puedes hacer tú">
          <p>
            <strong>Si conoces un caso:</strong> la memoria local es la fuente
            que ningún registro tiene. Si sabes qué pasó con un terreno quemado
            de tu zona —quién lo compró, qué se construyó, qué se comentaba—,
            esa pista puede convertir una coincidencia estadística en un caso
            documentado.
          </p>
          <p>
            <strong>Si eres periodista:</strong> todos los datos son
            reutilizables citando la fuente — hay{" "}
            <Link href="/metodologia" className="underline underline-offset-2">
              API pública y exportaciones CSV/GeoJSON
            </Link>
            , y cada caso enlaza sus fuentes primarias para que puedas
            verificarlo y continuarlo.
          </p>
          <p>
            <strong>Si tienes documentación:</strong> sentencias, expedientes
            de recalificación, actas municipales, fotografías con fecha.
            Aceptamos documentación de forma confidencial.
          </p>
          <p style={{ color: "var(--muted)" }}>
            Estamos habilitando una dirección de contacto dedicada. Mientras
            tanto, todas las fuentes están enlazadas en cada caso y los datos
            completos pueden consultarse y descargarse desde{" "}
            <Link href="/metodologia" className="underline underline-offset-2">
              Metodología
            </Link>
            .
          </p>
        </Section>
      </main>
      <Footer />
    </>
  );
}
