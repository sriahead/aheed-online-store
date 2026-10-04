import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * #964 — the storefront controls that `#961` left under 44px now carry the `tap` spacing token
 * below `lg`. Nothing fails when a class is dropped: the control still works, just smaller, so this
 * reads the source. `scripts/verify-mobile-layout.ts` finds each surface by its `data-tap-surface`
 * hook, so the hook is asserted too. Rule: specs/design-system.md, "Touch targets".
 */

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const TAP_UTILITY = /\b(?:h-tap|w-tap|size-tap|min-h-tap|min-w-tap)\b/;

const surfaces: Record<string, string[]> = {
  "components/layout/LocationControl.tsx": ["location", "location-dialog"],
  "components/product/FilterChips.tsx": ["filter-chips"],
  "components/product/FilterPanel.tsx": ["filter-panel"],
  "components/product/SubcategoryLinks.tsx": ["subcategories"],
  "components/product/CollectionNav.tsx": ["collections"],
  "app/(storefront)/categories/[slug]/page.tsx": ["pagination"],
  "app/(storefront)/search/page.tsx": ["pagination"],
  "components/cart/CartContents.tsx": ["cart-line-controls"],
  "components/layout/HorizontalScroller.tsx": ["scroller-arrow"],
};

/**
 * The mobile filter `<summary>` was already 50px tall before #964 (`px-4 py-3`, measured in the
 * slice's `baseline/a-cat.jsonl`), so it carries the hook but needs no `tap` class.
 */
const ALREADY_TAP_SIZED = new Set(["components/product/FilterPanel.tsx"]);

describe("tap-target surfaces", () => {
  for (const [file, values] of Object.entries(surfaces)) {
    const source = read(file);

    it(`${file} carries its data-tap-surface hook(s)`, () => {
      for (const value of values) {
        expect(source).toContain(`data-tap-surface="${value}"`);
      }
    });

    if (!ALREADY_TAP_SIZED.has(file)) {
      it(`${file} uses a tap-sized utility`, () => {
        expect(source).toMatch(TAP_UTILITY);
      });
    }
  }

  it("the LocationControl dialog is findable by --open-location", () => {
    expect(read("components/layout/LocationControl.tsx")).toMatch(/<dialog\s+data-location-dialog/);
  });
});
