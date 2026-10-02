import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * #962 — every product listing renders through `ProductGrid`, so the three pages cannot drift apart
 * again and the odd 3-column step cannot come back by copy-paste. File reads, no rendering: the
 * property being guarded is "no call site writes its own grid columns", which is a fact about
 * source text.
 */
const LISTING_PAGES = [
  "app/(storefront)/categories/[slug]/page.tsx",
  "app/(storefront)/search/page.tsx",
  "app/(storefront)/bundles/page.tsx",
];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("product listings render through ProductGrid (#962)", () => {
  it.each(LISTING_PAGES)("%s uses ProductGrid and writes no grid-cols- class", (page) => {
    const source = readFileSync(page, "utf8");
    expect(source).toContain("<ProductGrid");
    expect(source).not.toContain("grid-cols-");
  });

  it("leaves no copy of the old 2/3/4 listing grid anywhere under app/ or components/", () => {
    const offenders = [...tsxFiles("app"), ...tsxFiles("components")].filter((file) =>
      readFileSync(file, "utf8").includes("sm:grid-cols-3 lg:grid-cols-4"),
    );
    expect(offenders).toEqual([]);
  });

  it("ProductGrid carries the measuring hook and takes its classes from the preset module", () => {
    const source = readFileSync("components/product/ProductGrid.tsx", "utf8");
    expect(source).toContain("data-product-grid");
    expect(source).toContain("productGridClassName(density)");
    expect(source).not.toContain("grid-cols-");
  });
});
