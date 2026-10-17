// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * #1131 R25 (and R17's wiring) — the header's Shopping List link and department selector.
 *
 * P8.5f hid the "Shop List" link on the landing page, so the owner found no Shopping List entry
 * there. It now renders on every non-portal route, with `aria-label="Shopping list"` because its
 * visible text is hidden below `sm`, and with the visible text "Shopping List" so the two agree
 * (WCAG 2.5.3, label in name). Everything else `Header` renders is stubbed: each piece has its own
 * test, and this one is about which links and departments the header puts in front of a shopper.
 */

const listTopLevel = vi.hoisted(() =>
  vi.fn(async () => [
    { id: "1", slug: "dept-one", name: "Dept One" },
    { id: "2", slug: "dept-two", name: "Dept Two" },
  ]),
);

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:8787" }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/auth", () => ({ getAuth: async () => ({ api: { getSession: async () => null } }) }));
vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole: async () => ({ ok: false, status: 401 }) }));
vi.mock("@/lib/config", () => ({ getEnv: () => ({ CDN_BASE_URL: "" }) }));
vi.mock("@/lib/vendor-service", () => ({
  getCurrentVendorProfile: async () => ({
    name: "Test Store",
    localityName: "Testville",
    bannerNote: null,
    bannerHeadline: null,
    contactPhone: null,
    deliveryPrefixes: [],
    offerCollection: false,
    searchPlaceholder: "Find something",
    logoStorageKey: null,
    markStorageKey: null,
  }),
}));
vi.mock("@/lib/cart-summary", () => ({
  getRequestCartSummary: async () => ({ itemCount: 0, subtotalPence: 0, lines: [] }),
}));
vi.mock("@/lib/delivery-eligibility-service", () => ({ isPostcodeDeliverable: async () => null }));
vi.mock("@/lib/fulfilment-service", () => ({ getFulfilmentMethod: async () => "DELIVERY" }));
vi.mock("@/lib/delivery-pricing-service", () => ({
  getShopperDeliveryRules: async () => ({ minimumOrderPence: 0, freeDeliveryThresholdPence: null }),
}));
vi.mock("@/lib/categories-service", () => ({ getCategoryRepository: () => ({ listTopLevel }) }));
vi.mock("@/components/layout/HeaderBrand", () => ({ HeaderBrand: () => null }));
vi.mock("@/components/layout/LocationControl", () => ({ LocationControl: () => null }));
vi.mock("@/components/layout/ViewSwitcher", () => ({ ViewSwitcher: () => null }));
vi.mock("@/components/cart/CartDrawerShell", () => ({ CartDrawerShell: () => null }));
vi.mock("@/components/cart/CartContents", () => ({ CartContents: () => null }));

const { Header } = await import("@/components/layout/Header");

afterEach(() => {
  cleanup();
  listTopLevel.mockClear();
});

describe("Header Shopping List link (#1131 R25)", () => {
  for (const isLanding of [true, false]) {
    it(`renders on ${isLanding ? "the landing page" : "other storefront pages"} with one accessible name`, async () => {
      render(await Header({ isLanding }));
      const link = screen.getByRole("link", { name: "Shopping list" });
      expect(link.getAttribute("href")).toBe("/shop-your-list");
      expect(link.getAttribute("aria-label")).toBe("Shopping list");
      // The visible text is contained in the accessible name.
      expect(link.textContent?.trim().toLowerCase()).toBe("shopping list");
    });
  }

  it("renders no Shopping List link in the staff portal", async () => {
    render(await Header({ isPortal: true }));
    expect(screen.queryByRole("link", { name: "Shopping list" })).toBeNull();
  });
});

describe("Header department selector wiring (#1131 R17)", () => {
  it("offers exactly the departments listTopLevel() returns, in both search bars", async () => {
    render(await Header({}));
    expect(listTopLevel).toHaveBeenCalledTimes(1);
    const selects = screen.getAllByRole("combobox", {
      name: "Search department",
    }) as unknown as HTMLSelectElement[];
    // One bar per breakpoint (desktop slot and the below-`sm` row).
    expect(selects).toHaveLength(2);
    for (const select of selects) {
      expect([...select.options].map((o) => o.value)).toEqual(["", "dept-one", "dept-two"]);
    }
  });

  it("does not read departments for the staff portal, which has no search bar", async () => {
    render(await Header({ isPortal: true }));
    expect(listTopLevel).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox", { name: "Search department" })).toBeNull();
  });
});
