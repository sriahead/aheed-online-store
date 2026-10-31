import { readFileSync } from "node:fs";

/**
 * Prove that no 3D icon escapes the circular frame on a rendered page (#1288 R28).
 *
 * `npx tsx scripts/verify-medallion-markup.ts <page.html>`
 *
 * Every `Icon3D` root carries `data-icon3d`, and every `IconMedallion` root carries `data-medallion`.
 * The page passes (exit 0) when it has at least one medallion and every `[data-icon3d]` element sits
 * inside one; otherwise it exits 1 and names the offending icons. Fetch the page yourself (curl with the
 * vendor's `Host` header, `docs/developer-portal/local-dev-playbook.md`) so one script serves both
 * vendors and any environment.
 */

export interface MedallionReport {
  medallions: number;
  /** `data-icon3d` values found outside any `[data-medallion]`, in document order. */
  escaped: string[];
}

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);
const TAG_RE =
  /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

/**
 * A dependency-free walk over the page's tags with an open-element stack: enough to answer "is this
 * element inside a `[data-medallion]`" for server-rendered HTML. Comments, scripts and styles are skipped.
 */
export function checkMedallionMarkup(html: string): MedallionReport {
  const stack: { tag: string; medallion: boolean }[] = [];
  const escaped: string[] = [];
  let medallions = 0;
  for (const match of html.matchAll(TAG_RE)) {
    const [, , closing, rawTag, attributes = ""] = match;
    if (!rawTag) continue;
    const tag = rawTag.toLowerCase();
    if (closing) {
      const index = stack.map((open) => open.tag).lastIndexOf(tag);
      if (index !== -1) stack.length = index;
      continue;
    }
    const isMedallion = /(?:^|\s)data-medallion(?:[\s=>/]|$)/.test(attributes);
    if (isMedallion) medallions++;
    const icon3d = attributes.match(/(?:^|\s)data-icon3d="([^"]*)"/);
    if (icon3d && !isMedallion && !stack.some((open) => open.medallion)) {
      escaped.push(icon3d[1] || "(unnamed)");
    }
    if (!VOID_ELEMENTS.has(tag) && !/\/\s*$/.test(attributes)) {
      stack.push({ tag, medallion: isMedallion });
    }
  }
  return { medallions, escaped };
}

function main(): number {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: npx tsx scripts/verify-medallion-markup.ts <page.html>");
    return 1;
  }
  const report = checkMedallionMarkup(readFileSync(path, "utf8"));
  console.log(`medallions: ${report.medallions}, escaped 3D icons: ${report.escaped.length}`);
  if (report.medallions === 0) {
    console.error("FAIL: no [data-medallion] element on the page");
    return 1;
  }
  if (report.escaped.length > 0) {
    console.error(`FAIL: 3D icons outside a medallion: ${report.escaped.join(", ")}`);
    return 1;
  }
  console.log("PASS");
  return 0;
}

if (process.argv[1] && /verify-medallion-markup/.test(process.argv[1])) {
  process.exit(main());
}
