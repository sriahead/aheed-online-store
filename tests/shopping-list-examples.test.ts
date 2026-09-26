import { describe, expect, it } from "vitest";
import { buildListExamples, NEUTRAL_LIST_PLACEHOLDER } from "@/lib/shopping-list-examples";

// #729 R9 — the Shop your list examples come from the vendor's own product names.
describe("buildListExamples", () => {
  it("uses one name as a leading-quantity line", () => {
    expect(buildListExamples(["USB-C Charger"])).toEqual({
      placeholder: "2x USB-C Charger",
      exampleName: "USB-C Charger",
    });
  });

  it("uses two names: leading quantity, then a bare line", () => {
    expect(buildListExamples(["USB-C Charger", "Desk Lamp"])).toEqual({
      placeholder: "2x USB-C Charger\nDesk Lamp",
      exampleName: "USB-C Charger",
    });
  });

  it("uses three names: leading, bare and trailing quantity", () => {
    expect(buildListExamples(["USB-C Charger", "Desk Lamp", "Earbuds"])).toEqual({
      placeholder: "2x USB-C Charger\nDesk Lamp\nEarbuds x 3",
      exampleName: "USB-C Charger",
    });
  });

  it("trims, drops empties and case-insensitive duplicates, and caps at three", () => {
    expect(
      buildListExamples(["  Desk Lamp ", "", "desk lamp", "   ", "Earbuds", "Cable", "Mouse"]),
    ).toEqual({
      placeholder: "2x Desk Lamp\nEarbuds\nCable x 3",
      exampleName: "Desk Lamp",
    });
  });

  it("falls back to neutral wording when the vendor has no products", () => {
    expect(buildListExamples([])).toEqual({
      placeholder: "2x first item\nsecond item\nthird item x 3",
      exampleName: null,
    });
    expect(buildListExamples(["", "  "]).placeholder).toBe(NEUTRAL_LIST_PLACEHOLDER);
  });
});
