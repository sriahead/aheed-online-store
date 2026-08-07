import { describe, it, expect } from "vitest";
import { Apple, ShoppingBasket } from "lucide-react";
import { categoryIcon } from "@/components/product/category-icon";

// Proves R5: a known slug maps to its icon, and an unknown slug still returns a
// defined icon (the default) — so a category added to the DB later still renders.
describe("categoryIcon", () => {
  it("maps a known slug to its icon", () => {
    expect(categoryIcon("fruit-veg")).toBe(Apple);
  });
  it("returns the default icon for an unmapped slug", () => {
    const icon = categoryIcon("does-not-exist");
    expect(icon).toBe(ShoppingBasket);
    expect(icon).toBeDefined();
  });
});
