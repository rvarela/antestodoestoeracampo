import type { PortableTextBlock } from "@portabletext/react";

export type CaseStatus =
  | "Sentencia firme"
  | "En investigación"
  | "Archivado"
  | "Sobreseído";

export type EventType =
  | "fire"
  | "purchase"
  | "rezoning"
  | "permit"
  | "construction"
  | "judicial"
  | "political"
  | "other";

export type JudicialResult = "convicted" | "acquitted" | "pending" | "archived";

export type SourceType = "EGIF" | "Catastro" | "BOE" | "Sentencia" | "Prensa" | "Otro";

export interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
  type: EventType;
}

export interface PoliticalConnection {
  name: string;
  role: string;
  party?: string;
  connection: string;
}

export interface JudicialEvent {
  court: string;
  date: string;
  result: JudicialResult;
  description: string;
}

export interface Source {
  label: string;
  url?: string;
  type: SourceType;
  note?: string;
}

// Lean version for list/map
export interface CaseSummary {
  title: string;
  slug: string;
  region: string;
  municipality: string;
  year: number;
  hectares: number;
  status: CaseStatus;
  outcome: string;
  accentColor: string;
  excerpt: string;
  coordinates?: { lat: number; lng: number };
  coverImage?: { asset: { _ref: string }; alt?: string };
}

// Full version for case page
export interface CaseDetail extends CaseSummary {
  overview?: PortableTextBlock[];
  coverImage?: { asset: { _ref: string }; alt?: string };
  timeline?: TimelineEvent[];
  connections?: PoliticalConnection[];
  judicial?: JudicialEvent[];
  sources?: Source[];
}
