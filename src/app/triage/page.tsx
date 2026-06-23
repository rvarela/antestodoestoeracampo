import { client as cdnClient } from "@/sanity/lib/client";
import triage from "@/data/triage-thin.json";
import TriageReview from "./TriageReview";

// Internal editorial tool — always read fresh so hide/restore reflect immediately
const client = cdnClient.withConfig({ useCdn: false });

export const revalidate = 0;

export interface TriageCase {
  slug: string;
  title: string;
  region: string;
  year: number;
  hectares: number;
  lat: number | null;
  lng: number | null;
  urbanParcels: number;
  urbanPct: number;
  spikePct: number;
  winUrban: number;
  spreadYears: number;
  signal: number;
  bucket: "A" | "B" | "C";
  hidden: boolean;
}

export default async function TriagePage() {
  const cases = (triage.cases as Omit<TriageCase, "hidden">[]);

  // Current hidden state from Sanity, so already-actioned cases reflect it
  const hiddenSlugs = new Set(
    await client.fetch<string[]>(
      `*[_type == "case" && hidden == true && slug.current in $slugs].slug.current`,
      { slugs: cases.map((c) => c.slug) }
    )
  );

  const rows: TriageCase[] = cases.map((c) => ({ ...c, hidden: hiddenSlugs.has(c.slug) }));

  return (
    <TriageReview
      cases={rows}
      counts={triage.counts as Record<string, number>}
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ""}
    />
  );
}
