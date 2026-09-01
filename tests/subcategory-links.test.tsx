// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SubcategoryLinks } from "@/components/product/SubcategoryLinks";
import type { CategorySummary } from "@/lib/repositories/categories";

/**
 * #494 — `getCategoryBySlug` has always fetched a category's `children`, but
 * nothing ever rendered them, so a subcategory (and anything assigned to it)
 * was unreachable except by typing its URL or using search.
 *
 * #496 — a parent category page now aggregates its own products with every
 * child's (see `listProductsByCategory`'s array parameter), so the leading
 * "All" pill exists to make that aggregation visually explicit rather than
 * silent, and links back to the department itself.
 *
 * #498 — a subcategory's own page used to lose all navigation once you
 * clicked into it (its own `children` is always empty). `tabs`/`parentSlug`
 * are now computed by the caller so the SAME sibling row renders whether
 * you're on the department's page or one of its subcategories' — only
 * `activeSlug` changes, which pill is highlighted.
 */

const TABS: CategorySummary[] = [
  { id: "cat-1", slug: "rice-grains", name: "Rice & Grains" },
  { id: "cat-2", slug: "lentils-pulses", name: "Lentils & Pulses" },
  { id: "cat-3", slug: "cooking-oils", name: "Cooking Oils" },
];

afterEach(cleanup);

describe("SubcategoryLinks", () => {
  it("renders nothing at all when there are no tabs (R1)", () => {
    const { container } = render(
      <SubcategoryLinks tabs={[]} parentSlug="groceries" activeSlug="groceries" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders one link per tab, with the correct href and name (R2)", () => {
    render(<SubcategoryLinks tabs={TABS} parentSlug="groceries" activeSlug="groceries" />);

    for (const tab of TABS) {
      const link = screen.getByRole("link", { name: tab.name });
      expect(link.getAttribute("href")).toBe(`/categories/${tab.slug}`);
    }
  });

  it("renders an 'All' pill linking to the department, marked current when it's the active page (R3)", () => {
    render(<SubcategoryLinks tabs={TABS} parentSlug="groceries" activeSlug="groceries" />);

    const allLink = screen.getByRole("link", { name: "All" });
    expect(allLink.getAttribute("href")).toBe("/categories/groceries");
    expect(allLink.getAttribute("aria-current")).toBe("page");
  });

  it("marks a specific tab current instead of 'All' when viewing that subcategory (#498)", () => {
    render(<SubcategoryLinks tabs={TABS} parentSlug="groceries" activeSlug="rice-grains" />);

    const allLink = screen.getByRole("link", { name: "All" });
    expect(allLink.getAttribute("aria-current")).toBeNull();

    const riceLink = screen.getByRole("link", { name: "Rice & Grains" });
    expect(riceLink.getAttribute("aria-current")).toBe("page");

    // Only ever one active pill.
    const lentilsLink = screen.getByRole("link", { name: "Lentils & Pulses" });
    expect(lentilsLink.getAttribute("aria-current")).toBeNull();
  });

  it("renders exactly one link per tab plus the 'All' pill, no more", () => {
    render(<SubcategoryLinks tabs={TABS} parentSlug="groceries" activeSlug="groceries" />);
    expect(screen.getAllByRole("link")).toHaveLength(TABS.length + 1);
  });
});
