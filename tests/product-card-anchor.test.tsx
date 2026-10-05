// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
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

const openQuickView = vi.fn();
vi.mock("@/components/product/quick-view-context", () => ({
  useQuickView: () => ({ openQuickView }),
}));

/**
 * The product card's title is a REAL link, with Quick View layered on top (#955).
 *
 * THIS FILE WAS `product-card-stretched-link.test.tsx` AND ASSERTED THE OPPOSITE. Its first case
 * was named "renders no link navigating to a separate product detail page" and passed because
 * `#830` had replaced the title's `<Link>` with a `<button>`. That was the defect: a listing page
 * contained zero `href="/products/…"`, so a crawler reaching a category page found no route down
 * and neither did a visitor with JavaScript off. `#955`'s owner ruling restores the anchor and
 * keeps Quick View as the click behaviour, so the old expectation is inverted here rather than
 * left to rot in a second file that disagrees with this one.
 *
 * What survives unchanged from `#351`/`#656` is the nesting rule, and it matters MORE now than it
 * did while the title was a button: there is an `<a>` in the card again, and
 * `AddToCartButton`/`CartQuantityStepper` render real `<button>` elements, which HTML forbids
 * inside an anchor. Those cases are kept verbatim.
 *
 * `vitest.config.mts` sets `environment: "node"` globally, so the docblock at the top opts this
 * file into a DOM — same pattern as `tests/product-card-image.test.tsx`.
 */

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

describe("ProductCard — title anchor with Quick View layered on top (#955)", () => {
  it("renders the title as an anchor to the product page, not a button (R1)", () => {
    const { container } = render(
      <ProductCard product={product()} cdnBaseUrl="https://cdn.example" cartQuantity={0} />,
    );

    const titleAnchor = container.querySelector('h3 a[href="/products/golden-paneer-500g"]');
    expect(titleAnchor, "the title must be a real link to the product page").toBeTruthy();
    expect(titleAnchor?.textContent?.trim()).toBe("Golden Paneer 500g");
    // The pre-#955 markup: a <button> carrying the title text inside the heading.
    expect(container.querySelector("h3 button")).toBeNull();
  });

  it("opens Quick View and prevents navigation when the title is clicked (R2)", () => {
    const { container } = render(
      <ProductCard product={product()} cdnBaseUrl="https://cdn.example" cartQuantity={0} />,
    );

    const titleAnchor = container.querySelector("h3 a") as HTMLAnchorElement;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(titleAnchor, click);

    // `defaultPrevented` is the observable form of the handler calling preventDefault(): without
    // it, a left-click would navigate and the drawer would never be seen.
    expect(click.defaultPrevented, "a left-click must not navigate").toBe(true);
    expect(openQuickView).toHaveBeenCalledTimes(1);
    expect(openQuickView).toHaveBeenCalledWith("golden-paneer-500g", expect.anything());
  });

  it("does not stretch the anchor over the whole card (R4)", () => {
    const { container } = render(
      <ProductCard product={product()} cdnBaseUrl="https://cdn.example" cartQuantity={0} />,
    );

    const titleAnchor = container.querySelector("h3 a") as HTMLAnchorElement;
    const classes = titleAnchor.getAttribute("class") ?? "";
    // The stretched variant was considered and rejected at /propose — see the card's header
    // comment. If a later slice restores it, this expectation is the thing to change knowingly.
    expect(classes).not.toContain("after:inset-0");
    expect(classes).not.toContain("after:absolute");
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

  it("still renders both Quick View triggers (R5)", () => {
    const { container } = render(
      <ProductCard product={product()} cdnBaseUrl="https://cdn.example" cartQuantity={0} />,
    );

    const buttons = Array.from(container.querySelectorAll("button"));

    const desktopTrigger = buttons.find((b) => b.textContent?.includes("Quick View"));
    expect(desktopTrigger).toBeDefined();

    const mobileTrigger = buttons.find(
      (b) => b.getAttribute("aria-label") === "Quick view Golden Paneer 500g",
    );
    expect(mobileTrigger).toBeDefined();

    // #961 — the mobile trigger's 44px hit area is the BUTTON, not the visible circle inside it.
    // Measured for real at phone widths by scripts/verify-mobile-layout.ts; asserted here only as
    // the class that carries it, so a refactor that drops it fails fast.
    expect(mobileTrigger?.getAttribute("class") ?? "").toContain("size-tap");
  });
});
