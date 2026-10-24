// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ICON_3D_DEFINITIONS } from "@/lib/icons-3d/catalog";
import { renderIconSvg } from "@/lib/icons-3d/render";
import { GET as getIconManifest } from "@/app/api/icons/route";
import { GET as getIconSvg } from "@/app/api/icons/[id]/route";
import { ShoppingListLink } from "@/components/layout/ShoppingListLink";
import { FloatingContact } from "@/components/layout/FloatingContact";
import { RewardsLauncher } from "@/components/rewards/RewardsLauncher";
import { CartDrawerShell } from "@/components/cart/CartDrawerShell";

// Mock dependencies for Header tests
const listTree = vi.hoisted(() =>
  vi.fn(async () => [
    { id: "1", slug: "dept-one", name: "Dept One", parentId: null, isActive: true },
  ]),
);

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:8787" }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
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

let mockUser: { id: string; name: string } | null = null;

vi.mock("@/lib/auth", () => ({
  getAuth: async () => ({
    api: {
      getSession: async () => (mockUser ? { user: mockUser } : null),
    },
  }),
}));
vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole: async () => ({ ok: false, status: 401 }) }));
vi.mock("@/lib/config", () => ({ getEnv: () => ({ CDN_BASE_URL: "" }) }));
vi.mock("@/lib/vendor-service", () => ({
  getCurrentVendorProfile: async () => ({
    name: "Aheed Food Centre",
    localityName: "Milton Keynes",
    bannerNote: null,
    bannerHeadline: null,
    contactPhone: null,
    deliveryPrefixes: [],
    offerCollection: false,
    searchPlaceholder: "Search groceries",
    logoStorageKey: null,
    markStorageKey: null,
  }),
}));
vi.mock("@/lib/cart-summary", () => ({
  getRequestCartSummary: async () => ({ itemCount: 3, subtotalPence: 2896, lines: [] }),
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
vi.mock("@/components/cart/CartContents", () => ({ CartContents: () => null }));

const { Header } = await import("@/components/layout/Header");

afterEach(() => {
  cleanup();
  mockUser = null;
  listTree.mockClear();
});

describe("Navigation & Icon Improvements (#1251)", () => {
  it("registers user-profile in ICON_3D_DEFINITIONS, bringing total catalog to 20 icons", () => {
    const keys = Object.keys(ICON_3D_DEFINITIONS);
    expect(keys).toContain("user-profile");
    expect(keys.length).toBe(20);

    const userProfile = ICON_3D_DEFINITIONS["user-profile"];
    expect(userProfile.name).toBe("User Profile");
    expect(userProfile.category).toBe("general");
    expect(userProfile.tags).toContain("profile");
    expect(userProfile.tags).toContain("avatar");
  });

  it("serves user-profile SVG from manifest and detail endpoints", async () => {
    const manifestReq = new Request("http://localhost:3000/api/icons");
    const manifestRes = await getIconManifest(manifestReq);
    expect(manifestRes.status).toBe(200);
    const json = (await manifestRes.json()) as { totalIcons: number; icons: Array<{ id: string }> };
    expect(json.totalIcons).toBe(20);
    expect(json.icons.some((i) => i.id === "user-profile")).toBe(true);

    const detailReq = new Request("http://localhost:3000/api/icons/user-profile");
    const detailRes = await getIconSvg(detailReq, {
      params: Promise.resolve({ id: "user-profile" }),
    });
    expect(detailRes.status).toBe(200);
    const svg = await detailRes.text();
    expect(svg).toContain('data-icon="user-profile"');
  });

  it("renders valid multi-layered SVG artwork for user-profile", () => {
    const rendered = renderIconSvg("user-profile", { theme: "light", animated: true });
    expect(rendered).not.toBeNull();
    const svg = rendered!.svg;
    expect(svg).toContain("<svg");
    expect(svg).toContain('viewBox="0 0 96 96"');
    expect(svg).toContain("soft-");
  });

  it("positions Quick Shop directly inside Main Navigation beside Shop across viewports (R1)", async () => {
    render(await Header({ isLanding: false }));
    const nav = screen.getByRole("navigation", { name: "Main Navigation" });
    const shop = screen.getByRole("link", { name: "Shop" });
    const quickShop = screen.getByRole("link", { name: "Quick Shop" });

    expect(nav.contains(shop)).toBe(true);
    expect(nav.contains(quickShop)).toBe(true);
    expect(shop.nextElementSibling).toBe(quickShop);

    // Verify touch target classes for mobile / tablet
    expect(quickShop.className).toContain("min-h-tap");
    expect(quickShop.className).toContain("min-w-tap");
  });

  it("enlarges FloatingContact 3D icon to size={38} and enhances tooltip (R2)", () => {
    const { container } = render(
      <FloatingContact
        vendorName="Aheed Food Centre"
        whatsappNumber="441234567890"
        instagramUrl="https://instagram.com/aheed"
        facebookUrl="https://facebook.com/aheed"
        assistantAvailable={false}
      />,
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("title")).toContain("Contact & Follow Hub");

    const svg = container.querySelector('svg[data-icon="users"]');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("38");
    expect(svg?.getAttribute("height")).toBe("38");
  });

  it("enlarges Header Shop and Quick Shop 3D icons to size={24} (R2)", async () => {
    const { container } = render(await Header({ isLanding: false }));
    const shopSvg = container.querySelector('svg[data-icon="storefront"]');
    const quickShopSvg = container.querySelector('svg[data-icon="quick-shop"]');

    expect(shopSvg).not.toBeNull();
    expect(shopSvg?.getAttribute("width")).toBe("24");
    expect(shopSvg?.getAttribute("height")).toBe("24");

    expect(quickShopSvg).not.toBeNull();
    expect(quickShopSvg?.getAttribute("width")).toBe("24");
    expect(quickShopSvg?.getAttribute("height")).toBe("24");
  });

  it("replaces user letter initial with 3D user-profile icon in signed-in state (R3)", async () => {
    mockUser = { id: "user-123", name: "Antigravity Dev" };
    const { container } = render(await Header({ isLanding: false }));

    const accountLink = container.querySelector('a[href="/account"]');
    expect(accountLink).not.toBeNull();
    // Must NOT contain the bare initial "A" in a 10px font circle
    expect(accountLink?.querySelector(".text-\\[10px\\]")).toBeNull();

    // Must render the 3D user icon
    const userSvg = accountLink?.querySelector('svg[data-icon="user"]');
    expect(userSvg).not.toBeNull();
    expect(userSvg?.getAttribute("width")).toBe("24");
  });

  it("renders 3D user-profile icon in signed-out state with clear tooltip (R3)", async () => {
    mockUser = null;
    const { container } = render(await Header({ isLanding: false }));

    const loginLink = container.querySelector('a[href="/login"]');
    expect(loginLink).not.toBeNull();
    expect(loginLink?.getAttribute("title")).toContain("Sign in");

    const userSvg = loginLink?.querySelector('svg[data-icon="circle-user-round"]');
    expect(userSvg).not.toBeNull();
    expect(userSvg?.getAttribute("width")).toBe("24");
  });

  it("enlarges Cart and Rewards 3D icons with informative tooltips (R2)", () => {
    const { container: cartContainer } = render(
      <CartDrawerShell itemCount={4} subtotalPence={2896}>
        <div>Cart body</div>
      </CartDrawerShell>,
    );
    const cartButton = cartContainer.querySelector("button");
    expect(cartButton?.getAttribute("title")).toBe("My Cart");
    const cartSvg = cartContainer.querySelector('svg[data-icon="shopping-cart"]');
    expect(cartSvg?.getAttribute("width")).toBe("28");

    const { container: rewardsContainer } = render(
      <RewardsLauncher vendorName="Aheed Food Centre" />,
    );
    const rewardsButton = rewardsContainer.querySelector("button");
    expect(rewardsButton?.getAttribute("title")).toBe("Rewards & Loyalty Points");
    const rewardsSvg = rewardsContainer.querySelector('svg[data-icon="rewards-coin"]');
    expect(rewardsSvg?.getAttribute("width")).toBe("24");
  });
});
