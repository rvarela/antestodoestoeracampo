#!/usr/bin/env tsx
/**
 * query-cendoj.ts — ad-hoc CENDOJ full-text query (read-only, nothing written).
 *
 * Reuses the polite request pattern from harvest-cendoj.ts for one-off
 * editorial checks (e.g. "did the STSJ rule on the appeal of SAP X?").
 *
 * Usage (env var beats PowerShell 5.1 arg mangling; `||` separates queries,
 * all run in ONE session with polite sleeps — CENDOJ soft-blocks bursts of
 * fresh sessions, serving empty results for a cooldown period):
 *   $env:CENDOJ_TEXT = '"incendio forestal" "Encinedo" || "incendio" "La Baña"'
 *   npx tsx scripts/query-cendoj.ts [--n=20]
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&ntilde;/gi, "ñ")
    .replace(/&Aacute;/g, "Á").replace(/&Eacute;/g, "É").replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó").replace(/&Uacute;/g, "Ú").replace(/&Ntilde;/g, "Ñ")
    .replace(/&nbsp;/g, " ");
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith("--"))
      .map(a => {
        const [k, ...v] = a.slice(2).split("=");
        return [k, v.length ? v.join("=") : "true"];
      })
  );
  // CENDOJ_TEXT env var wins — PowerShell 5.1 mangles quoted/accented args
  const raw = process.env.CENDOJ_TEXT ?? args["text"];
  // CENDOJ only accepts specific page sizes — anything else (e.g. 15) gets
  // «La búsqueda no es válida!» on every query. Snap to the nearest valid one.
  const VALID_N = [10, 20, 50];
  const wanted = args["n"] ? parseInt(args["n"]) : 20;
  const n = VALID_N.reduce((a, b) => (Math.abs(b - wanted) < Math.abs(a - wanted) ? b : a));
  if (n !== wanted) console.log(`(--n=${wanted} no es un tamaño de página válido en CENDOJ — usando ${n})`);
  if (!raw) {
    console.error(`Usage: $env:CENDOJ_TEXT='"incendio forestal" "Municipio"'; npx tsx scripts/query-cendoj.ts [--n=20]`);
    process.exit(1);
  }
  const queries = raw.split("||").map(q => q.trim()).filter(Boolean);

  const sessionRes = await fetch("https://www.poderjudicial.es/search/indexAN.jsp", {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(30_000),
  });
  const cookie = (sessionRes.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).join("; ");

  for (const [qi, text] of queries.entries()) {
    if (qi > 0) await new Promise(r => setTimeout(r, 3000));

    const body = new URLSearchParams({
      action: "query",
      sort: "IN_FECHARESOLUCION:decreasing",
      recordsPerPage: String(n),
      databasematch: "AN",
      start: "1",
      TEXT: text,
    });
    const res = await fetch("https://www.poderjudicial.es/search/search.action", {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Accept": "*/*",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://www.poderjudicial.es/search/indexAN.jsp",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Cookie": cookie,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok) throw new Error(`CENDOJ HTTP ${res.status}`);
    const html = await res.text();
    if (html.includes("captcha") || html.includes("CAPTCHA")) throw new Error("CENDOJ served a CAPTCHA — back off");

    const total = html.match(/(\d[\d.]*)\s*resultados/i)?.[1] ?? "?";
    console.log(`\nQuery: ${text}`);
    console.log(`Resultados (total en CENDOJ): ${total} — mostrando hasta ${n}, más recientes primero\n`);

    const chunks = html.split('<div class="title">').slice(1);
    let i = 0;
    for (const chunk of chunks) {
      const url = chunk.match(/data-link="(https:\/\/www\.poderjudicial\.es\/search\/AN\/openDocument\/[a-f0-9]+\/\d+)"/)?.[1];
      if (!url) continue;
      const textBlock = decodeEntities(chunk.slice(0, 8000).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      const title = textBlock.match(/^(.{10,180}?ROJ:\s*[A-Z]+(?: [A-Z]+)? \d+\/\d+)/)?.[1] ?? textBlock.slice(0, 140);
      const ecli = chunk.match(/ECLI:[A-Z]{2}:[A-Z0-9]+:\d{4}:\d+/)?.[0] ?? null;
      const resumen =
        textBlock.match(/RESUMEN:\s*(.+?)\s*(?:Resoluciones del Caso|Legislación|$)/)?.[1]?.slice(0, 300) ?? null;
      i++;
      console.log(`${String(i).padStart(2)}. ${title}`);
      if (ecli) console.log(`    ${ecli}`);
      if (resumen) console.log(`    RESUMEN: ${resumen}`);
      console.log(`    ${url}\n`);
    }
    if (i === 0) {
      const plain = decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      console.log(`(sin resultados) — respuesta: ${plain.slice(0, 200) || "(vacía)"}\n`);
    }
  }
}

main().catch(err => {
  console.error("\nFatal:", err);
  process.exit(1);
});
