import { describe, expect, it } from "vitest";
import {
  parseCategoryForm,
  parseProductForm,
  slugify,
  type ParseResult,
  type RawForm,
} from "@/lib/catalogue-form";

/**
 * P6b1 (#159) — the catalogue admin's field rules, unit-tested with no database.
 *
 * These are the rules that decide what a submitted form MEANS before any row is
 * written. Two of them are worth protecting specifically: a slug must never
 * reach the database in a shape the module wouldn't have generated itself
 * (otherwise `@@unique([vendorId, slug])` starts colliding on invisible
 * whitespace), and a "was" price must be strictly above the price it advertises
 * a saving against — a badge promising £0.00 off is worse than no badge.
 */

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A complete, valid product form — each test overrides only the field it is about. */
function productForm(overrides: RawForm = {}): RawForm {
  return {
    name: "Basmati Rice",
    slug: "basmati-rice",
    description: "Long grain.",
    categoryId: "cat-1",
    basePrice: "2.40",
    unitLabel: "£2.40 / kg",
    quantity: "10",
    lowStockThreshold: "3",
    isActive: "on",
    ...overrides,
  };
}

function categoryForm(overrides: RawForm = {}): RawForm {
  return {
    name: "Rice & Grains",
    slug: "rice-grains",
    sortOrder: "0",
    isActive: "on",
    ...overrides,
  };
}

/** Asserts a rejection and returns the field name, so tests read as one line. */
function rejectedField<T>(result: ParseResult<T>): string {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected a rejection");
  expect(result.error.message.length).toBeGreaterThan(0);
  return result.error.field;
}

function accepted<T>(result: ParseResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`expected acceptance, got: ${result.error.message}`);
  return result.value;
}

describe("slugify", () => {
  it("lowercases and hyphenates a normal product name", () => {
    expect(slugify("Basmati Rice 5kg")).toBe("basmati-rice-5kg");
  });

  it("collapses runs of punctuation and whitespace into single hyphens", () => {
    const slug = slugify("  Ghee  &  Oil  ");
    expect(slug).toBe("ghee-oil");
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it("folds diacritics to their base letter rather than dropping them", () => {
    // Without the NFKD + combining-mark strip this is "cr-me-fra-che".
    expect(slugify("Crème Fraîche")).toBe("creme-fraiche");
  });

  it("returns empty string when there is nothing alphanumeric to use", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("   ")).toBe("");
  });

  it("never emits leading, trailing or doubled hyphens", () => {
    for (const input of ["--Rice--", "a  b", "!Rice!", "Rice -- Grains"]) {
      expect(slugify(input)).toMatch(SLUG_PATTERN);
    }
  });
});

describe("parseProductForm — slug derivation (R3)", () => {
  it("derives the slug from the name when the slug field is blank", () => {
    const value = accepted(parseProductForm(productForm({ slug: "" })));
    expect(value.slug).toBe("basmati-rice");
  });

  it("normalises a typed slug through the same rules", () => {
    const value = accepted(parseProductForm(productForm({ slug: "  Validation SPICE R3 " })));
    expect(value.slug).toBe("validation-spice-r3");
  });

  it("rejects when neither the name nor the slug yields anything usable", () => {
    // The name is non-empty (so it passes the name check) but has no alphanumerics.
    expect(rejectedField(parseProductForm(productForm({ name: "!!!", slug: "" })))).toBe("slug");
  });
});

