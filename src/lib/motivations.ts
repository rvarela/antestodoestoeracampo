/**
 * EGIF motivation codes for intentional fires (cause [400] Intencionado).
 *
 * EGIF codes each intentional fire with one of 31 motivations. `short` is our
 * editorial label (chips, filters, table cells); `official` is the EGIF text
 * (tooltips, methodology). Code 432 — fires set to force a land-use change —
 * is the platform's thesis, coded by the government itself.
 *
 * Caveat for all display copy: >76% of EGIF causes are "supuestas" (presumed
 * by the investigating agent, not judicially proven).
 */
export interface MotivationInfo {
  short: string;
  official: string;
}

export const LAND_USE_CODE = "432";

export const MOTIVATIONS: Record<string, MotivationInfo> = {
  "400": {
    short: "Desconocida",
    official: "Motivación desconocida",
  },
  "401": {
    short: "Quemas agrícolas",
    official:
      "Incendios causados por quemas realizadas en el desempeño de prácticas agrícolas que se dejan arder incontroladamente y pasan al monte o bien directamente son iniciados en terreno forestal.",
  },
  "402": {
    short: "Quemas ganaderas",
    official:
      "Incendios causados por quemas realizadas en el desempeño de prácticas ganaderas que se dejan arder incontroladamente y pasan al monte o bien directamente son iniciados en terreno forestal.",
  },
  "403": {
    short: "Control de fauna",
    official:
      "Incendios provocados en terrenos forestales para control de animales (conejos, lobos, jabalíes, plagas etc.) que causan daños en los cultivos, ganados, aprovechamientos forestales, etc.",
  },
  "404": {
    short: "Eliminar vegetación forestal",
    official:
      "Incendios provocados para eliminar vegetación de montes en explotaciones forestales (castañares, robledales, choperas, etc).",
  },
  "405": {
    short: "Limpieza tradicional del monte",
    official:
      "Incendios provocados para mantener libre de vegetación el monte, bajo un concepto tradicional del paisaje, sin pretender otro beneficio.",
  },
  "411": {
    short: "Favorecer la caza",
    official: "Incendios provocados para facilitar o favorecer la caza.",
  },
  "412": {
    short: "Conflictos cinegéticos",
    official: "Incendios provocados por conflictos cinegéticos.",
  },
  "431": {
    short: "Disputas de titularidad",
    official:
      "Incendios provocados por disensiones o disputas en cuanto a la titularidad de los montes públicos o privados.",
  },
  "432": {
    short: "Modificación del uso del suelo",
    official: "Incendios provocados para obtener la modificación del uso del suelo.",
  },
  "441": {
    short: "Precio de la madera",
    official: "Incendios provocados para hacer modificar el precio de la madera.",
  },
  "451": {
    short: "Alarma social",
    official: "Incendios provocados para crear malestar y alarma social.",
  },
  "452": {
    short: "Contra repoblaciones",
    official: "Incendios provocados por animadversión contra repoblaciones forestales.",
  },
  "453": {
    short: "Rechazo a espacios protegidos",
    official:
      "Incendios provocados por rechazo a la creación o existencia de Espacios Naturales Protegidos.",
  },
  "461": {
    short: "Represalia por inversiones",
    official:
      "Incendios provocados por represalia al reducirse las inversiones públicas en los montes.",
  },
  "463": {
    short: "Represalia por multas",
    official: "Incendios provocados como represalia por multas impuestas.",
  },
  "464": {
    short: "Venganzas",
    official: "Incendios provocados por venganzas.",
  },
  "471": {
    short: "Distraer a las fuerzas de seguridad",
    official: "Incendios provocados para distraer a la Guardia Civil o la Policía.",
  },
  "481": {
    short: "Contemplar la extinción",
    official: "Incendios provocados para contemplar las labores de extinción.",
  },
  "482": {
    short: "Vandalismo",
    official: "Incendios provocados por vandalismo (gamberradas, etc).",
  },
  "483": {
    short: "Piromanía",
    official: "Incendios provocados por enfermos mentales (pirómanos y otras).",
  },
  "499": {
    short: "Otras motivaciones conocidas",
    official: "Otras motivaciones (conocidas).",
  },
};

/** Short editorial label for a motivation code; falls back to the raw text. */
export function motivationShort(code: string | undefined, rawText?: string): string | null {
  if (code && MOTIVATIONS[code]) return MOTIVATIONS[code].short;
  return rawText?.trim() || null;
}
