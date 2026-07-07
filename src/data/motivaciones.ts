/**
 * Motivaciones EGIF — incendios intencionados ≥100 ha (universo del seed).
 *
 * Generado desde los 5 CSV brutos del EGIF (1995–2022) con
 * `npm run patch:motivation -- --stats`. 2.600 incendios en total.
 * La motivación la registra el investigador del incendio; en la mayoría de
 * los casos la causa consta como «supuesta», no probada judicialmente.
 *
 * El código 432 («para obtener la modificación del uso del suelo») es el
 * patrón que documenta esta plataforma, codificado por la propia
 * administración. Civio contó 695 incendios con ese código a nivel nacional
 * en 1968–2017 (todos los tamaños).
 */
export interface MotivationStat {
  code: string;
  label: string;
  count: number;
  hectares: number;
}

export const MOTIVATION_UNIVERSE_TOTAL = 2600;

export const motivationStats: MotivationStat[] = [
  { code: "400", label: "Desconocida",                          count: 1041, hectares: 431508 },
  { code: "402", label: "Quemas ganaderas",                     count: 765,  hectares: 189010 },
  { code: "401", label: "Quemas agrícolas",                     count: 227,  hectares: 95052 },
  { code: "411", label: "Favorecer la caza",                    count: 136,  hectares: 49408 },
  { code: "483", label: "Piromanía",                            count: 120,  hectares: 91208 },
  { code: "499", label: "Otras motivaciones conocidas",         count: 67,   hectares: 57450 },
  { code: "464", label: "Venganzas",                            count: 66,   hectares: 40931 },
  { code: "482", label: "Vandalismo",                           count: 47,   hectares: 30247 },
  { code: "403", label: "Control de fauna",                     count: 36,   hectares: 11863 },
  { code: "412", label: "Conflictos cinegéticos",               count: 35,   hectares: 12437 },
  { code: "451", label: "Alarma social",                        count: 19,   hectares: 18877 },
  { code: "405", label: "Limpieza tradicional del monte",       count: 9,    hectares: 2221 },
  { code: "432", label: "Modificación del uso del suelo",       count: 6,    hectares: 1144 },
  { code: "453", label: "Rechazo a espacios protegidos",        count: 6,    hectares: 2142 },
  { code: "452", label: "Contra repoblaciones",                 count: 5,    hectares: 1273 },
  { code: "431", label: "Disputas de titularidad",              count: 3,    hectares: 650 },
  { code: "441", label: "Precio de la madera",                  count: 3,    hectares: 507 },
  { code: "463", label: "Represalia por multas",                count: 3,    hectares: 991 },
  { code: "461", label: "Represalia por inversiones",           count: 2,    hectares: 2880 },
  { code: "471", label: "Distraer a las fuerzas de seguridad",  count: 2,    hectares: 262 },
  { code: "404", label: "Eliminar vegetación forestal",         count: 1,    hectares: 164 },
  { code: "481", label: "Contemplar la extinción",              count: 1,    hectares: 132 },
];
