import { describe, expect, it } from "vitest";
import { dataErasureItems, dataExportItems, listPhrase } from "@/lib/data-rights-form";

/**
 * #1134 — /account/data's "what we hold" and "what erasure removes" sentences. They first shipped
 * stitched from conditional comma fragments, which dropped the final "and" ("…reviews, basket from
 * this store."). These pin the exact phrases for every switch combination; loyalty on with
 * marketing off must read exactly as it did before #1134.
 */

const exportPhrase = (loyalty: boolean, marketing: boolean) =>
  listPhrase(dataExportItems({ loyalty, marketing }));
const erasurePhrase = (loyalty: boolean, marketing: boolean) =>
  listPhrase(dataErasureItems({ loyalty, marketing }));

describe("data-rights item lists", () => {
  it("export: loyalty on, marketing off reads as before #1134", () => {
    expect(exportPhrase(true, false)).toBe(
      "your account details, orders, addresses, reviews, basket, loyalty points and any discount codes you have used",
    );
  });

  it("export: names neither switch-gated item when both are off", () => {
    expect(exportPhrase(false, false)).toBe(
      "your account details, orders, addresses, reviews, basket and any discount codes you have used",
    );
  });

  it("export: names marketing choices when the store asks for consent", () => {
    expect(exportPhrase(true, true)).toBe(
      "your account details, orders, addresses, reviews, basket, loyalty points, marketing email choices and any discount codes you have used",
    );
  });

  it("erasure: loyalty on, marketing off reads as before #1134", () => {
    expect(erasurePhrase(true, false)).toBe(
      "your name, contact details, addresses, reviews, basket and loyalty points",
    );
  });

  it("erasure: keeps its final 'and' with loyalty off", () => {
    expect(erasurePhrase(false, false)).toBe(
      "your name, contact details, addresses, reviews and basket",
    );
  });

  it("erasure: both switch-gated items, joined with a final 'and'", () => {
    expect(erasurePhrase(true, true)).toBe(
      "your name, contact details, addresses, reviews, basket, loyalty points and marketing email choices",
    );
    expect(erasurePhrase(false, true)).toBe(
      "your name, contact details, addresses, reviews, basket and marketing email choices",
    );
  });
});
