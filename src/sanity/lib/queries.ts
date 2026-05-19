import { groq } from "next-sanity";

// ── Case list (homepage map + grid) ──────────────────────────────────────────
export const allCasesQuery = groq`
  *[_type == "case" && hidden != true] | order(order asc, year asc) {
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
    coordinates,
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
    sources,
  }
`;

// ── All slugs (for generateStaticParams) ─────────────────────────────────────
export const allCaseSlugsQuery = groq`
  *[_type == "case" && hidden != true][].slug.current
`;
