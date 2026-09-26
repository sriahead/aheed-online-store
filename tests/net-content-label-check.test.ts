import { describe, expect, it } from "vitest";
import { checkSuggestionAgainstUnitLabel } from "@/lib/net-content-label-check";

/**
 * #900 (R12) — the free cross-check shown beside each suggestion. The first six rows are R12's
 * own table, taken from products in production's catalogue (measured 2026-09-25).
 */

describe("checkSuggestionAgainstUnitLabel (R12)", () => {
  it.each([
    ["Chicken Nuggets 500g", 349, "£6.98 / kg", 500, "GRAM", "AGREES"],
    ["Shampoo 400ml", 299, "£7.48 / litre", 400, "MILLILITRE", "AGREES"],
    ["Halal Beef Mince 500g", 449, "£4.49 / 500g", 500, "GRAM", "AGREES"],
    ["Basmati Rice 5kg", 899, "£8.99 / 5kg", 5000, "GRAM", "AGREES"],
    ["Chicken Nuggets 500g", 349, "£6.98 / kg", 1, "KILOGRAM", "DISAGREES"],
    ["Coconut Milk", 129, "£1.29 / tin", 400, "MILLILITRE", "NOT_CHECKABLE"],
  ] as const)(
    "%s at %ip with %s and %i %s -> %s",
    (_name, price, label, amount, unit, expected) => {
      expect(checkSuggestionAgainstUnitLabel(price, label, { amount, unit })).toBe(expected);
    },
  );

  it("accepts the pack form in the suggestion's own coarser unit", () => {
    expect(
      checkSuggestionAgainstUnitLabel(899, "£8.99 / 5kg", { amount: 5, unit: "KILOGRAM" }),
    ).toBe("AGREES");
    expect(
      checkSuggestionAgainstUnitLabel(449, "£4.49 / 2L", { amount: 2000, unit: "MILLILITRE" }),
    ).toBe("AGREES");
  });

  it("checks per-100g and per-100ml labels", () => {
    expect(
      checkSuggestionAgainstUnitLabel(179, "£1.79 / 100ml", { amount: 100, unit: "MILLILITRE" }),
    ).toBe("AGREES");
    expect(
      checkSuggestionAgainstUnitLabel(179, "£1.79 / 100ml", { amount: 200, unit: "MILLILITRE" }),
    ).toBe("DISAGREES");
  });

  it("reads 'L' case-insensitively as litres", () => {
    expect(checkSuggestionAgainstUnitLabel(199, "£1.99 / L", { amount: 1, unit: "LITRE" })).toBe(
      "AGREES",
    );
  });

  it("disagrees on a dimension mismatch or an EACH suggestion against a per-kg label", () => {
    expect(
      checkSuggestionAgainstUnitLabel(349, "£6.98 / kg", { amount: 500, unit: "MILLILITRE" }),
    ).toBe("DISAGREES");
    expect(checkSuggestionAgainstUnitLabel(349, "£6.98 / kg", { amount: 6, unit: "EACH" })).toBe(
      "DISAGREES",
    );
  });

  it("cannot check a pack-form label whose price is not this product's price", () => {
    expect(
      checkSuggestionAgainstUnitLabel(500, "£4.49 / 500g", { amount: 500, unit: "GRAM" }),
    ).toBe("NOT_CHECKABLE");
  });

  it.each(["£2.40 / pack", "£5.49 each", "£1.45 / 2pt", "£1.89 / 6 pack", "£17.99 / 5m"])(
    "cannot check %s",
    (label) => {
      expect(checkSuggestionAgainstUnitLabel(100, label, { amount: 1, unit: "EACH" })).toBe(
        "NOT_CHECKABLE",
      );
    },
  );
});
