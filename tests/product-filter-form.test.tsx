// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ProductFilterForm } from "@/components/product/ProductFilterForm";

/**
 * #501 — this is a plain `<form method="GET">`, so submitting it replaces the
 * ENTIRE query string with only the fields the form contains. `featured` has no
 * visible control (it is reached from the shop page's "View all", not chosen
 * here), so without a hidden field, pressing Apply from `/search?featured=1`
 * silently drops the filter and dumps the shopper into the full catalogue —
 * with nothing on screen to say the listing changed meaning.
 */
afterEach(cleanup);

const NO_FACETS = {
  halal: false,
  fresh: false,
  organic: false,
  vegetarian: false,
  glutenFree: false,
  hmcCertified: false,
  onOffer: false,
  origins: [],
  brands: [],
  packSizes: [],
};

describe("ProductFilterForm — featured passthrough", () => {
  it("renders a hidden featured input when the param is set", () => {
    const { container } = render(
      <ProductFilterForm searchParams={{ featured: "1" }} facets={NO_FACETS} />,
    );

    const hidden = container.querySelector('input[type="hidden"][name="featured"]');
    expect(hidden).not.toBeNull();
    expect(hidden?.getAttribute("value")).toBe("1");
  });

  it("renders no featured input when the param is absent", () => {
    const { container } = render(<ProductFilterForm searchParams={{}} facets={NO_FACETS} />);

    expect(container.querySelector('input[name="featured"]')).toBeNull();
  });

  it("renders no featured input for any value other than 1", () => {
    const { container } = render(
      <ProductFilterForm searchParams={{ featured: "0" }} facets={NO_FACETS} />,
    );

    expect(container.querySelector('input[name="featured"]')).toBeNull();
  });

  it("does not carry a cursor — a filter change restarts pagination", () => {
    const { container } = render(
      <ProductFilterForm searchParams={{ featured: "1" }} facets={NO_FACETS} />,
    );

    expect(container.querySelector('input[name="cursor"]')).toBeNull();
  });
});

/**
 * #704 — the form renders no `<select name="category">` any more (the store owner found it
 * redundant with the department strip at the top of the page), so `category`'s entry point is a
 * link (a recovery/suggestion notice) rather than a control here — the same shape `featured`'s
 * `CollectionNav` link already has. Without this hidden field, submitting the form from a
 * category-scoped listing would silently drop `category` and widen the shopper back to the whole
 * catalogue, exactly the #501/#568 trap `featured`'s own hidden field exists to prevent.
 */
describe("ProductFilterForm — category passthrough", () => {
  it("renders a hidden category input carrying the exact slug when the param is set", () => {
    const { container } = render(
      <ProductFilterForm searchParams={{ category: "fruit-veg" }} facets={NO_FACETS} />,
    );

    const hidden = container.querySelector('input[type="hidden"][name="category"]');
    expect(hidden).not.toBeNull();
    expect(hidden?.getAttribute("value")).toBe("fruit-veg");
  });

  it("renders no category input when the param is absent", () => {
    const { container } = render(<ProductFilterForm searchParams={{}} facets={NO_FACETS} />);

    expect(container.querySelector('input[name="category"]')).toBeNull();
  });

  it("renders no visible category select under any circumstance", () => {
    const { container } = render(
      <ProductFilterForm searchParams={{ category: "fruit-veg" }} facets={NO_FACETS} />,
    );

    expect(container.querySelector('select[name="category"]')).toBeNull();
  });
});
