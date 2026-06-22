import { groq } from "next-sanity";

// ── Case list (homepage map + grid) ──────────────────────────────────────────
export const allCasesQuery = groq`
  *[_type == "case" && hidden != true] | order(order asc, year asc, slug.current asc) {
    title,
    "slug": slug.current,
    region,
    municipality,
    year,
    hectares,
    urbanParcels,
    status,
    outcome,
    accentColor,
    excerpt,
    coordinates,
    coverImage,
  }
`;

// ── Single case page ─────────────────────────────────────────────────────────
export const caseBySlugQuery = groq`
  *[_type == "case" && slug.current == $slug && hidden != true][0] {
    title,
    "slug": slug.current,
    region,
    municipality,
    year,
    hectares,
    status,
    outcome,
    accentColor,
    excerpt,
    overview,
    coverImage,
    coordinates,
    timeline,
    connections,
    judicial,
    sources[]{ label, url, type, note },
  }
`;

// ── All slugs (for generateStaticParams) ─────────────────────────────────────
export const allCaseSlugsQuery = groq`
  *[_type == "case" && hidden != true][].slug.current
`;

// ── Approved search leads (públicas como "Búsquedas útiles" en el caso) ──────
export const approvedSearchLinksQuery = groq`
  *[_type == "researchLink" && caseSlug == $slug && status == "approved" && isSearch == true]
    | order(sourceType asc) { label, url, sourceType }
`;
