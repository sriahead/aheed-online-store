// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/features/admin/catalogue", () => ({ saveProduct: vi.fn() }));
vi.mock("@/components/staff/ProductImageUploader", () => ({ ProductImageUploader: () => null }));
vi.mock("@/components/staff/ProductImageManager", () => ({ ProductImageManager: () => null }));

import { ProductForm } from "@/components/staff/ProductForm";
import type { AdminProductDetail } from "@/lib/repositories/products";

/** #912 R16 — one select per vendor filter, and no section at all without filters. */

afterEach(cleanup);

const LABELS = {
  halal: false,
  fresh: false,
  organic: false,
  vegetarian: false,
  glutenFree: false,
  hmc: false,
};

const COLOUR = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Colour",
  slug: "colour",
  options: [
    { id: "22222222-2222-4222-8222-222222222222", name: "Black", slug: "black" },
    { id: "33333333-3333-4333-8333-333333333333", name: "White", slug: "white" },
  ],
};

function renderForm(attributes: (typeof COLOUR)[], product: AdminProductDetail | null = null) {
  return render(
    <ProductForm
      product={product}
      categories={[]}
      brands={[]}
      imageUrls={[]}
      labels={LABELS}
      attributes={attributes}
    />,
  ).container;
}

describe("ProductForm vendor filters", () => {
  it("renders no Product filters section when the vendor has none", () => {
    const container = renderForm([]);
    const headings = [...container.querySelectorAll("h2")].map((h) => h.textContent);
    expect(headings).not.toContain("Product filters");
    expect(container.querySelector('select[name^="attribute_"]')).toBeNull();
  });

  it("renders one select per filter, Not set first, option ids as values", () => {
    const container = renderForm([COLOUR]);
    const headings = [...container.querySelectorAll("h2")].map((h) => h.textContent);
    expect(headings).toContain("Product filters");

    const select = container.querySelector(
      `select[name="attribute_${COLOUR.id}"]`,
    ) as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    const options = [...select!.options].map((o) => [o.value, o.textContent]);
    expect(options).toEqual([
      ["", "Not set"],
      [COLOUR.options[0].id, "Black"],
      [COLOUR.options[1].id, "White"],
    ]);
    expect(container.querySelector(`label[for="attribute_${COLOUR.id}"]`)?.textContent).toBe(
      "Colour",
    );
  });

  it("defaults to the product's stored value", () => {
    const product = {
      id: "p1",
      attributeValues: { [COLOUR.id]: COLOUR.options[1].id },
    } as unknown as AdminProductDetail;
    const container = renderForm([COLOUR], product);
    const select = container.querySelector(
      `select[name="attribute_${COLOUR.id}"]`,
    ) as HTMLSelectElement | null;
    expect(select!.value).toBe(COLOUR.options[1].id);
  });
});
