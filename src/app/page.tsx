import Navigation from "@/components/Navigation";
import MapHero from "@/components/MapHero";
import StatsStrip from "@/components/StatsStrip";
import CasesSection from "@/components/CasesSection";
import Footer from "@/components/Footer";
import { client } from "@/sanity/lib/client";
import { allCasesQuery } from "@/sanity/lib/queries";
import type { CaseSummary } from "@/types/case";

export const revalidate = 60;

export default async function Home() {
  const cases = await client.fetch<CaseSummary[]>(allCasesQuery);

  const totalHa = cases.reduce((sum, c) => sum + (c.hectares ?? 0), 0);
  const formattedHa = totalHa >= 1000
    ? `${Math.round(totalHa / 1000)}k`
    : String(Math.round(totalHa));

  return (
    <>
      <Navigation />
      <MapHero cases={cases} />
      <StatsStrip caseCount={cases.length} totalHectares={formattedHa} />
      <CasesSection cases={cases} />
      <Footer />
    </>
  );
}
