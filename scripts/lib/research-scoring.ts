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

// INE province code (digits 5–6 of the EGIF ref embedded in every slug,
// e.g. quiroga-2006-2006__27__0737 → 27 = Lugo) → province + CCAA.
const INE_PROVINCE: Record<string, { name: string; ccaa: string }> = {
  "01": { name: "alava", ccaa: "País Vasco" },
  "02": { name: "albacete", ccaa: "Castilla-La Mancha" },
  "03": { name: "alicante", ccaa: "Comunidad Valenciana" },
  "04": { name: "almeria", ccaa: "Andalucía" },
  "05": { name: "avila", ccaa: "Castilla y León" },
  "06": { name: "badajoz", ccaa: "Extremadura" },
  "07": { name: "baleares", ccaa: "Baleares" },
  "08": { name: "barcelona", ccaa: "Cataluña" },
  "09": { name: "burgos", ccaa: "Castilla y León" },
  "10": { name: "caceres", ccaa: "Extremadura" },
  "11": { name: "cadiz", ccaa: "Andalucía" },
  "12": { name: "castellon", ccaa: "Comunidad Valenciana" },
  "13": { name: "ciudad real", ccaa: "Castilla-La Mancha" },
  "14": { name: "cordoba", ccaa: "Andalucía" },
  "15": { name: "a coruna", ccaa: "Galicia" },
  "16": { name: "cuenca", ccaa: "Castilla-La Mancha" },
  "17": { name: "girona", ccaa: "Cataluña" },
  "18": { name: "granada", ccaa: "Andalucía" },
  "19": { name: "guadalajara", ccaa: "Castilla-La Mancha" },
  "20": { name: "gipuzkoa", ccaa: "País Vasco" },
  "21": { name: "huelva", ccaa: "Andalucía" },
  "22": { name: "huesca", ccaa: "Aragón" },
  "23": { name: "jaen", ccaa: "Andalucía" },
  "24": { name: "leon", ccaa: "Castilla y León" },
  "25": { name: "lleida", ccaa: "Cataluña" },
  "26": { name: "la rioja", ccaa: "La Rioja" },
  "27": { name: "lugo", ccaa: "Galicia" },
  "28": { name: "madrid", ccaa: "Madrid" },
  "29": { name: "malaga", ccaa: "Andalucía" },
  "30": { name: "murcia", ccaa: "Murcia" },
  "31": { name: "navarra", ccaa: "Navarra" },
  "32": { name: "ourense", ccaa: "Galicia" },
  "33": { name: "asturias", ccaa: "Asturias" },
  "34": { name: "palencia", ccaa: "Castilla y León" },
  "35": { name: "las palmas", ccaa: "Canarias" },
  "36": { name: "pontevedra", ccaa: "Galicia" },
  "37": { name: "salamanca", ccaa: "Castilla y León" },
  "38": { name: "santa cruz de tenerife", ccaa: "Canarias" },
  "39": { name: "cantabria", ccaa: "Cantabria" },
  "40": { name: "segovia", ccaa: "Castilla y León" },
  "41": { name: "sevilla", ccaa: "Andalucía" },
  "42": { name: "soria", ccaa: "Castilla y León" },
  "43": { name: "tarragona", ccaa: "Cataluña" },
  "44": { name: "teruel", ccaa: "Aragón" },
  "45": { name: "toledo", ccaa: "Castilla-La Mancha" },
  "46": { name: "valencia", ccaa: "Comunidad Valenciana" },
  "47": { name: "valladolid", ccaa: "Castilla y León" },
  "48": { name: "bizkaia", ccaa: "País Vasco" },
  "49": { name: "zamora", ccaa: "Castilla y León" },
  "50": { name: "zaragoza", ccaa: "Aragón" },
  "51": { name: "ceuta", ccaa: "Ceuta" },
  "52": { name: "melilla", ccaa: "Melilla" },
};

/**
 * Case's province from the EGIF ref in its slug. Only trusted when its CCAA
 * agrees with the case's `region` — retitled cross-border fragments (OTRA
 * PROVINCIA) keep the filing province in the slug but a corrected region.
 */
export function provinceFromSlug(slug: string | null, region: string | null): string | null {
  const m = (slug ?? "").match(/-((?:19|20)\d{2})(\d{2})\d+$/);
  if (!m) return null;
  const prov = INE_PROVINCE[m[2]];
  if (!prov) return null;
  if (region && prov.ccaa !== region) return null;
  return prov.name;
}

// Judicial seat (normalize()d) → province name, for province-bound órganos
// (SAP/AAP/SJP/SJCA/SJPI…). Most seats are the province itself.
const SEAT_TO_PROVINCE: Record<string, string> = {
  "oviedo": "asturias", "gijon": "asturias",
  "santander": "cantabria",
  "merida": "badajoz",
  "vigo": "pontevedra", "santiago de compostela": "a coruna",
  "coruna": "a coruna", "la coruna": "a coruna",
  "orense": "ourense",
  "gerona": "girona", "lerida": "lleida",
  "bilbao": "bizkaia", "vizcaya": "bizkaia",
  "vitoria": "alava", "araba": "alava",
  "donostia": "gipuzkoa", "san sebastian": "gipuzkoa", "guipuzcoa": "gipuzkoa",
  "logrono": "la rioja",
  "pamplona": "navarra",
  "palma": "baleares", "palma de mallorca": "baleares", "illes balears": "baleares",
  "tenerife": "santa cruz de tenerife",
};

