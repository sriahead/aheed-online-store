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
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";
import { DepartmentGlyph } from "@/components/layout/DepartmentGlyph";
import { department3DIcon } from "@/components/icons/illustrations";

afterEach(cleanup);

describe("3D Icon Suite Expansion (#1248)", () => {
  it("registers storefront, quick-shop, and contact-follow in ICON_3D_DEFINITIONS", () => {
    const keys = Object.keys(ICON_3D_DEFINITIONS);
    expect(keys).toContain("storefront");
    expect(keys).toContain("quick-shop");
    expect(keys).toContain("contact-follow");
    expect(keys.length).toBeGreaterThanOrEqual(19);

    const storefront = ICON_3D_DEFINITIONS["storefront"];
    expect(storefront.name).toBe("3D Supermarket Storefront");
    expect(storefront.category).toBe("navigation");

    const quickShop = ICON_3D_DEFINITIONS["quick-shop"];
    expect(quickShop.name).toBe("3D Quick Shop Bag");
    expect(quickShop.category).toBe("commerce");

    const contactFollow = ICON_3D_DEFINITIONS["contact-follow"];
    expect(contactFollow.name).toBe("Contact & Follow Hub");
    expect(contactFollow.category).toBe("general");
  });

  it("renders valid multi-layered SVG artwork for all 3 new icons", () => {
    for (const name of ["storefront", "quick-shop", "contact-follow"] as const) {
      const rendered = renderIconSvg(name, {
        theme: "light",
        animated: true,
      });
      expect(rendered).not.toBeNull();
      const svg = rendered!.svg;
      expect(svg).toContain("<svg");
      expect(svg).toContain('viewBox="0 0 96 96"');
      expect(svg).toContain('role="img"');
      expect(svg).toContain("prefers-reduced-motion: reduce");
      expect(svg).not.toContain("<script");
    }
  });

  it("manifest endpoint GET /api/icons lists 19 icons including new additions", async () => {
    const req = new Request("http://localhost:3000/api/icons");
    const res = await getIconManifest(req);

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      totalIcons: number;
      icons: Array<{ id: string; name: string }>;
    };
    expect(json.totalIcons).toBeGreaterThanOrEqual(19);
    const ids = json.icons.map((i) => i.id);
    expect(ids).toContain("storefront");
    expect(ids).toContain("quick-shop");
    expect(ids).toContain("contact-follow");
  });

  it("GET /api/icons/[id] serves SVGs for the new icons", async () => {
    for (const id of ["storefront", "quick-shop", "contact-follow"]) {
      const req = new Request(`http://localhost:3000/api/icons/${id}`);
      const res = await getIconSvg(req, { params: Promise.resolve({ id }) });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("image/svg+xml");
      const text = await res.text();
      expect(text.startsWith("<svg")).toBe(true);
      expect(text.endsWith("</svg>")).toBe(true);
    }
  });

  it("ShoppingListLink renders 3D quick-shop icon while preserving accessible name", () => {
    const { container } = render(<ShoppingListLink />);
    const link = screen.getByRole("link", { name: "Quick Shop" });
    expect(link.getAttribute("href")).toBe("/quick-shop");
    expect(link.getAttribute("aria-label")).toBe("Quick Shop");

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("data-icon")).toBe("quick-shop");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("FloatingContact renders 3D contact-follow icon when closed", () => {
    const { container } = render(
      <FloatingContact
        vendorName="Aheed Food Centre"
        whatsappNumber="441234567890"
        instagramUrl="https://instagram.com/aheed"
        facebookUrl="https://facebook.com/aheed"
        assistantAvailable={false}
      />,
    );

    const button = container.querySelector(
      'button[aria-label="Contact and follow Aheed Food Centre"]',
    );
    expect(button).not.toBeNull();

    const svg = button?.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.querySelector("title")?.textContent).toBe("Contact & Follow Hub");
  });

  it("RewardsLauncher renders 3D rewards-coin icon when closed", () => {
    const { container } = render(<RewardsLauncher vendorName="Aheed Food Centre" />);
    const button = screen.getByRole("button", { name: "Open rewards and loyalty panel" });
    expect(button).not.toBeNull();

    const svg = button.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("data-icon")).toBe("rewards-coin");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("department3DIcon resolves 3D icons for grocery departments and null for unmapped", () => {
    expect(department3DIcon("fruit-veg")).toBe("fruit-veg");
    expect(department3DIcon("bakery")).toBe("bakery");
    expect(department3DIcon("dairy-eggs")).toBe("dairy-eggs");
    expect(department3DIcon("halal-meat")).toBe("halal-meat");
    expect(department3DIcon("groceries")).toBe("cart-add");
    expect(department3DIcon("beverages")).toBe("beverages");
    expect(department3DIcon("snacks")).toBe("snacks");
    expect(department3DIcon("frozen-foods")).toBe("frozen-foods");
    expect(department3DIcon("household")).toBe("household");

    expect(department3DIcon("international")).toBeNull();
    expect(department3DIcon("chargers")).toBeNull();
  });

  it("DepartmentScroller with use3D=true renders 3D icons for mapped categories", () => {
    const categories = [
      { id: "1", slug: "fruit-veg", name: "Fruit & Veg" },
      { id: "2", slug: "international", name: "World Food" },
      { id: "3", slug: "chargers", name: "Chargers" },
    ];

    const { container } = render(<DepartmentScroller categories={categories} use3D />);

    // 1. fruit-veg renders 3D icon inline SVG
    const fruitTile = container.querySelector("a[href='/categories/fruit-veg']")!;
    const fruitSvg = fruitTile.querySelector("svg");
    expect(fruitSvg).not.toBeNull();
    expect(fruitSvg?.getAttribute("data-icon")).toBe("fruit-veg");
    expect(fruitSvg?.getAttribute("aria-hidden")).toBe("true");

    // 2. international has no 3D icon, so falls back to Phase 4a ImageWithFallback <img>
    const intlTile = container.querySelector("a[href='/categories/international']")!;
    expect(intlTile.querySelector("img")?.getAttribute("src")).toBe(
      "/illustrations/departments/international.svg",
    );

    // 3. chargers has neither, so falls back to neutral tag glyph
    const chargersTile = container.querySelector("a[href='/categories/chargers']")!;
    expect(chargersTile.querySelector("img")).toBeNull();
    expect(chargersTile.querySelector("svg")?.getAttribute("data-icon")).toBe("tag");
  });

  it("DepartmentGlyph with use3D=true renders 3D icon for halal-meat", () => {
    const { container } = render(<DepartmentGlyph slug="halal-meat" use3D />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.querySelector("title")?.textContent).toBe("3D Prime Halal Cut");
  });
});
