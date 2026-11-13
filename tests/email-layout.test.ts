import { describe, expect, it } from "vitest";
import {
  contrastWithWhite,
  emailBrandFrom,
  FALLBACK_BACKGROUND,
  FALLBACK_PRIMARY,
  safeBackground,
  safePrimary,
} from "@/lib/email/layout/brand";
import { fallbackBrand } from "@/lib/email/layout/fallback";
import { renderEmail, type EmailContent } from "@/lib/email/layout/render";
import { htmlToText } from "@/lib/email/layout/text";

/** #1564 R1–R4 — the one email layout, the brand it reads, and the plain-text part. */

const brand = emailBrandFrom({
  storeName: "Corner Shop",
  markStorageKey: "vendors/v1/mark-1/512.png",
  primaryHex: "#192f8a",
  backgroundHex: "#f3f4f7",
  location: { addressLine1: "1 High St", addressLine2: null, city: "Town", postcode: "AB1 2CD" },
  cdnBaseUrl: "https://cdn.example/",
  siteUrl: "https://shop.example/",
  platformName: "Merqify",
  platformUrl: "https://merqify.com",
});

const content: EmailContent = {
  preheader: "A short preview line",
  heading: "Your order is confirmed",
  intro: "Order **AB-1** is confirmed.",
  blocks: [
    { kind: "facts", rows: [{ label: "Order number", value: "AB-1" }] },
    { kind: "callout", title: "What happens next", text: "We'll pack it." },
    {
      kind: "items",
      rows: [{ label: "1 × Thing", note: "Gift wrap", amount: "£1.00" }],
      totals: [{ label: "Total", amount: "£1.00", strong: true }],
    },
  ],
  cta: { label: "View your order", href: "https://shop.example/account/orders/AB-1" },
  reassurance: "Questions? Reply to this email.",
  signOff: "Thanks from Corner Shop.",
  reason: "You're receiving this about an order.",
};

describe("brand (R2)", () => {
  it("composes the mark URL from the CDN base and key, and trims the site URL", () => {
    expect(brand.markUrl).toBe("https://cdn.example/vendors/v1/mark-1/512.png");
    expect(brand.siteUrl).toBe("https://shop.example");
    expect(brand.address).toBe("1 High St, Town, AB1 2CD");
    expect(brand.primary).toBe("#192f8a");
  });

  it("no mark or no CDN base means a text-only header", () => {
    expect(emailBrandFrom({ ...baseInput(), markStorageKey: null }).markUrl).toBeNull();
    expect(emailBrandFrom({ ...baseInput(), cdnBaseUrl: null }).markUrl).toBeNull();
  });

  it("a colour white text cannot sit on, or a malformed one, falls back", () => {
    expect(safePrimary("#ff9900")).toBe(FALLBACK_PRIMARY); // orange: about 2.1:1
    expect(safePrimary("red")).toBe(FALLBACK_PRIMARY);
    expect(safePrimary(null)).toBe(FALLBACK_PRIMARY);
    expect(safePrimary("#1B5E20")).toBe("#1b5e20");
    expect(contrastWithWhite("#1b5e20")).toBeGreaterThanOrEqual(4.5);
    expect(safeBackground("#192f8a")).toBe(FALLBACK_BACKGROUND);
    expect(safeBackground("#f5f5f0")).toBe("#f5f5f0");
  });

  it("the fallback brand is neutral and still credits the platform", () => {
    const b = fallbackBrand("Shop");
    expect(b).toMatchObject({ storeName: "Shop", markUrl: null, address: null, siteUrl: null });
    expect(b.platformUrl).toBe("https://merqify.com");
  });
});

function baseInput() {
  return {
    storeName: "S",
    markStorageKey: "k.png",
    primaryHex: "#111111",
    backgroundHex: "#ffffff",
    location: null,
    cdnBaseUrl: "https://cdn.example",
    siteUrl: null,
    platformName: "Merqify",
    platformUrl: "https://merqify.com",
  };
}

describe("renderEmail (R1, R3)", () => {
  const { html, text } = renderEmail(content, brand);

  it("is a responsive 600px document with a hidden preheader", () => {
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('name="viewport"');
    expect(html).toContain("max-width:600px");
    expect(html).toMatch(/<div style="display:none;[^"]*mso-hide:all[^"]*">A short preview line/);
  });

  it("has exactly one table-cell button in the brand colour", () => {
    expect(html.match(/bgcolor="#192f8a"/g)).toHaveLength(1);
    expect(html).toContain('href="https://shop.example/account/orders/AB-1"');
  });

  it("shows the mark, the store name, the footer address, site, reason and Powered by", () => {
    expect(html).toContain('src="https://cdn.example/vendors/v1/mark-1/512.png"');
    expect(html).toContain("1 High St, Town, AB1 2CD");
    expect(html).toContain(">shop.example</a>");
    expect(html).toContain("You&#39;re receiving this about an order.");
    expect(html).toContain('Powered by <a href="https://merqify.com"');
  });

  it("bold markup only becomes <strong> after escaping", () => {
    expect(html).toContain("Order <strong>AB-1</strong> is confirmed.");
    const evil = renderEmail({ ...content, intro: "**<img src=x onerror=1>**" }, brand).html;
    expect(evil).toContain("<strong>&lt;img src=x onerror=1&gt;</strong>");
    expect(evil).not.toContain("<img src=x");
  });

  it("escapes every text field, including the store name", () => {
    const nasty = renderEmail(
      { ...content, heading: "<script>h</script>", reason: "<script>r</script>" },
      { ...brand, storeName: "<script>s</script>" },
    ).html;
    expect(nasty).not.toContain("<script>");
  });

  it("the plain-text part carries the content, the link and the footer", () => {
    expect(text).toContain("Your order is confirmed");
    expect(text).toContain("Order AB-1 is confirmed.");
    expect(text).toContain("Order number: AB-1");
    expect(text).toContain("1 × Thing  £1.00\n  Note: Gift wrap");
    expect(text).toContain("View your order: https://shop.example/account/orders/AB-1");
    expect(text).toContain("Powered by Merqify (https://merqify.com)");
    expect(text).not.toMatch(/<[a-z]/i);
    expect(text).not.toContain("**");
  });

  it("omits the parts it is not given", () => {
    const bare = renderEmail({ preheader: "p", heading: "H", reason: "r" }, fallbackBrand("S"));
    expect(bare.html).not.toContain("bgcolor=");
    expect(bare.html).not.toContain("<img");
  });
});

describe("htmlToText (R4)", () => {
  it("keeps link URLs, breaks blocks, decodes entities and drops the preheader padding", () => {
    expect(
      htmlToText(
        '<html><head><title>T</title><style>p{}</style></head><body><div style="display:none">pre&zwnj;</div><p>Hi &amp; welcome</p><p><a href="https://x.test">Go</a></p></body></html>',
      ),
    ).toBe("Hi & welcome\nGo (https://x.test)");
  });
});
