// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { StorefrontFooter } from "@/components/layout/StorefrontFooter";
import { DEFAULT_BRAND_PRIMITIVES, type VendorProfile } from "@/lib/repositories/vendor";

/*
 * #1055 — the footer's hide-when-null rule, the placeholder-never-a-link rule, and the gated links.
 * Only the fields the footer reads are set; the cast keeps the fixture from restating all of
 * `VendorProfile`.
 */

const BARE = {
  name: "Second Shop",
  primitives: DEFAULT_BRAND_PRIMITIVES,
  facebookUrl: null,
  contactPhone: null,
  contactEmail: null,
  companyNumber: null,
  vatNumber: null,
  registeredOffice: null,
  openingHoursNote: null,
  showSecureCheckoutNote: false,
  location: null,
  openingHours: [],
  paymentBadges: [],
  loyaltyEnabled: false,
};

const SEEDED = {
  ...BARE,
  name: "First Shop",
  facebookUrl: "https://www.facebook.com/firstshop",
  contactPhone: "01908 239130",
  contactEmail: "[YOUR EMAIL]",
  companyNumber: "[NUMBER]",
  vatNumber: "[NUMBER]",
  openingHoursNote: "Collect during opening hours.",
  showSecureCheckoutNote: true,
  location: {
    addressLine1: "13 N 11th St",
    addressLine2: null,
    city: "Milton Keynes",
    postcode: "MK9 3BU",
  },
  openingHours: [
    { label: "Monday – Friday", hours: "[OPEN] – 8pm" },
    { label: "Bank holidays", hours: "[HOURS]" },
  ],
  paymentBadges: ["VISA", "MASTERCARD", "AMEX", "APPLE_PAY", "GOOGLE_PAY"],
  loyaltyEnabled: true,
};

function renderFooter(profile: object, platformName?: string) {
  render(<StorefrontFooter profile={profile as VendorProfile} platformName={platformName} />);
  return screen.getByRole("contentinfo");
}

afterEach(cleanup);

describe("StorefrontFooter (#1055)", () => {
  it("renders the three columns and the seeded values", () => {
    const footer = renderFooter(SEEDED, "[PLATFORM NAME]");
    for (const heading of ["Visit & contact us", "Shop opening hours", "Shop with us"]) {
      expect(within(footer).getByRole("heading", { name: heading })).toBeTruthy();
    }
    expect(footer.textContent).toContain("Company no. [NUMBER]");
    expect(footer.textContent).toContain("VAT [NUMBER]");
    expect(footer.textContent).toContain("Powered by [PLATFORM NAME]");
    expect(footer.textContent).toContain("Secure checkout powered by Stripe");
    expect(footer.textContent).not.toContain("Registered office");
  });

  it("builds the directions link from name and address", () => {
    const footer = renderFooter(SEEDED);
    const links = within(footer).getAllByRole("link", { name: /get directions/i });
    const expected =
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent("First Shop, 13 N 11th St, Milton Keynes, MK9 3BU");
    for (const link of links) expect(link.getAttribute("href")).toBe(expected);
  });

  it("makes a real phone tappable but never links a placeholder email", () => {
    const footer = renderFooter(SEEDED);
    const tel = footer.querySelectorAll('a[href="tel:01908239130"]');
    expect(tel.length).toBeGreaterThan(0);
    expect(within(footer).getByText("[YOUR EMAIL]").closest("a")).toBeNull();
    expect(footer.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it("links a real email address", () => {
    const footer = renderFooter({ ...SEEDED, contactEmail: "shop@example.com" });
    expect(footer.querySelector('a[href="mailto:shop@example.com"]')).not.toBeNull();
  });

  it("shows hours rows in order", () => {
    const footer = renderFooter(SEEDED);
    const text = footer.textContent ?? "";
    expect(text.indexOf("Monday – Friday")).toBeLessThan(text.indexOf("Bank holidays"));
    expect(text).toContain("[OPEN] – 8pm");
  });

  it("renders the badges in display order with alt text", () => {
    const footer = renderFooter(SEEDED);
    const imgs = [...footer.querySelectorAll("img")];
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual([
      "/payment-methods/visa.svg",
      "/payment-methods/mastercard.svg",
      "/payment-methods/amex.svg",
      "/payment-methods/apple-pay.svg",
      "/payment-methods/google-pay.svg",
    ]);
    for (const img of imgs) expect(img.getAttribute("alt")).toBeTruthy();
  });

  it("links the shop pages, Rewards and Facebook when configured", () => {
    const footer = renderFooter(SEEDED);
    const hrefs = [...footer.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    for (const href of [
      "/help",
      "/help#delivery",
      "/terms#refunds",
      "/account/loyalty",
      "/feedback",
      "/terms",
      "/privacy",
      "/privacy#cookies",
    ]) {
      expect(hrefs).toContain(href);
    }
    expect(within(footer).getByRole("link", { name: "Facebook" }).getAttribute("href")).toBe(
      SEEDED.facebookUrl,
    );
  });

  it("hides everything a bare vendor has not set, with no platform fallback", () => {
    const footer = renderFooter(BARE);
    expect(within(footer).queryByRole("heading", { name: "Visit & contact us" })).toBeNull();
    expect(within(footer).queryByRole("heading", { name: "Shop opening hours" })).toBeNull();
    expect(within(footer).getByRole("heading", { name: "Shop with us" })).toBeTruthy();
    expect(within(footer).queryByRole("link", { name: "Facebook" })).toBeNull();
    expect(footer.querySelector('a[href="/account/loyalty"]')).toBeNull();
    expect(footer.querySelector("img")).toBeNull();
    const text = footer.textContent ?? "";
    expect(text).toContain("© ");
    expect(text).toContain("Second Shop");
    expect(text).not.toMatch(/Company no\.|VAT|Powered by|Secure checkout|Get directions/);
  });
});
