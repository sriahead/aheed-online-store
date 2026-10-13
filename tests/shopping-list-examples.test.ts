import { describe, expect, it } from "vitest";
import { buildListExamples, LIST_PLACEHOLDER } from "@/lib/shopping-list-examples";

/**
 * #729 R9 — the "Shop your list" example name comes from the vendor's own product names.
 *
 * #1077 — these cases no longer assert a worked list as the PLACEHOLDER. It used to be one, which
 * is exactly why shoppers read the box as pre-filled (triage item 18); the placeholder is now a
 * fixed prompt and the vendor-derived name is used by the hint above the box instead. The picking
 * rules below are unchanged and still the point of this module: the name offered has to be real,
 * in stock and this vendor's own.
 */
describe("buildListExamples", () => {
  it("uses the first name as the hint's example", () => {
    expect(buildListExamples(["USB-C Charger"])).toEqual({
      placeholder: LIST_PLACEHOLDER,
      exampleName: "USB-C Charger",
    });
  });

  it("takes the first of several names", () => {
    expect(buildListExamples(["USB-C Charger", "Desk Lamp", "Earbuds"])).toEqual({
      placeholder: LIST_PLACEHOLDER,
      exampleName: "USB-C Charger",
    });
  });

  it("trims, and skips empties and case-insensitive duplicates", () => {
    expect(
      buildListExamples(["   ", "  Desk Lamp ", "desk lamp", "Earbuds", "Cable", "Mouse"]),
    ).toEqual({
      placeholder: LIST_PLACEHOLDER,
      exampleName: "Desk Lamp",
    });
  });

  it("falls back to the neutral hint when the vendor has no usable product name", () => {
    expect(buildListExamples([])).toEqual({
      placeholder: LIST_PLACEHOLDER,
      exampleName: null,
    });
    expect(buildListExamples(["", "  "]).exampleName).toBeNull();
  });

  // #1077 — the prompt must not look like an entry a shopper could mistake for their own typing:
  // no quantity syntax, no product name, one line.
  it("offers a prompt that cannot be read as a list entry", () => {
    expect(LIST_PLACEHOLDER).not.toMatch(/\n/);
    expect(LIST_PLACEHOLDER).not.toMatch(/\bx\s*\d|\d+\s*x\b/i);
  });
});
