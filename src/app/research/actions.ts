"use server";

import { createClient } from "@sanity/client";
import { timelineKeyForLink } from "./timeline-key";

function serverClient() {
  return createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: (process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production").replace(/["']/g, ""),
    token: process.env.SANITY_WRITE_TOKEN!,
    apiVersion: "2026-05-19",
    useCdn: false,
  });
}

export async function setLinkStatus(linkId: string, status: "approved" | "rejected" | "pending") {
  await serverClient().patch(linkId).set({ status }).commit();
}

export async function pushApprovedLinks(caseSlug: string) {
  const client = serverClient();

  // Fetch the case document
  const caseDoc = await client.fetch<{
    _id: string;
    sources?: Array<{ _key: string; label: string; type: string; url?: string; note?: string }>;
  }>(
    `*[_type == "case" && slug.current == $slug][0]{ _id, sources[]{ _key, label, type, url, note } }`,
    { slug: caseSlug }
  );

  if (!caseDoc) throw new Error(`Case not found: ${caseSlug}`);

  // Fetch approved links for this case
  const allApproved = await client.fetch<Array<{
    _id: string;
    label: string;
    url: string;
    sourceType: string;
    note: string;
    isSearch?: boolean;
  }>>(
    `*[_type == "researchLink" && caseSlug == $slug && status == "approved"]{ _id, label, url, sourceType, note, isSearch }`,
    { slug: caseSlug }
  );

  // Search leads (results pages) never become public *sources* — approved ones
  // publish separately as "Búsquedas útiles" on the case page (live query,
  // no push needed). Only specific documents/articles go through here.
  const approved = allApproved.filter(l => !l.isSearch);
  const skippedSearches = allApproved.length - approved.length;

  if (approved.length === 0) return { pushed: 0, skippedSearches };

  // Map sourceType → Sanity source type value
  const typeMap: Record<string, string> = {
    CENDOJ: "Sentencia",
    BOE: "BOE",
    CCAA: "BOE",
    ElPais: "Prensa",
    ElMundo: "Prensa",
    ABC: "Prensa",
    Prensa: "Prensa",
    Catastro: "Catastro",
    Maps: "Otro",
    Otro: "Otro",
  };

  // Only add links not already in sources (match by URL)
  const existingUrls = new Set((caseDoc.sources ?? []).map(s => s.url).filter(Boolean));

  const newSources = approved
    .filter(l => !existingUrls.has(l.url))
    .map(l => ({
      _key: `rl-${l._id.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`,
      label: l.label,
      url: l.url,
      type: typeMap[l.sourceType] ?? "Otro",
      note: "Aprobado mediante herramienta de investigación — verificar relevancia antes de publicar.",
    }));

  if (newSources.length === 0) return { pushed: 0, alreadyPresent: approved.length, skippedSearches };

  const allSources = [...(caseDoc.sources ?? []), ...newSources];
  await client.patch(caseDoc._id).set({ sources: allSources }).commit();

  // Mark pushed links as "pushed" (we keep status approved but could track this)
  return { pushed: newSources.length, skippedSearches };
}

interface TimelineEntry {
  _key: string;
  date?: string;
  title?: string;
  description?: string;
  type?: string;
}

export async function pushLinkToTimeline(
  linkId: string,
  data: { date: string; type: string; title: string; description: string }
) {
  const client = serverClient();

  const date = data.date.trim();
  const title = data.title.trim();
  if (!date || !title) {
    return { ok: false as const, error: "Fecha y título son obligatorios." };
  }

  const link = await client.fetch<{ caseSlug: string } | null>(
    `*[_type == "researchLink" && _id == $id][0]{ caseSlug }`,
    { id: linkId }
  );
  if (!link) return { ok: false as const, error: "Enlace no encontrado." };

  // Full timeline — never write back a projected fetch (see Conventions)
  const caseDoc = await client.fetch<{ _id: string; timeline?: TimelineEntry[] } | null>(
    `*[_type == "case" && slug.current == $slug][0]{ _id, timeline }`,
    { slug: link.caseSlug }
  );
  if (!caseDoc) return { ok: false as const, error: `Caso no encontrado: ${link.caseSlug}` };

  const entry: TimelineEntry = {
    _key: timelineKeyForLink(linkId),
    date,
    title,
    description: data.description.trim(),
    type: data.type || "other",
  };

  // Replace an earlier push of the same link, then insert chronologically:
  // before the first entry with a strictly later sortable date (ties and
  // free-text dates keep their position — CaseTimeline renders array order).
  const timeline = (caseDoc.timeline ?? []).filter(e => e._key !== entry._key);
  const sortable = (d?: string) => (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(d ?? "") ? d! : null);
  const d = sortable(entry.date);
  let idx = timeline.length;
  if (d) {
    for (let i = 0; i < timeline.length; i++) {
      const ed = sortable(timeline[i].date);
      if (ed && ed > d) { idx = i; break; }
    }
  }
  timeline.splice(idx, 0, entry);

  await client.patch(caseDoc._id).set({ timeline }).commit();
  return { ok: true as const };
}

export async function addManualLink(
  caseSlug: string,
  data: { label: string; url: string; sourceType: string }
) {
  const client = serverClient();

  const label = data.label.trim();
  const url = data.url.trim();
  if (!label || !/^https?:\/\//.test(url)) {
    return { ok: false as const, error: "Etiqueta y URL (http/https) son obligatorias." };
  }

  const caseId = await client.fetch<string | null>(
    `*[_type == "case" && slug.current == $slug][0]._id`,
    { slug: caseSlug }
  );
  if (!caseId) return { ok: false as const, error: `Caso no encontrado: ${caseSlug}` };

  // Deterministic id from the URL so re-adding the same result is a no-op
  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  const id = `rl-${caseSlug}-manual-${hash.toString(36)}`;

  await client.createOrReplace({
    _type: "researchLink",
    _id: id,
    case: { _type: "reference", _ref: caseId },
    caseSlug,
    label,
    url,
    sourceType: data.sourceType || "Otro",
    isSearch: false,
    status: "approved",
    confidence: 100,
    note: "Resultado añadido manualmente desde la herramienta de investigación.",
  });

  return { ok: true as const };
}
