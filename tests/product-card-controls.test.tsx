// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { ProductCard } from "@/components/product/ProductCard";
import type { ProductSummary } from "@/lib/repositories/products";

/**
 * `#1185` — the product card's add control is ONE bare `+`.
 *
 * It used to be an `[ + Add ]` text button plus, from `sm` up, a pre-add `− [1] +` quantity picker
 * that chose a quantity before anything was added. `#956`'s Gate 1 deliberately kept that picker;
 * the owner reversed that on 2026-10-20. **These cases are the thing that stops it coming back as
 * an accidental "restoration"** — see `components/cart/AddToCartButton.tsx`'s `card` branch.
 *
 * The post-add half is NOT retested here: `ProductCard` already swapped to `CartQuantityStepper`
 * at `cartQuantity > 0` before this slice, and that component treats a decrement at 1 as removal.
 * Testing it again at this level would duplicate `tests/product-card-anchor.test.tsx` without
 * adding confidence.
 *
 * Same `@/lib/db` mock as the other card tests: the cart actions transitively import
 * `@prisma/client/wasm`, a subpath export only Next's webpack build can resolve.
 */
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));

const openQuickView = vi.fn();
vi.mock("@/components/product/quick-view-context", () => ({
  useQuickView: () => ({ openQuickView }),
}));

afterEach(() => {
  cleanup();
  openQuickView.mockClear();
});

function product(overrides: Partial<ProductSummary> = {}): ProductSummary {
  return {
    id: "prod-1",
    slug: "golden-paneer-500g",
    name: "Golden Paneer 500g",
    basePrice: 450,
    unitLabel: "500g",
    netContentAmount: null,
    netContentUnit: null,
    primaryImage: null,
    origin: null,
    originalPrice: null,
    isHalal: false,
    isFresh: false,
    isOrganic: false,
    isVegetarian: false,
    isGlutenFree: false,
    isHmcCertified: false,
    brand: null,
    averageRating: 4.5,
    reviewCount: 12,
    inStock: true,
    stockQuantity: 20,
    lowStockThreshold: 3,
    expectedRestockDay: null,
    tier: null,
    cardSpecifications: [],
    ...overrides,
  };
}

describe("AddToCartButton card variant — one bare + (#1185)", () => {
  it("renders exactly one button, with no pre-add quantity picker (R13)", () => {
    render(
      <AddToCartButton
        productId="prod-1"
        productName="Golden Paneer 500g"
        variant="card"
        label="Add Golden Paneer 500g to cart"
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByLabelText(/Decrease quantity/)).toBeNull();
    expect(screen.queryByLabelText(/Increase quantity/)).toBeNull();
  });

  it("has no visible 'Add' text, so `label` is its only accessible name (R13, R14)", () => {
    render(
      <AddToCartButton
        productId="prod-1"
        productName="Golden Paneer 500g"
        variant="card"
        label="Add Golden Paneer 500g to cart"
      />,
    );

    const button = screen.getByRole("button");
    // The icon is aria-hidden, so the button has no text content of its own.
    expect(button.textContent).toBe("");
    // Plain DOM assertions: `@testing-library/jest-dom` is deliberately not a dependency in
    // this repo, so `toBeDisabled()` and `toHaveAccessibleName()` do not exist.
    expect(button.getAttribute("aria-label")).toBe("Add Golden Paneer 500g to cart");
  });

  it("keeps a 44px tap target at the base breakpoint (R16)", () => {
    render(
      <AddToCartButton
        productId="prod-1"
        productName="Golden Paneer 500g"
        variant="card"
        label="Add Golden Paneer 500g to cart"
      />,
    );

    // `size-tap` unprefixed — a `lg:`-only form would leave the phone control under 44px, which is
    // the regression #961 and #964 exist to prevent.
    expect(screen.getByRole("button").className).toContain("size-tap");
  });

  it("still renders the disabled out-of-stock button, naming the product (R15)", () => {
    render(
      <AddToCartButton
        productId="prod-1"
        productName="Golden Paneer 500g"
        variant="card"
        label="Add Golden Paneer 500g to cart"
        disabled
      />,
    );

    const button = screen.getByRole("button");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.textContent).toBe("Out of stock");
    expect(button.getAttribute("aria-label")).toBe("Golden Paneer 500g is out of stock");
  });
});

describe("AddToCartButton — the other three variants are untouched (R21)", () => {
  it("drawer keeps its quantity picker", () => {
    render(
      <AddToCartButton
        productId="prod-1"
        productName="Golden Paneer 500g"
        variant="drawer"
        label="Add to cart"
      />,
    );

    expect(screen.getByLabelText("Decrease quantity of Golden Paneer 500g")).toBeTruthy();
    expect(screen.getByLabelText("Increase quantity of Golden Paneer 500g")).toBeTruthy();
  });

  it("full renders one add button and no card-style picker", () => {
    render(
      <AddToCartButton
        productId="prod-1"
        productName="Golden Paneer 500g"
        variant="full"
        label="Add to cart"
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByLabelText(/Decrease quantity/)).toBeNull();
  });

  it("icon renders one button", () => {
    render(<AddToCartButton productId="prod-1" productName="Golden Paneer 500g" variant="icon" />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

describe("ProductCard wiring (#1185)", () => {
  it("passes a label naming the product to the card's add control (R14)", () => {
    render(
      <ProductCard
        product={product()}
        cdnBaseUrl="https://cdn.example"
        cartQuantity={0}
        favouriteState="off"
      />,
    );

    expect(screen.getByLabelText("Add Golden Paneer 500g to cart")).toBeTruthy();
  });

  it("renders no quantity stepper for an out-of-stock product (R15)", () => {
    render(
      <ProductCard
        product={product({ inStock: false })}
        cdnBaseUrl="https://cdn.example"
        cartQuantity={0}
        favouriteState="off"
      />,
    );

    expect(screen.queryByLabelText(/in cart/)).toBeNull();
    expect(screen.getByLabelText("Golden Paneer 500g is out of stock")).toBeTruthy();
  });
});
