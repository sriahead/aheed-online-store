// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ProductCard } from "@/components/product/ProductCard";
import type { ProductSummary } from "@/lib/repositories/products";

// `AddToCartButton`/`CartQuantityStepper` import server actions
// (`@/features/cart/add-to-cart`, `@/features/cart/update-quantity`) that
// transitively import `@/lib/db`, which imports `@prisma/client/wasm` — a
// subpath export only Next's webpack build (via `@opennextjs/cloudflare`)
// can resolve, not Vitest's Vite-based transform. Mocked the same way as
// `tests/auth.test.ts`/`tests/orders.test.ts` etc. so this test can render
// the real card tree without needing a live Prisma client.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));

/**
 * #351/#656 — HTML forbids interactive content inside `<a>`, and
 * `AddToCartButton`/`CartQuantityStepper` both render real `<button>`
 * elements. `ProductCard` used to wrap the whole card in one `<Link>` and
 * rely on every button handler calling `preventDefault()`/
 * `stopPropagation()` never to lapse (R11). This test renders the real card
 * and fails if a `<button>` is ever a DOM descendant of an `<a>` again,
 * rather than trusting that discipline to hold (R12).
 *
 * `vitest.config.mts` sets `environment: "node"` globally, so the docblock
 * at the top opts this file into a DOM — same pattern as
 * `tests/product-card-image.test.tsx` and `tests/a11y/cart-drawer.test.tsx`.
 */

afterEach(cleanup);

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
    tier: null,
    ...overrides,
  };
}

describe("ProductCard — stretched link, no nested interactive content (R11/R12)", () => {
  it("renders no <button> as a descendant of any <a>, with the product not yet in the cart", () => {
    const { container } = render(
      <ProductCard product={product()} cdnBaseUrl="https://cdn.example" cartQuantity={0} />,
    );

    const anchors = Array.from(container.querySelectorAll("a"));
    expect(anchors.length, "expected the card's title link to exist").toBeGreaterThan(0);

    const offenders = anchors.flatMap((a) => Array.from(a.querySelectorAll("button")));
    expect(
      offenders,
      "a <button> is nested inside an <a> — HTML forbids interactive content inside a link",
    ).toEqual([]);
  });

  it("renders no <button> as a descendant of any <a>, with the product already in the cart", () => {
    // cartQuantity > 0 swaps AddToCartButton for CartQuantityStepper, which
    // renders TWO buttons (decrease/increase) — the case most likely to
    // regress if either control moves back inside the link.
    const { container } = render(
      <ProductCard product={product()} cdnBaseUrl="https://cdn.example" cartQuantity={2} />,
    );

    const anchors = Array.from(container.querySelectorAll("a"));
    const offenders = anchors.flatMap((a) => Array.from(a.querySelectorAll("button")));
    expect(offenders).toEqual([]);
  });

  it("still has exactly one link, covering the whole card via a stretched-link overlay", () => {
    const { container } = render(
      <ProductCard product={product()} cdnBaseUrl="https://cdn.example" cartQuantity={0} />,
    );

    const anchors = container.querySelectorAll("a");
    expect(anchors).toHaveLength(1);
    expect(anchors[0].getAttribute("href")).toBe("/products/golden-paneer-500g");
    expect(anchors[0].className).toContain("after:absolute");
    expect(anchors[0].className).toContain("after:inset-0");
  });
});
