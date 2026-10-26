// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { Icon3D, ICON_3D_IMAGE_ASSETS, type Icon3DName } from "@/components/icons/Icon3D";

afterEach(cleanup);

const EXPECTED_3D_ICONS: Icon3DName[] = [
  "storefront",
  "quick-shop",
  "user-profile",
  "rewards-gift",
  "rewards-coin",
  "cart-add",
  "delivery-van",
  "halal-certified",
  "secure-checkout",
  "order-updates",
  "postcode-search",
  "contact-follow",
];

describe("Realistic 3D Icon Suite & Asset Delivery (#1280)", () => {
  it("registers all 12 3D rendered assets in ICON_3D_IMAGE_ASSETS", () => {
    for (const name of EXPECTED_3D_ICONS) {
      const asset = ICON_3D_IMAGE_ASSETS[name];
      expect(asset).toBeDefined();
      expect(asset?.png).toBe(`/images/icons-3d/${name}.png`);
      expect(asset?.webp).toBe(`/images/icons-3d/${name}.webp`);
    }
  });

  it("verifies physical PNG and WebP files exist on disk with valid file size bounds", () => {
    const iconsDir = path.resolve(process.cwd(), "public/images/icons-3d");
    expect(fs.existsSync(iconsDir)).toBe(true);

    for (const name of EXPECTED_3D_ICONS) {
      const pngPath = path.join(iconsDir, `${name}.png`);
      const webpPath = path.join(iconsDir, `${name}.webp`);

      expect(fs.existsSync(pngPath), `Missing ${name}.png`).toBe(true);
      expect(fs.existsSync(webpPath), `Missing ${name}.webp`).toBe(true);

      const pngStat = fs.statSync(pngPath);
      const webpStat = fs.statSync(webpPath);

      // File sizes should be optimized: between 10KB and 120KB
      expect(pngStat.size).toBeGreaterThan(10 * 1024);
      expect(pngStat.size).toBeLessThan(120 * 1024);

      expect(webpStat.size).toBeGreaterThan(5 * 1024);
      expect(webpStat.size).toBeLessThan(100 * 1024);
    }
  });

  it("renders <picture> and <img> elements in auto mode when image asset is registered", () => {
    const { container } = render(<Icon3D name="storefront" size={28} />);
    const picture = container.querySelector("picture");
    expect(picture).not.toBeNull();

    const source = picture?.querySelector("source");
    expect(source?.getAttribute("srcset")).toBe("/images/icons-3d/storefront.webp");

    const img = picture?.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/images/icons-3d/storefront.png");
    expect(img?.getAttribute("width")).toBe("28");
    expect(img?.getAttribute("height")).toBe("28");
    expect(img?.getAttribute("loading")).toBe("eager");
    expect(img?.getAttribute("decoding")).toBe("async");

    // Seamless SVG fallback is present for instant paint and testing parity
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("renders pure <img> without SVG when renderAs='image'", () => {
    const { container } = render(<Icon3D name="quick-shop" size={24} renderAs="image" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/images/icons-3d/quick-shop.png");

    const svg = container.querySelector("svg");
    expect(svg).toBeNull();
  });

  it("renders procedural SVG only when renderAs='svg'", () => {
    const { container } = render(<Icon3D name="storefront" size={24} renderAs="svg" />);
    const img = container.querySelector("img");
    expect(img).toBeNull();

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("falls back gracefully to procedural SVG when icon has no image asset", () => {
    // fruit-veg is in ICON_3D_DEFINITIONS but not in ICON_3D_IMAGE_ASSETS
    expect(ICON_3D_IMAGE_ASSETS["fruit-veg" as Icon3DName]).toBeUndefined();

    const { container } = render(<Icon3D name="fruit-veg" size={32} />);
    const img = container.querySelector("img");
    expect(img).toBeNull();

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("handles decorative attribute correctly by silencing alt text and setting aria-hidden", () => {
    const { container } = render(<Icon3D name="rewards-coin" size={20} decorative />);
    const wrapper = container.querySelector("[data-icon]");
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
    const img = container.querySelector("img");
    expect(img?.getAttribute("alt")).toBe("");
  });

  it("propagates custom label into image alt when provided", () => {
    const { container } = render(
      <Icon3D name="halal-certified" size={32} label="Official HMC Halal Certified" />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("alt")).toBe("Official HMC Halal Certified");
  });
});
