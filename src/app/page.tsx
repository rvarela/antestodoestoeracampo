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

  return (
    <>
      <Navigation />
      <MapHero cases={cases} />
      <StatsStrip />
      <CasesSection cases={cases} />
      <Footer />
    </>
  );
}
