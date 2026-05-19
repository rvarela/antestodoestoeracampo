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
  {
    slug: "monteferro-nigran",
    title: "Monteferro",
    region: "Galicia",
    municipality: "Nigrán, Vigo",
    year: 2006,
    hectares: 340,
    status: "En investigación",
    outcome: "Urbanización costera proyectada",
    excerpt:
      "La presión urbanística sobre el litoral atlántico tiene en Monteferro uno de sus casos más documentados. El Concello de Nigrán impulsó la recalificación tras el incendio que arrasó el monte.",
    accentColor: "#8B6914",
    coordinates: [-8.8342, 42.1162],
  },
  {
    slug: "sierra-calderona-valencia",
    title: "Sierra Calderona",
    region: "Comunidad Valenciana",
    municipality: "Valencia / Castellón",
    year: 2012,
    hectares: 4662,
    status: "Archivado",
    outcome: "Recalificación parcial aprobada",
    excerpt:
      "El mayor incendio de la historia reciente de la Comunidad Valenciana arrasó más de cuatro mil hectáreas en pleno parque natural. El expediente judicial fue archivado sin imputados.",
    accentColor: "#7A5230",
    coordinates: [-0.5134, 39.7322],
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