describe("parseProductForm — field rules (R5)", () => {
  it("rejects an empty name", () => {
    expect(rejectedField(parseProductForm(productForm({ name: "   " })))).toBe("name");
  });

  it("rejects an empty unit label", () => {
    expect(rejectedField(parseProductForm(productForm({ unitLabel: "" })))).toBe("unitLabel");
  });

  it("rejects an empty category", () => {
    expect(rejectedField(parseProductForm(productForm({ categoryId: "" })))).toBe("categoryId");
  });

  it("rejects an absent or negative price", () => {
    expect(rejectedField(parseProductForm(productForm({ basePrice: "" })))).toBe("basePrice");
    expect(rejectedField(parseProductForm(productForm({ basePrice: "-1" })))).toBe("basePrice");
    expect(rejectedField(parseProductForm(productForm({ basePrice: "abc" })))).toBe("basePrice");
  });

  it("rejects a negative or fractional stock quantity", () => {
    expect(rejectedField(parseProductForm(productForm({ quantity: "-1" })))).toBe("quantity");
    expect(rejectedField(parseProductForm(productForm({ quantity: "1.5" })))).toBe("quantity");
    expect(rejectedField(parseProductForm(productForm({ quantity: "" })))).toBe("quantity");
  });

  it("rejects a negative low-stock threshold", () => {
    expect(rejectedField(parseProductForm(productForm({ lowStockThreshold: "-1" })))).toBe(
      "lowStockThreshold",
    );
  });

  it("returns errors as data rather than throwing", () => {
    expect(() => parseProductForm(productForm({ name: "" }))).not.toThrow();
  });

  it("parses pounds into integer pence", () => {
    const value = accepted(parseProductForm(productForm({ basePrice: "2.40" })));
    expect(value.basePrice).toBe(240);
  });

  it("accepts a zero price without treating it as absent", () => {
    expect(accepted(parseProductForm(productForm({ basePrice: "0" }))).basePrice).toBe(0);
  });
});

describe("parseProductForm — was-price (R6)", () => {
  it("accepts a was-price strictly above the price", () => {
    const value = accepted(
      parseProductForm(productForm({ basePrice: "2.40", originalPrice: "3.00" })),
    );
    expect(value.originalPrice).toBe(300);
  });

  it("rejects a was-price equal to the price", () => {
    expect(
      rejectedField(parseProductForm(productForm({ basePrice: "2.40", originalPrice: "2.40" }))),
    ).toBe("originalPrice");
  });

  it("rejects a was-price below the price", () => {
    expect(
      rejectedField(parseProductForm(productForm({ basePrice: "2.40", originalPrice: "1.00" }))),
    ).toBe("originalPrice");
  });

  it("treats a blank was-price as null, not zero", () => {
    expect(accepted(parseProductForm(productForm({ originalPrice: "" }))).originalPrice).toBeNull();
    expect(accepted(parseProductForm(productForm())).originalPrice).toBeNull();
  });
});

