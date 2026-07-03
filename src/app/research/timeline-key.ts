/** Deterministic timeline _key for a research link, so re-pushing replaces the entry. */
export function timelineKeyForLink(linkId: string): string {
  return `research-${linkId.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
}
