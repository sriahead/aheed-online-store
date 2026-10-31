// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CartDrawerShell } from "@/components/cart/CartDrawerShell";
import { FloatingContact } from "@/components/layout/FloatingContact";
import { ICON_3D_DEFINITIONS } from "@/lib/icons-3d/catalog";
import { renderIconSvg } from "@/lib/icons-3d/render";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    prefetch?: boolean;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/vendor-service", () => ({
  getCurrentVendorProfile: vi.fn().mockResolvedValue({
    id: "vendor-1",
    name: "Aheed Food Centre",
    localityName: "Milton Keynes",
  }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Icon Credits & Cart Tooltip Polish (#1257)", () => {
  it("R1: Cart trigger tooltip displays 'My Cart' and child SVG suppresses inner title to prevent tooltip interception", () => {
    const { container } = render(
      <CartDrawerShell itemCount={2} subtotalPence={1200}>
        <div>Drawer Body</div>
      </CartDrawerShell>,
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    // The button carries the sole user-facing tooltip
    expect(button?.getAttribute("title")).toBe("My Cart");

    // The inner SVG must have aria-hidden and no <title> tag that would hijack browser hover
    // #1288: 3D icons render inside IconMedallion; its root carries data-icon and the size.
    const svg = button?.querySelector("[data-medallion]");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.querySelector("title")).toBeNull();
  });

  it("R2: FloatingContact trigger tooltip displays 'Contact & Follow Hub' matching inner SVG title", () => {
    const { container } = render(
      <FloatingContact
        vendorName="Aheed Food Centre"
        facebookUrl="https://facebook.com/aheed"
        instagramUrl="https://instagram.com/aheed"
        whatsappNumber="07424242422"
        assistantAvailable={false}
      />,
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("title")).toBe("Contact & Follow Hub");

    // #1288: 3D icons render inside IconMedallion; its root carries data-icon and the size.
    // The button's title is the one tooltip; the decorative medallion adds no competing <title>.
    const svg = button?.querySelector("[data-medallion]");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.querySelector("title")).toBeNull();
  });

  it("R2: Catalog definitions have clean, professional names with no redundant '3D ' prefixes", () => {
    expect(ICON_3D_DEFINITIONS["cart-add"].name).toBe("My Cart");
    expect(ICON_3D_DEFINITIONS["delivery-van"].name).toBe("Delivery Van");
    expect(ICON_3D_DEFINITIONS["postcode-search"].name).toBe("Postcode Checker");
    expect(ICON_3D_DEFINITIONS["secure-checkout"].name).toBe("Secure Checkout Shield");
    expect(ICON_3D_DEFINITIONS["order-updates"].name).toBe("Notification Bell");
    expect(ICON_3D_DEFINITIONS["quick-shop"].name).toBe("Quick Shop");
    expect(ICON_3D_DEFINITIONS["storefront"].name).toBe("Supermarket Storefront");
    expect(ICON_3D_DEFINITIONS["user-profile"].name).toBe("User Profile");

    for (const [id, def] of Object.entries(ICON_3D_DEFINITIONS)) {
      expect(def.name).not.toMatch(/^3D\s/i);
    }
  });

  it("R2: renderIconSvg respects custom label in <title> when not decorative", () => {
    const rendered = renderIconSvg("cart-add", {
      decorative: false,
      label: "Custom Cart Label",
    });
    expect(rendered?.svg).toContain("<title>Custom Cart Label</title>");
  });

  it("R3 & R4: /icon-credits page renders all icon libraries and configurable 'Powered by' statement", async () => {
    const IconCreditsPage = (await import("@/app/(storefront)/icon-credits/page")).default;
    const view = await IconCreditsPage();
    const { container } = render(view);

    // Page title and breadcrumbs
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "Third-Party Credits & Licences",
    );

    // All 4 required third-party libraries
    expect(screen.getByText("Lucide Icons")).toBeTruthy();
    expect(screen.getByText("Google Noto Emoji")).toBeTruthy();
    expect(screen.getByText("Phosphor Icons")).toBeTruthy();
    expect(screen.getByText("Simple Icons")).toBeTruthy();

    // Licences & SPDX
    expect(screen.getByText("ISC License")).toBeTruthy();
    expect(screen.getByText("Apache-2.0")).toBeTruthy();
    expect(screen.getByText("MIT License")).toBeTruthy();
    expect(screen.getByText("CC0-1.0")).toBeTruthy();

    // Generated Icons Section
    const generatedHeading = screen.getByRole("heading", {
      level: 2,
      name: "Generated & Custom 3D Icons",
    });
    expect(generatedHeading).toBeTruthy();

    // "Powered by" badge exists
    const poweredBadge = screen.getByTestId("platform-powered-badge");
    expect(poweredBadge).toBeTruthy();
    expect(poweredBadge.textContent).toContain("Powered by");

    // Raw licences link
    const rawLicencesLink = container.querySelector('a[href="/third-party-icon-licenses.txt"]');
    expect(rawLicencesLink).not.toBeNull();
  });
});