function seatProvince(seat: string): string | null {
  const n = normalize(seat);
  if (SEAT_TO_PROVINCE[n]) return SEAT_TO_PROVINCE[n];
  // most provincial seats are named after the province itself
  return Object.values(INE_PROVINCE).some(p => p.name === n) ? n : null;
}

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

// Órganos with truly national scope — no territory check. The Audiencia
// Nacional is national too but never tries forest fires (terrorism /
// macro-crime), so it gets its own hard penalty below.
const SUPREME_ORGANS = new Set(["STS", "ATS", "STC", "ATC"]);
const AN_ORGANS = new Set(["SAN", "AAN"]);

function parseOrgano(title: string): { organo: string; seat: string | null } | null {
  const withSeat = title.trim().match(/^([A-Z]{2,5})\s+([^,]+?),\s*a\s+\d/);
  if (withSeat) return { organo: withSeat[1], seat: withSeat[2].trim() };
  const bare = title.trim().match(/^([A-Z]{2,5}),?\s*a\s+\d/);
  return bare ? { organo: bare[1], seat: null } : null;
}

export interface CendojScore {
  confidence: number;
  /** human-readable warning for the note (⚠ …), null when nothing is suspicious */
  flag: string | null;
}

export interface CendojHitMeta {
  title: string;
  resolYear: number | null;
  isSentencia: boolean;
  /** "Sala de lo X" text if present in the search result metadata */
  sala?: string | null;
  /** CENDOJ's official one-line RESUMEN if present */
  resumen?: string | null;
}

// A resumen mentioning none of these is about something else entirely
// (the query matched a surname + an incidental "incendio forestal").
const RESUMEN_RELEVANT =
  /incendi|forestal|urbanis|urbanistic|recalificac|prevaricac|suelo|medio ambiente|montes/;

export function cendojConfidence(
  hit: CendojHitMeta,
  fireYear: number,
  region: string | null,
  slug: string | null = null
): CendojScore {
  const parsed = parseOrgano(hit.title);

  // Wrong jurisdiction: these can never be a forest-fire prosecution.
  const sala = normalize(hit.sala ?? "");
  if (/militar|social/.test(sala)) {
    return { confidence: 15, flag: `Sala de lo ${hit.sala} — jurisdicción ajena a incendios forestales` };
  }
  if (parsed && AN_ORGANS.has(parsed.organo)) {
    return { confidence: 15, flag: "Audiencia Nacional — no enjuicia incendios forestales" };
  }

  // Territory: fires are tried where they happen. Province-level check for
  // provincial órganos (case province from the EGIF ref in the slug), CCAA
  // fallback when either side is unresolvable.
  if (parsed && parsed.seat && !SUPREME_ORGANS.has(parsed.organo)) {
    const caseProv = provinceFromSlug(slug, region);
    const courtProv = parsed.organo === "STSJ" || parsed.organo === "ATSJ" ? null : seatProvince(parsed.seat);
    if (courtProv && caseProv) {
      if (courtProv !== caseProv) {
        return { confidence: 15, flag: `Órgano de ${titleCaseEs(courtProv)}; incendio en ${titleCaseEs(caseProv)} — probable municipio homónimo` };
      }
    } else {
      const courtCcaa = TERRITORY_TO_CCAA[normalize(parsed.seat)] ?? null;
      if (courtCcaa && region && courtCcaa !== region) {
        return { confidence: 15, flag: `Órgano de ${courtCcaa}; incendio en ${region} — probable municipio homónimo` };
      }
    }
  }

  if (hit.resolYear !== null && hit.resolYear < fireYear) {
    return { confidence: 15, flag: "Resolución anterior al incendio — otro incendio" };
  }

  let c = 45;
  if (hit.resolYear !== null && hit.resolYear >= fireYear && hit.resolYear <= fireYear + 18) c += 25;
  if (hit.isSentencia) c += 10;

  // CENDOJ's own summary says what the ruling is about — the strongest
  // signal against surname false-positives.
  if (hit.resumen) {
    const r = normalize(hit.resumen);
    if (!RESUMEN_RELEVANT.test(r)) {
      return { confidence: 30, flag: "Resumen CENDOJ sin relación aparente con incendios" };
    }
    if (/incendi/.test(r)) c += 5;
  }

  return { confidence: Math.min(c, 85), flag: null }; // headline-level heuristic, never a verified match
}

export function cendojRelevanceLabel(c: number): string {
  return c >= 70 ? "probable" : c >= 45 ? "posible" : "dudosa";
}

export function cendojNote(
  score: CendojScore,
  resolYear: number | null,
  fireYear: number,
  resumen: string | null = null
): string {
  let n = `Cosecha CENDOJ («incendio forestal» + municipio) · relevancia ${cendojRelevanceLabel(score.confidence)} · resolución ${resolYear ?? "?"}, incendio ${fireYear}.`;
  if (resumen) n += ` Resumen CENDOJ: «${resumen}».`;
  if (score.flag) n += ` ⚠ ${score.flag}.`;
  n += ` Comprobar que la resolución corresponde a este incendio.`;
  return n;
}

/** Recover the stored resumen from a note written by cendojNote (for rescoring). */
export function resumenFromNote(note: string | null): string | null {
  return (note ?? "").match(/Resumen CENDOJ: «([^»]+)»/)?.[1] ?? null;
}

/** Recover the sala from a harvester-written flag (only source of sala when rescoring). */
export function salaFromNote(note: string | null): string | null {
  return (note ?? "").match(/⚠ Sala de lo (\p{L}+)/u)?.[1] ?? null;
}
