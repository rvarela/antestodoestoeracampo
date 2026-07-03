/**
 * research-scoring.ts
 *
 * Shared relevance heuristics for the research harvesters (Google News RSS,
 * CENDOJ) and for rescore-research-links.ts. Scoring lives here so the
 * harvest-time score and any later rescore can never drift apart.
 *
 * Key insight (2026-07-03): Google News RSS only surfaces *recent* articles,
 * so for old fires everything harvested is modern coverage — usually of a NEW
 * fire in the same municipality. Breaking-news vocabulary ("declarado",
 * "estabilizado", "obliga a cortar…") years after the case's fire is a strong
 * negative signal; legitimate late coverage is judicial / urbanism /
 * retrospective. Same idea for CENDOJ: criminal fire cases are tried in the
 * fire's own province, so a resolución from another CCAA is almost certainly
 * a homonymous municipality.
 */

export function normalize(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function titleCaseEs(s: string) {
  const minor = new Set(["de", "del", "la", "las", "el", "los", "y", "a", "en"]);
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && minor.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** EGIF files articles as suffix ("VICTORIA DE ACENTEJO, LA") — restore natural order */
export function naturalMunicipality(raw: string) {
  const m = raw.trim().match(/^(.+?),\s*(la|el|los|las|l')$/i);
  const reordered = m ? `${m[2]} ${m[1]}` : raw;
  return titleCaseEs(reordered);
}

// ── Google News scoring ───────────────────────────────────────────────────────

// Headlines written while a fire is burning. Published >1 year after the
// case's fire, these describe a *different* fire in the same municipality.
const BREAKING_NEWS =
  /\bdeclarad[oa]\b|\bestabilizad[oa]\b|\bcontrolad[oa]\b|\bextinguid[oa]\b|\bactivo\b|desaloj|evacuad|obliga a cortar|corta la|cortar la|trabajan en|medios aereos|tras quemar|sigue quemando|arrasa|nivel [012]\b/;

// The legitimate reasons a fire keeps making headlines years later.
const LATE_COVERAGE =
  /condena|juicio|sentencia|absuel|detenid|acusad|investiga|urbaniz|recalific|pgou|plan parcial|suelo|aniversario|anos despues|se cumplen|regenera|recupera|reconstru/;

export interface NewsScore {
  score: number;
  /** breaking-news headline years after the case's fire → almost certainly another fire */
  otherFire: boolean;
}

export function scoreNewsItem(
  title: string,
  pubYear: number | null,
  municipality: string,
  fireYear: number
): NewsScore {
  const t = normalize(title);
  let s = 0;
  let otherFire = false;

  if (t.includes(normalize(municipality))) s += 2;
  if (t.includes("incendio")) s += 1;
  if (/urbaniz|recalific|pgou|plan parcial|suelo/.test(t)) s += 2; // the pattern itself
  if (/intencionado|provocado|detenid|condena|juicio|investiga/.test(t)) s += 1;
  const mentionsFireYear = t.includes(String(fireYear));
  if (mentionsFireYear) s += 1; // headline names the fire's year — retrospective about THIS fire

  if (pubYear !== null) {
    const delta = pubYear - fireYear;
    if (delta >= 0 && delta <= 1) {
      s += 2; // contemporary coverage — almost certainly this fire
    } else {
      // Late (or pre-fire) coverage: only judicial/urbanism/retrospective
      // framing keeps it plausible.
      if (delta < 0 || delta > 15) s -= 3;
      else if (!LATE_COVERAGE.test(t) && !mentionsFireYear) s -= 2;
      if (delta > 1 && BREAKING_NEWS.test(t)) {
        s -= 3;
        otherFire = true;
      }
    }
  }

  return { score: s, otherFire };
}

export function newsRelevanceLabel(s: number): string {
  return s >= 4 ? "probable" : s >= 2 ? "posible" : "dudosa";
}

// Score (clamped 0–7) → calibrated confidence %. Capped at 95 — it's a
// heuristic over a headline, never a verified match.
const CONFIDENCE = [10, 25, 40, 55, 70, 80, 90, 95];
export function newsConfidencePct(s: number): number {
  return CONFIDENCE[Math.max(0, Math.min(s, CONFIDENCE.length - 1))];
}

export function newsNote(
  score: NewsScore,
  publisher: string,
  pubYear: number | null,
  fireYear: number
): string {
  let n = `Cosecha automática (Google News) · relevancia ${newsRelevanceLabel(score.score)} · ${publisher}${pubYear ? ` · ${pubYear}` : ""}`;
  if (score.otherFire) {
    n += ` · ⚠ Titular de última hora de ${pubYear} — probablemente OTRO incendio en el municipio (el del caso es de ${fireYear})`;
  }
  return n;
}

// ── CENDOJ scoring ────────────────────────────────────────────────────────────

// Province / judicial seat → CCAA, keyed on normalize()d name. Matches the
// `region` values used on case docs in Sanity.
const TERRITORY_TO_CCAA: Record<string, string> = {
  // Andalucía
  "almeria": "Andalucía", "cadiz": "Andalucía", "cordoba": "Andalucía",
  "granada": "Andalucía", "huelva": "Andalucía", "jaen": "Andalucía",
  "malaga": "Andalucía", "sevilla": "Andalucía", "andalucia": "Andalucía",
  // Aragón
  "huesca": "Aragón", "teruel": "Aragón", "zaragoza": "Aragón", "aragon": "Aragón",
  // Asturias
  "asturias": "Asturias", "oviedo": "Asturias", "gijon": "Asturias",
  // Baleares
  "baleares": "Baleares", "illes balears": "Baleares", "islas baleares": "Baleares",
  "palma": "Baleares", "palma de mallorca": "Baleares",
  // Canarias
  "las palmas": "Canarias", "las palmas de gran canaria": "Canarias",
  "santa cruz de tenerife": "Canarias", "tenerife": "Canarias", "canarias": "Canarias",
  // Cantabria
  "cantabria": "Cantabria", "santander": "Cantabria",
  // Castilla-La Mancha
  "albacete": "Castilla-La Mancha", "ciudad real": "Castilla-La Mancha",
  "cuenca": "Castilla-La Mancha", "guadalajara": "Castilla-La Mancha",
  "toledo": "Castilla-La Mancha", "castilla-la mancha": "Castilla-La Mancha",
  "castilla la mancha": "Castilla-La Mancha",
  // Castilla y León
  "avila": "Castilla y León", "burgos": "Castilla y León", "leon": "Castilla y León",
  "palencia": "Castilla y León", "salamanca": "Castilla y León",
  "segovia": "Castilla y León", "soria": "Castilla y León",
  "valladolid": "Castilla y León", "zamora": "Castilla y León",
  "castilla y leon": "Castilla y León",
  // Cataluña
  "barcelona": "Cataluña", "girona": "Cataluña", "gerona": "Cataluña",
  "lleida": "Cataluña", "lerida": "Cataluña", "tarragona": "Cataluña",
  "cataluna": "Cataluña", "catalunya": "Cataluña",
  // Comunidad Valenciana
  "alicante": "Comunidad Valenciana", "castellon": "Comunidad Valenciana",
  "valencia": "Comunidad Valenciana", "comunidad valenciana": "Comunidad Valenciana",
  // Extremadura
  "badajoz": "Extremadura", "caceres": "Extremadura", "merida": "Extremadura",
  "extremadura": "Extremadura",
  // Galicia
  "a coruna": "Galicia", "coruna": "Galicia", "la coruna": "Galicia",
  "lugo": "Galicia", "ourense": "Galicia", "orense": "Galicia",
  "pontevedra": "Galicia", "vigo": "Galicia", "santiago de compostela": "Galicia",
  "galicia": "Galicia",
  // uniprovinciales / resto
  "la rioja": "La Rioja", "logrono": "La Rioja",
  "madrid": "Madrid",
  "murcia": "Murcia",
  "navarra": "Navarra", "pamplona": "Navarra",
  "alava": "País Vasco", "araba": "País Vasco", "bizkaia": "País Vasco",
  "vizcaya": "País Vasco", "gipuzkoa": "País Vasco", "guipuzcoa": "País Vasco",
  "bilbao": "País Vasco", "vitoria": "País Vasco", "donostia": "País Vasco",
  "san sebastian": "País Vasco", "pais vasco": "País Vasco",
  "ceuta": "Ceuta", "melilla": "Melilla",
};

// Órganos with national jurisdiction — territory check does not apply.
const NATIONAL_ORGANS = new Set(["STS", "ATS", "SAN", "AAN", "STC", "ATC"]);

/**
 * Extract the court's CCAA from a CENDOJ result title like
 * "SAP Cantabria, a 03 de marzo de 2020 - ROJ: SAP S 950/2020".
 * Returns null when the órgano is national or the seat is unrecognised.
 */
export function cendojTerritory(title: string): string | null {
  const m = title.trim().match(/^([A-Z]{2,5})\s+([^,]+?),\s*a\s+\d/);
  if (!m) return null;
  if (NATIONAL_ORGANS.has(m[1])) return null;
  return TERRITORY_TO_CCAA[normalize(m[2].trim())] ?? null;
}

export interface CendojScore {
  confidence: number;
  /** court sits in a different CCAA than the fire → probable homonymous municipality */
  territoryMismatch: boolean;
  territory: string | null;
}

export function cendojConfidence(
  hit: { title: string; resolYear: number | null; isSentencia: boolean },
  fireYear: number,
  region: string | null
): CendojScore {
  const territory = cendojTerritory(hit.title);
  const territoryMismatch = !!(territory && region && territory !== region);
  if (territoryMismatch) return { confidence: 15, territoryMismatch, territory };
  if (hit.resolYear !== null && hit.resolYear < fireYear) {
    return { confidence: 15, territoryMismatch: false, territory }; // earlier fire
  }
  let c = 45;
  if (hit.resolYear !== null && hit.resolYear >= fireYear && hit.resolYear <= fireYear + 18) c += 25;
  if (hit.isSentencia) c += 10;
  return { confidence: Math.min(c, 85), territoryMismatch: false, territory };
}

export function cendojRelevanceLabel(c: number): string {
  return c >= 70 ? "probable" : c >= 45 ? "posible" : "dudosa";
}

export function cendojNote(
  score: CendojScore,
  resolYear: number | null,
  fireYear: number,
  region: string | null
): string {
  let n = `Cosecha CENDOJ («incendio forestal» + municipio) · relevancia ${cendojRelevanceLabel(score.confidence)} · resolución ${resolYear ?? "?"}, incendio ${fireYear}.`;
  if (score.territoryMismatch) {
    n += ` ⚠ Órgano de ${score.territory}, incendio en ${region} — probablemente un municipio homónimo.`;
  }
  n += ` Comprobar que la resolución corresponde a este incendio.`;
  return n;
}
