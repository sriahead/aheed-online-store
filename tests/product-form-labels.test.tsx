// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/features/admin/catalogue", () => ({ saveProduct: vi.fn() }));
vi.mock("@/components/staff/ProductImageUploader", () => ({ ProductImageUploader: () => null }));
vi.mock("@/components/staff/ProductImageManager", () => ({ ProductImageManager: () => null }));

import { ProductForm } from "@/components/staff/ProductForm";
import type { ProductLabelSettings } from "@/lib/product-label-settings";

/**
 * #905 R13 — the staff product form offers only the labels this vendor has switched on, and the
 * HMC section only while HMC (which needs Halal) is on. Featured/Visible are not labels.
 */

afterEach(cleanup);

const LABEL_INPUTS = ["isHalal", "isFresh", "isOrganic", "isVegetarian", "isGlutenFree"];

function renderWith(labels: ProductLabelSettings) {
  const { container } = render(
    <ProductForm product={null} categories={[]} brands={[]} imageUrls={[]} labels={labels} />,
  );
  const has = (name: string) => container.querySelector(`input[name="${name}"]`) !== null;
  const headings = [...container.querySelectorAll("h2")].map((h) => h.textContent);
  return { has, headings };
}

const NONE: ProductLabelSettings = {
  halal: false,
  fresh: false,
  organic: false,
  vegetarian: false,
  glutenFree: false,
  hmc: false,
};

describe("ProductForm label gating (#905 R13)", () => {
  it("with every label off, renders no label input and heads the section 'Visibility'", () => {
    const { has, headings } = renderWith(NONE);
    for (const name of [...LABEL_INPUTS, "isHmcCertified"]) expect(has(name)).toBe(false);
    expect(headings).toContain("Visibility");
    expect(headings).not.toContain("HMC certification");
    expect(has("isFeatured")).toBe(true);
    expect(has("isActive")).toBe(true);
  });

  it("with every label on, renders all six label inputs", () => {
    const { has, headings } = renderWith({
      halal: true,
      fresh: true,
      organic: true,
      vegetarian: true,
      glutenFree: true,
      hmc: true,
    });
    for (const name of [...LABEL_INPUTS, "isHmcCertified"]) expect(has(name)).toBe(true);
    expect(headings).toContain("Labels & visibility");
    expect(has("isFeatured")).toBe(true);
    expect(has("isActive")).toBe(true);
  });

  it("with Halal on and HMC off, renders Halal but no HMC section", () => {
    const { has } = renderWith({ ...NONE, halal: true });
    expect(has("isHalal")).toBe(true);
    expect(has("isHmcCertified")).toBe(false);
    expect(has("hmcReference")).toBe(false);
    expect(has("isFeatured")).toBe(true);
    expect(has("isActive")).toBe(true);
  });
});
