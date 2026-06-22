/**
 * Timeline/judicial dates are free-form strings in Sanity ("1992-08-11",
 * "1992", "Agosto 1992"). Full dates are stored as ISO (YYYY-MM-DD) and
 * formatted for display here; anything else is shown verbatim.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** "1992-08-11" → "11/08/1992"; non-ISO strings pass through unchanged */
export function formatEventDate(raw?: string): string {
  if (!raw) return "";
  const m = raw.match(ISO_DATE);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
