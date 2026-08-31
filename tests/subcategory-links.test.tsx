// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SubcategoryLinks } from "@/components/product/SubcategoryLinks";
import type { CategorySummary } from "@/lib/repositories/categories";

/**
 * #494 — `getCategoryBySlug` has always fetched a category's `children`, but
 * nothing ever rendered them, so a subcategory (and anything assigned to it)
 * was unreachable except by typing its URL or using search. R1/R2 pin the two
 * cases that make this component's data-driven contract checkable: an empty
 * array renders nothing at all (a subcategory has none of its own — the tree
 * is capped at two levels), and a non-empty one renders one real link per
 * entry.
 *
 * #496 — a parent category page now aggregates its own products with every
 * child's (see `listProductsByCategory`'s array parameter), so the leading
 * "All" pill exists to make that aggregation visually explicit rather than
 * silent, and links back to the current page itself.
 */

const SUBCATEGORIES: CategorySummary[] = [
  { id: "cat-1", slug: "rice-grains", name: "Rice & Grains" },
  { id: "cat-2", slug: "lentils-pulses", name: "Lentils & Pulses" },
  { id: "cat-3", slug: "cooking-oils", name: "Cooking Oils" },
];

afterEach(cleanup);

describe("SubcategoryLinks", () => {
  it("renders nothing at all for an empty list (R1)", () => {
    const { container } = render(<SubcategoryLinks subcategories={[]} currentSlug="groceries" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one link per subcategory, with the correct href and name (R2)", () => {
    render(<SubcategoryLinks subcategories={SUBCATEGORIES} currentSlug="groceries" />);

    for (const category of SUBCATEGORIES) {
      const link = screen.getByRole("link", { name: category.name });
      expect(link.getAttribute("href")).toBe(`/categories/${category.slug}`);
    }
  });

  it("renders an 'All' pill linking to the current page, marked as the current page (R3)", () => {
    render(<SubcategoryLinks subcategories={SUBCATEGORIES} currentSlug="groceries" />);

    const allLink = screen.getByRole("link", { name: "All" });
    expect(allLink.getAttribute("href")).toBe("/categories/groceries");
    expect(allLink.getAttribute("aria-current")).toBe("page");
  });

  it("renders exactly one link per subcategory plus the 'All' pill, no more", () => {
    render(<SubcategoryLinks subcategories={SUBCATEGORIES} currentSlug="groceries" />);
    expect(screen.getAllByRole("link")).toHaveLength(SUBCATEGORIES.length + 1);
  });
});
