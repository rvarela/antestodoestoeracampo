import Navigation from "@/components/Navigation";
import MapHero from "@/components/MapHero";
import StatsStrip from "@/components/StatsStrip";
import CasesSection from "@/components/CasesSection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navigation />
      <MapHero />
      <StatsStrip />
      <CasesSection />
      <Footer />
    </>
  );
}
