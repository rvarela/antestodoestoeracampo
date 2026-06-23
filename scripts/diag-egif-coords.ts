#!/usr/bin/env tsx
/** Diagnostic: raw EGIF UTM for the mislocated fires + recompute per zone. */
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import proj4 from "proj4";

const FILES = [
  "scripts/data/Xlsx_20260519_115316_1 1(Informe).csv",
  "scripts/data/Xlsx_20260519_115316_2 1(Informe).csv",
  "scripts/data/Xlsx_20260519_115316_3(Informe).csv",
  "scripts/data/Xlsx_20260519_115316_4(Informe).csv",
  "scripts/data/Xlsx_20260519_115316_5(Informe).csv",
];
const REFS = new Set([
  "1998380039", "1998323245", "2005322927", "2005323138", "2005323140",
  "2005323468", "2005323785", "2005323463", "2005323144", "2005322969",
  "2005323099", "2005363510", "2003380026", "2003270322",
]);

function toWgs(x: number, y: number, zone: number, datum: string) {
  const ellps = datum.toUpperCase().includes("ED50") ? "intl +towgs84=-87,-98,-121,0,0,0,0" : "GRS80 +towgs84=0,0,0,0,0,0,0";
  const utm = `+proj=utm +zone=${zone} +ellps=${ellps} +units=m +no_defs`;
  const [lng, lat] = proj4(utm, "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs", [x, y]) as [number, number];
  return { lat, lng };
}

for (const f of FILES) {
  let rows: Record<string, string>[];
  try { rows = parse(readFileSync(f, "utf-8"), { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }); }
  catch (e) { console.error("parse fail", f, (e as Error).message); continue; }
  for (const r of rows) {
    const ref = r["NumeroParte"];
    if (!REFS.has(ref)) continue;
    const x = parseFloat(r["CoordenadaX"]), y = parseFloat(r["CoordenadaY"]);
    const huso = r["Huso"], datum = r["Datum"] ?? "ETRS89";
    console.log(`\n${ref}  ${r["Municipio"]} (${r["Provincia"]})  Huso=${huso || "—"} Datum=${datum}  X=${x} Y=${y}`);
    if (isNaN(x) || isNaN(y)) { console.log("  no UTM → would use geocode fallback"); continue; }
    for (const z of [28, 29, 30]) {
      try { const c = toWgs(x, y, z, datum); console.log(`  zone ${z}: ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`); } catch { /* */ }
    }
  }
}
