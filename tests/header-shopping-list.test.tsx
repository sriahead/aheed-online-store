// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * #1131 R25 (and R17's wiring) — the header's Shopping List link and department selector.
 *
 * P8.5f hid the "Shop List" link on the landing page, so the owner found no Shopping List entry
 * there. It now renders on every non-portal route, with an `aria-label` because its visible text
 * is hidden below `sm`, and the label and visible text agree (WCAG 2.5.3, label in name). #1145
 * renamed it from "Shopping List" to "Quick Shop", and #1187 repointed it from the paste-a-list
 * page to the new Quick Shop hub — the name stayed, the destination changed.
 * Everything else `Header` renders is stubbed: each piece has its own
 * test, and this one is about which links and departments the header puts in front of a shopper.
 */

// #1169 — the header reads the whole tree, so subcategories are offered under their department.
const listTree = vi.hoisted(() =>
  vi.fn(async () => [
    { id: "1", slug: "dept-one", name: "Dept One", parentId: null, isActive: true },
    { id: "2", slug: "dept-two", name: "Dept Two", parentId: null, isActive: true },
    { id: "3", slug: "two-child", name: "Two Child", parentId: "2", isActive: true },
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
vi.mock("@/lib/categories-service", () => ({ getCategoryRepository: () => ({ listTree }) }));
vi.mock("@/components/layout/HeaderBrand", () => ({ HeaderBrand: () => null }));
vi.mock("@/components/layout/LocationControl", () => ({ LocationControl: () => null }));
vi.mock("@/components/layout/ViewSwitcher", () => ({ ViewSwitcher: () => null }));
vi.mock("@/components/cart/CartDrawerShell", () => ({ CartDrawerShell: () => null }));
vi.mock("@/components/cart/CartContents", () => ({ CartContents: () => null }));

const { Header } = await import("@/components/layout/Header");

afterEach(() => {
  cleanup();
  listTree.mockClear();
});

describe("Header Shopping List link (#1131 R25, #1251)", () => {
  for (const isLanding of [true, false]) {
    // #1251 — Quick Shop sits prominently inside Main Navigation beside Shop on all screen sizes.
    it(`renders on ${isLanding ? "the landing page" : "other storefront pages"} inside Main Navigation`, async () => {
      render(await Header({ isLanding }));
      const nav = screen.getByRole("navigation", { name: "Main Navigation" });
      const links = screen.getAllByRole("link", { name: "Quick Shop" });
      expect(links).toHaveLength(1);
      const link = links[0];

      expect(link.getAttribute("href")).toBe("/quick-shop");
      expect(link.getAttribute("aria-label")).toBe("Quick Shop");
      expect(link.textContent?.trim().toLowerCase()).toBe("quick shop");
      expect(nav.contains(link)).toBe(true);
      expect(link.closest("form")).toBeNull();
    });

    it(`positions Quick Shop directly beside Shop in Main Navigation on ${isLanding ? "the landing page" : "other storefront pages"} (#1251)`, async () => {
      render(await Header({ isLanding }));
      const nav = screen.getByRole("navigation", { name: "Main Navigation" });
      const shopLink = screen.getByRole("link", { name: "Shop" });
      const quickShopLink = screen.getByRole("link", { name: "Quick Shop" });

      expect(nav.contains(shopLink)).toBe(true);
      expect(nav.contains(quickShopLink)).toBe(true);
      expect(shopLink.nextElementSibling).toBe(quickShopLink);
    });
  }

  it("renders no Shopping List link in the staff portal", async () => {
    render(await Header({ isPortal: true }));
    expect(screen.queryByRole("link", { name: "Quick Shop" })).toBeNull();
  });
});

describe("Header department selector wiring (#1131 R17)", () => {
  it("offers exactly the categories listTree() returns, in both search bars (#1169)", async () => {
    render(await Header({}));
    expect(listTree).toHaveBeenCalledTimes(1);
    const selects = screen.getAllByRole("combobox", {
      name: "Search department",
    }) as unknown as HTMLSelectElement[];
    // One bar per breakpoint (desktop slot and the below-`sm` row).
    expect(selects).toHaveLength(2);
    for (const select of selects) {
      expect([...select.options].map((o) => o.value)).toEqual([
        "",
        "dept-one",
        "dept-two",
        "two-child",
      ]);
    }
  });

  it("does not read departments for the staff portal, which has no search bar", async () => {
    render(await Header({ isPortal: true }));
    expect(listTree).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox", { name: "Search department" })).toBeNull();
  });
});

describe("Header Sign In icon (#1173 R8)", () => {
  it("shows the round user icon in the signed-out Sign In link", async () => {
    const { container } = render(await Header({}));
    const signIn = container.querySelector('a[href="/login"]');
    expect(signIn?.textContent).toContain("Sign In");
    expect(signIn?.querySelector('svg[data-icon="circle-user-round"]')).not.toBeNull();
    expect(signIn?.querySelector('svg[data-icon="log-in"]')).toBeNull();
  });
});
