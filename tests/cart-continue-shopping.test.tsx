// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * #1302 — `/cart` always offers a way back to the shop. Before this, only the empty cart did
 * ("Start shopping" inside `CartContents`), so a shopper with items had to find the header.
 * `CartContents` is stubbed: it is shared with the drawer and deliberately untouched.
 */

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const getSummary = vi.fn();
vi.mock("@/lib/cart-service", () => ({ getCartRepository: () => ({ getSummary }) }));
vi.mock("@/lib/cart-identity", () => ({
  getCartIdentity: async () => ({ userId: null, guestToken: "g" }),
  getUserId: async () => null,
}));
vi.mock("@/features/lists/save-cart-as-list", () => ({ saveCartAsList: vi.fn() }));
vi.mock("@/lib/vendor-service", () => ({
  getCurrentVendorProfile: async () => ({ localityName: "Town" }),
}));
vi.mock("@/lib/config", () => ({ getEnv: () => ({ CDN_BASE_URL: "" }) }));
vi.mock("@/lib/fulfilment-service", () => ({ getFulfilmentMethod: async () => "DELIVERY" }));
vi.mock("@/lib/delivery-pricing-service", () => ({
  getShopperDeliveryRules: async () => ({ minimumOrderPence: 0, freeDeliveryThresholdPence: 0 }),
}));
vi.mock("@/components/cart/CartContents", () => ({ CartContents: () => <div /> }));
vi.mock("@/components/cart/MergePrompt", () => ({ MergePrompt: () => <div /> }));
vi.mock("@/components/cart/RestoreNotice", () => ({ RestoreNotice: () => <div /> }));

const { default: CartPage } = await import("@/app/(storefront)/cart/page");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("#1302 /cart Continue shopping (R13)", () => {
  it.each([
    ["an empty cart", []],
    ["a cart with lines", [{ productId: "p1", name: "Whole Milk 2L", quantity: 1 }]],
  ])("links back to /categories for %s", async (_label, lines) => {
    getSummary.mockResolvedValue({ lines, mergePending: false });
    const { container } = render(await CartPage({ searchParams: Promise.resolve({}) }));
    const link = [...container.querySelectorAll("a")].find(
      (a) => a.textContent?.trim() === "Continue shopping",
    );
    expect(link?.getAttribute("href")).toBe("/categories");
  });
});
