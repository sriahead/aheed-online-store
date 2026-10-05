import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * #729 R23 — shipped UI copy never names one vendor or assumes a product category.
 *
 * WHY THIS TEST EXISTS
 *
 * The platform is multi-tenant (ADR-004): Aheed sells groceries, SriMart sells electronics, and more
 * vendors are planned. #239 removed the header/hero copy that made SriMart advertise halal meat;
 * the same kind of literal then kept arriving in places #239 never looked at — "Aheed Club" in the
 * rewards panel, page titles naming Aheed, "2x chicken breast" as the shopping-list example,
 * "halal lamb" as a staff placeholder. Each was harmless to write and wrong on every other vendor.
 * This test pins the ones #729 removed so they cannot quietly come back.
 *
 * WHAT IT CHECKS
 *
 * Every `app/**\/*.tsx`, every `components/**\/*.tsx`, `lib/referrals.ts` and (#905) the four
 * lib modules whose strings reach a staff member or an AI prompt, with comments
 * removed by the TypeScript printer (not a regex, so a `//` inside a URL string cannot hide
 * anything). Comments are excluded on purpose: several quote the old copy as the record of why it
 * was removed. The generated `app/(admin)/staff/runbook/docs.ts` is a `.ts` file outside the glob,
 * and it quotes spec prose, including this slice's own.
 *
 * It is a denylist, so it catches regressions of THESE strings, not every possible grocery word.
 * New vendor-specific copy is still a review question; this only stops the known cases returning.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const FORBIDDEN = [
  "Aheed Club",
  "Aheed Food Centre Referral",
  "Aheed Store Delivery Pipeline",
  '— Aheed Food Centre"',
  "Aheed automatically",
  "Order groceries",
  "grocery order",
  "grocery basket",
  "grocery lists",
  "grocery vouchers",
  "grocery items",
  "grocery fulfillment",
  "grocery platform",
  "chicken breast",
  "“rice” or “atta”",
  "basmati-rice-5kg",
  "rice-grains",
  "weekly-meat-box",
  "halal lamb",
  "HMC Halal Fresh",
  "brands/shan",
  '"bhindi"',
  '"okra"',
  // #905 — the grocery framing the AI prompts assumed for every vendor, one town's postcodes as
  // every vendor's examples, and a fixed referral amount.
  "UK grocery",
  "South Asian grocery",
  "Milton Keynes",
  "MK1-MK10",
  "MK9 3QA",
  "£5 off",
];

function listTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsx(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const printer = ts.createPrinter({ removeComments: true });

/** The file's code with every comment removed, JSX text and string literals kept verbatim. */
function withoutComments(path: string): string {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return printer.printFile(source);
}

const FILES = [
  ...listTsx(join(ROOT, "app")),
  ...listTsx(join(ROOT, "components")),
  join(ROOT, "lib", "referrals.ts"),
  // #955 — the two SEO routes. Named explicitly because they are `.ts`, and `listTsx` only walks
  // `.tsx`: that gap is exactly how `app/robots.ts` carried
  // `const PRODUCTION_HOST = "aheedfoodcentre.nocaped.com"` — which de-indexed every vendor but
  // the first in production — while this guard stayed green. The glob is NOT widened to all `.ts`
  // under `app/`, because the generated `app/(admin)/staff/runbook/docs.ts` is deliberately
  // outside it (see the docstring above) and quotes spec prose, including this slice's own.
  join(ROOT, "app", "robots.ts"),
  join(ROOT, "app", "sitemap.ts"),
  // #905 — lib modules whose strings reach a staff member or a model.
  join(ROOT, "lib", "list-normalisation.ts"),
  join(ROOT, "lib", "search-synonym-proposals.ts"),
  join(ROOT, "lib", "net-content-suggester.ts"),
  join(ROOT, "lib", "delivery-area-form.ts"),
];

describe("vendor-neutral UI copy (#729)", () => {
  it("scans a real set of files", () => {
    // A glob that silently matched nothing would make every assertion below vacuous.
    expect(FILES.length).toBeGreaterThan(100);
  });

  /**
   * #955 — the two SEO routes carry no vendor hostname.
   *
   * A separate assertion rather than a `FORBIDDEN` entry, and that is deliberate: adding a bare
   * `nocaped.com` to the denylist would fail on `components/layout/StorefrontChrome.tsx`, which
   * still falls back to one vendor's staging host when a request carries no `Host` header. That is
   * a real defect — tracked as `#997`, and the prerequisite for making the denylist cover host
   * literals platform-wide — but it is referral behaviour, not crawlability, so it is out of this
   * slice's scope. Scoping the check to these two files protects what this slice fixed without
   * pretending the wider problem is solved.
   */
  it("the sitemap and robots routes contain no vendor hostname literal", () => {
    const hits: string[] = [];
    for (const file of [join(ROOT, "app", "robots.ts"), join(ROOT, "app", "sitemap.ts")]) {
      const code = withoutComments(file);
      if (/nocaped\.com/.test(code)) {
        hits.push(relative(ROOT, file).split(sep).join("/"));
      }
    }
    expect(hits).toEqual([]);
  });

  it("no shipped UI file contains a removed vendor- or grocery-specific literal", () => {
    const hits: string[] = [];
    for (const file of FILES) {
      const code = withoutComments(file);
      for (const literal of FORBIDDEN) {
        if (code.includes(literal))
          hits.push(`${relative(ROOT, file).split(sep).join("/")}: ${literal}`);
      }
    }
    expect(hits).toEqual([]);
    // #938 — parsing every file takes ~1.3s alone but overran Vitest's 5s default under full-suite
    // load on Windows. A longer timeout for this test only; the scan itself is deliberately unchanged.
  }, 30_000);
});
