import { describe, it, expect } from "vitest";
import {
  DEFAULT_PRODUCT_GRID_DENSITY,
  PRODUCT_GRID_DENSITIES,
  PRODUCT_GRID_DENSITY_OPTIONS,
  parseProductGridDensity,
  productGridClassName,
} from "@/lib/product-grid-density";

/**
 * #962 — the preset table in specs/2026-10-02-p960-962-mobile-browse-density/plan.md, asserted
 * character for character. Tailwind only emits classes it finds as literal text, so a class string
 * here that drifted from the table would silently render a different layout, not fail a build.
 */
describe("productGridClassName", () => {
  it("maps each preset to exactly its class string", () => {
    expect(productGridClassName("COMPACT")).toBe(
      "grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6",
    );
    expect(productGridClassName("STANDARD")).toBe("grid grid-cols-2 gap-4 lg:grid-cols-4");
    expect(productGridClassName("SPACIOUS")).toBe(
      "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4",
    );
  });

  it("never offers an odd multi-column step, and never four columns before lg", () => {
    for (const density of PRODUCT_GRID_DENSITIES) {
      const counts = [...productGridClassName(density).matchAll(/(?:^|\s)(\w+:)?grid-cols-(\d+)/g)];
      for (const [, variant, n] of counts) {
        const cols = Number(n);
        if (cols > 1) expect(cols % 2).toBe(0);
        if (cols >= 4) expect(["lg:", "xl:"]).toContain(variant);
      }
    }
  });

  it("defaults to STANDARD, matching the column default", () => {
    expect(DEFAULT_PRODUCT_GRID_DENSITY).toBe("STANDARD");
  });
});

describe("PRODUCT_GRID_DENSITY_OPTIONS", () => {
  it("labels the three presets as the staff form shows them", () => {
    expect(PRODUCT_GRID_DENSITIES).toEqual(["COMPACT", "STANDARD", "SPACIOUS"]);
    expect(PRODUCT_GRID_DENSITY_OPTIONS.COMPACT.label).toBe("Compact");
    expect(PRODUCT_GRID_DENSITY_OPTIONS.STANDARD.label).toBe("Standard");
    expect(PRODUCT_GRID_DENSITY_OPTIONS.SPACIOUS.label).toBe("Spacious");
    for (const density of PRODUCT_GRID_DENSITIES) {
      expect(PRODUCT_GRID_DENSITY_OPTIONS[density].description.length).toBeGreaterThan(0);
    }
  });
});

describe("parseProductGridDensity", () => {
  it.each(["COMPACT", "STANDARD", "SPACIOUS"])("accepts the exact enum name %s", (value) => {
    expect(parseProductGridDensity(value)).toEqual({ ok: true, value });
  });

  it.each([[""], ["standard"], [null], [undefined], ["WIDE"], [3]])(
    "refuses %j rather than guessing",
    (value) => {
      const result = parseProductGridDensity(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.field).toBe("productGridDensity");
    },
  );
});
