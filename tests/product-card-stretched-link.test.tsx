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
    expectedRestockDay: null,
    tier: null,
    ...overrides,
  };
}

describe("ProductCard — Quick View triggers, no detail-page drill-down, no nested interactive content", () => {
  it("renders no link navigating to a separate product detail page", () => {
    const { container } = render(
      <ProductCard product={product()} cdnBaseUrl="https://cdn.example" cartQuantity={0} />,
    );

    const detailLinks = Array.from(container.querySelectorAll("a")).filter((a) =>
      a.getAttribute("href")?.startsWith("/products/"),
    );
    expect(
      detailLinks,
      "Product card must not navigate to separate product detail page; drill-down is replaced by Quick View",
    ).toEqual([]);
  });

  it("renders no <button> as a descendant of another <button> or <a>, with product not in cart", () => {
    const { container } = render(
      <ProductCard product={product()} cdnBaseUrl="https://cdn.example" cartQuantity={0} />,
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    const nestedButtons = buttons.flatMap((b) => Array.from(b.querySelectorAll("button")));
    expect(nestedButtons, "HTML forbids nested interactive buttons").toEqual([]);

    const anchors = Array.from(container.querySelectorAll("a"));
    const buttonsInAnchors = anchors.flatMap((a) => Array.from(a.querySelectorAll("button")));
    expect(buttonsInAnchors, "HTML forbids button inside anchor").toEqual([]);
  });

  it("renders no <button> as a descendant of another <button> or <a>, with product already in cart", () => {
    const { container } = render(
      <ProductCard product={product()} cdnBaseUrl="https://cdn.example" cartQuantity={2} />,
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    const nestedButtons = buttons.flatMap((b) => Array.from(b.querySelectorAll("button")));
    expect(nestedButtons).toEqual([]);

    const anchors = Array.from(container.querySelectorAll("a"));
    const buttonsInAnchors = anchors.flatMap((a) => Array.from(a.querySelectorAll("button")));
    expect(buttonsInAnchors).toEqual([]);
  });

  it("renders desktop and mobile Quick View triggers", () => {
    const { container } = render(
      <ProductCard product={product()} cdnBaseUrl="https://cdn.example" cartQuantity={0} />,
    );

    // Desktop Quick View button
    const buttons = Array.from(container.querySelectorAll("button"));
    const desktopTrigger = buttons.find((b) => b.textContent?.includes("Quick View"));
    expect(desktopTrigger).toBeDefined();

    // Mobile compact Quick View button
    const mobileTrigger = buttons.find(
      (b) => b.getAttribute("aria-label") === "Quick view Golden Paneer 500g",
    );
    expect(mobileTrigger).toBeDefined();

    // Title Quick View trigger button
    const titleTrigger = buttons.find((b) => b.textContent?.trim() === "Golden Paneer 500g");
    expect(titleTrigger).toBeDefined();
  });
});
