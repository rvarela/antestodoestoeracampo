export type CaseStatus =
  | "Sentencia firme"
  | "En investigación"
  | "Archivado"
  | "Sobreseído";

export type CaseRegion =
  | "Andalucía"
  | "Comunidad Valenciana"
  | "Galicia"
  | "Cataluña"
  | "Murcia"
  | "Canarias"
  | "Madrid";

export interface Case {
  slug: string;
  title: string;
  region: CaseRegion;
  municipality: string;
  year: number;
  hectares: number;
  status: CaseStatus;
  outcome: string;
  excerpt: string;
  accentColor: string;
  coordinates: [number, number]; // [lng, lat] for Mapbox
}

export const CASES: Case[] = [
  {
    slug: "terra-mitica-benidorm",
    title: "Terra Mítica",
    region: "Comunidad Valenciana",
    municipality: "Benidorm, Alicante",
    year: 1992,
    hectares: 1050,
    status: "Sentencia firme",
    outcome: "Parque temático construido",
    excerpt:
      "Un incendio en la pinada protegida del Moralet abrió paso al mayor parque temático de España. Seis años después, el terreno fue recalificado pese a la Ley Forestal. Condenados el excuñado de Eduardo Zaplana y veinte empresarios.",
    accentColor: "#C4622D",
    coordinates: [-0.1327, 38.5348],
  },
];

export const FILTERS = [
  "Todos",
  "Andalucía",
  "Comunidad Valenciana",
  "Galicia",
  "Cataluña",
  "Sentencia firme",
] as const;

export type Filter = (typeof FILTERS)[number];