describe("parseProductForm — multi-buy tier (P8.5d, #348)", () => {
  // productForm()'s basePrice is 2.40, so 2 singly = 480p and 3 singly = 720p.

  it("is null when both tier fields are blank", () => {
    expect(accepted(parseProductForm(productForm())).tier).toBeNull();
    expect(
      accepted(parseProductForm(productForm({ tierGroupQuantity: "", tierGroupPrice: "" }))).tier,
    ).toBeNull();
  });

  it("parses a complete tier into whole pence", () => {
    const value = accepted(
      parseProductForm(
        productForm({ tierGroupQuantity: "3", tierGroupPrice: "6.00", tierIsActive: "on" }),
      ),
    );
    expect(value.tier).toEqual({ groupQuantity: 3, groupPricePence: 600, isActive: true });
  });

  it("keeps an inactive tier's numbers rather than discarding them", () => {
    // Unticking "running" must not be the same as clearing the offer — the
    // numbers survive so a seasonal multi-buy can be switched back on.
    const value = accepted(
      parseProductForm(productForm({ tierGroupQuantity: "3", tierGroupPrice: "6.00" })),
    );
    expect(value.tier).toEqual({ groupQuantity: 3, groupPricePence: 600, isActive: false });
  });

  it("refuses a half-typed tier, naming the empty field", () => {
    expect(rejectedField(parseProductForm(productForm({ tierGroupQuantity: "3" })))).toBe(
      "tierGroupPrice",
    );
    expect(rejectedField(parseProductForm(productForm({ tierGroupPrice: "6.00" })))).toBe(
      "tierGroupQuantity",
    );
  });

  it("refuses a group of fewer than two", () => {
    // A "group" of 1 is a markdown, which is what originalPrice is for.
    expect(
      rejectedField(
        parseProductForm(productForm({ tierGroupQuantity: "1", tierGroupPrice: "2.00" })),
      ),
    ).toBe("tierGroupQuantity");
  });

  it("refuses a non-numeric or fractional quantity", () => {
    expect(
      rejectedField(
        parseProductForm(productForm({ tierGroupQuantity: "two", tierGroupPrice: "6.00" })),
      ),
    ).toBe("tierGroupQuantity");
    expect(
      rejectedField(
        parseProductForm(productForm({ tierGroupQuantity: "2.5", tierGroupPrice: "6.00" })),
      ),
    ).toBe("tierGroupQuantity");
  });

  it("refuses a price that does not beat buying that many singly", () => {
    // 3 x 2.40 = 7.20. Anything at or above that saves nothing.
    expect(
      rejectedField(
        parseProductForm(productForm({ tierGroupQuantity: "3", tierGroupPrice: "7.20" })),
      ),
    ).toBe("tierGroupPrice");
    expect(
      rejectedField(
        parseProductForm(productForm({ tierGroupQuantity: "3", tierGroupPrice: "8.00" })),
      ),
    ).toBe("tierGroupPrice");
  });

  it("accepts a price one penny under the singly total", () => {
    const value = accepted(
      parseProductForm(productForm({ tierGroupQuantity: "3", tierGroupPrice: "7.19" })),
    );
    expect(value.tier?.groupPricePence).toBe(719);
  });
});

describe("parseProductForm — checkboxes and optional text", () => {
  it("reads an absent checkbox as false and a present one as true", () => {
    const off = accepted(parseProductForm(productForm()));
    expect(off.isHalal).toBe(false);
    expect(off.isActive).toBe(true);

    const on = accepted(parseProductForm(productForm({ isHalal: "on", isOrganic: "on" })));
    expect(on.isHalal).toBe(true);
    expect(on.isOrganic).toBe(true);
    expect(on.isFresh).toBe(false);
  });

  it("treats a blank origin as null but a blank description as an empty string", () => {
    // `description` is non-null in the schema; `origin` is nullable.
    const value = accepted(parseProductForm(productForm({ origin: "", description: "" })));
    expect(value.origin).toBeNull();
    expect(value.description).toBe("");
  });
});

describe("parseCategoryForm", () => {
  it("derives and normalises the slug exactly as the product form does", () => {
    expect(accepted(parseCategoryForm(categoryForm({ slug: "" }))).slug).toBe("rice-grains");
    expect(accepted(parseCategoryForm(categoryForm({ slug: " Rice & GRAINS " }))).slug).toBe(
      "rice-grains",
    );
  });

  it("rejects an empty name", () => {
    expect(rejectedField(parseCategoryForm(categoryForm({ name: "" })))).toBe("name");
  });

  it("rejects a non-integer or negative sort order", () => {
    expect(rejectedField(parseCategoryForm(categoryForm({ sortOrder: "1.5" })))).toBe("sortOrder");
    expect(rejectedField(parseCategoryForm(categoryForm({ sortOrder: "-1" })))).toBe("sortOrder");
  });

  it("treats a blank parent as top-level", () => {
    expect(accepted(parseCategoryForm(categoryForm({ parentId: "" }))).parentId).toBeNull();
    expect(accepted(parseCategoryForm(categoryForm())).parentId).toBeNull();
  });

  it("passes a supplied parent through untouched — whether it is top-level is a DB question", () => {
    expect(accepted(parseCategoryForm(categoryForm({ parentId: "cat-9" }))).parentId).toBe("cat-9");
  });
});
