// Tasa de condena por incendio intencionado, 2013–2022.
//
// - intentionalFires: partes EGIF con causa "[400] Intencionado" por año
//   (recuento propio sobre los CSV EGIF/MITECO, todos los incendios, sin filtro de superficie).
// - convictions: adultos condenados por delitos de incendio (arts. 351–358 CP),
//   INE — Estadística de condenados: adultos, tabla 25997 ("Delitos según tipo"),
//   consultada 2026-06-11 vía API Tempus.
//
// Cautela metodológica: las condenas se contabilizan en el año de la sentencia,
// no en el del incendio, e incluyen todos los delitos de incendio (no solo el
// forestal). La serie se muestra como orden de magnitud, no como seguimiento
// causal de cada incendio.

export interface JusticiaYear {
  year: number;
  intentionalFires: number;
  convictions: number;
}

export const convictionRateByYear: JusticiaYear[] = [
  { year: 2013, intentionalFires: 5580, convictions: 220 },
  { year: 2014, intentionalFires: 4732, convictions: 234 },
  { year: 2015, intentionalFires: 6380, convictions: 269 },
  { year: 2016, intentionalFires: 4778, convictions: 271 },
  { year: 2017, intentionalFires: 8226, convictions: 275 },
  { year: 2018, intentionalFires: 3842, convictions: 236 },
  { year: 2019, intentionalFires: 5840, convictions: 254 },
  { year: 2020, intentionalFires: 4277, convictions: 168 },
  { year: 2021, intentionalFires: 4310, convictions: 205 },
  { year: 2022, intentionalFires: 4141, convictions: 181 },
];
