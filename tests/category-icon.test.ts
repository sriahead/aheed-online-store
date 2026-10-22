import { describe, it, expect } from "vitest";
import { categoryIconName } from "@/components/product/category-icon";
import { ICON_REGISTRY } from "@/components/icons/registry";

// Proves R5: a known slug maps to its icon, and an unknown slug still returns a defined icon (the
// default) — so a category added to the DB later still renders. #1223 R29: the mapping returns a
// semantic NAME (a registry key), never a component, so nothing here depends on an icon library.
describe("categoryIconName", () => {
  it("maps a known slug to its icon name", () => {
    expect(categoryIconName("fruit-veg")).toBe("apple");
  });
  it("returns the default icon name for an unmapped slug", () => {
    const name = categoryIconName("does-not-exist");
    expect(name).toBe("tag");
    expect(ICON_REGISTRY).toHaveProperty([name]);
  });
  // #729 R22 — a non-grocery vendor's categories get a neutral tag, not a grocery basket.
  it("gives a non-grocery category slug the neutral tag icon", () => {
    expect(categoryIconName("chargers")).toBe("tag");
  });
  it("returns a string, never a component (R29)", () => {
    expect(typeof categoryIconName("bakery")).toBe("string");
  });
  it("every mapped slug names a real registry entry", () => {
    for (const slug of [
      "fruit-veg",
      "bakery",
      "dairy-eggs",
      "halal-meat",
      "groceries",
      "international",
      "beverages",
      "snacks",
      "household",
    ]) {
      expect(ICON_REGISTRY).toHaveProperty([categoryIconName(slug)]);
    }
  });
});
