// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ProductCard } from "@/components/product/ProductCard";
import type { ProductSummary } from "@/lib/repositories/products";

// Same reason as tests/product-card-stretched-link.test.tsx: the cart controls import server
// actions that reach `@/lib/db`, which Vitest cannot load.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));

/**
 * #918 R29 — values of filters marked "Show on product cards": up to three values on one line,
 * the full "Name: Value" list in the title, and no element at all when there are none (so a
 * grocery card is unchanged).
 */

afterEach(cleanup);

function product(cardSpecifications: ProductSummary["cardSpecifications"]): ProductSummary {
  return {
    id: "prod-1",
    slug: "gan-charger",
    name: "65W GaN Wall Charger",
    basePrice: 2999,
    unitLabel: "£29.99 each",
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
    averageRating: 0,
    reviewCount: 0,
    inStock: true,
    stockQuantity: 20,
    lowStockThreshold: 3,
    expectedRestockDay: null,
    tier: null,
    cardSpecifications,
  };
}

function renderCard(specs: ProductSummary["cardSpecifications"]) {
  return render(
    <ProductCard product={product(specs)} cdnBaseUrl="https://cdn.example" cartQuantity={0} />,
  ).container;
}

describe("ProductCard card specifications (#918)", () => {
  it("renders no specification element when there are none", () => {
    expect(renderCard([]).querySelector("[data-card-specs]")).toBeNull();
  });

  it("shows three values on the line and all four in the title", () => {
    const element = renderCard([
      { name: "Colour", value: "White" },
      { name: "Connectivity", value: "Wired" },
      { name: "Power", value: "65 W" },
      { name: "Ports", value: "3" },
    ]).querySelector("[data-card-specs]");
    expect(element?.textContent).toBe("White · Wired · 65 W");
    expect(element?.getAttribute("title")).toBe(
      "Colour: White · Connectivity: Wired · Power: 65 W · Ports: 3",
    );
  });
});
