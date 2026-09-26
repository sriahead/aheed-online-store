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
  });
});
