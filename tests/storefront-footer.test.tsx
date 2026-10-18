// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { StorefrontFooter } from "@/components/layout/StorefrontFooter";
import { DEFAULT_BRAND_PRIMITIVES, type VendorProfile } from "@/lib/repositories/vendor";

/*
 * #1055 — the footer's hide-when-null rule, the placeholder-never-a-link rule, and the gated links.
 * #1060 — structured weekly hours with today highlighted, and the shared contact-channel row.
 * Only the fields the footer reads are set; the cast keeps the fixture from restating all of
 * `VendorProfile`.
 */

const BARE = {
  name: "Second Shop",
  primitives: DEFAULT_BRAND_PRIMITIVES,
  facebookUrl: null,
  instagramUrl: null,
  whatsappNumber: null,
  contactPhone: null,
  contactEmail: null,
  companyNumber: null,
  vatNumber: null,
  registeredOffice: null,
  openingHoursNote: null,
  showSecureCheckoutNote: false,
  location: null,
  weeklyHours: [],
  hoursOverrides: [],
  paymentBadges: [],
  loyaltyEnabled: false,
};

const WEEK = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  openTime: "09:00",
  closeTime: "20:00",
  closed: false,
}));

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
  weeklyHours: [...WEEK, { dayOfWeek: 0, openTime: "09:00", closeTime: "19:00", closed: false }],
  paymentBadges: ["VISA", "MASTERCARD", "AMEX", "APPLE_PAY", "GOOGLE_PAY"],
  loyaltyEnabled: true,
};

function renderFooter(profile: object, platformName?: string, assistantAvailable = false) {
  render(
    <StorefrontFooter
      profile={profile as VendorProfile}
      platformName={platformName}
      assistantAvailable={assistantAvailable}
    />,
  );
  return screen.getByRole("contentinfo");
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

  it("shows the weekly hours Monday → Sunday and highlights today (#1060)", () => {
    // Wednesday 2026-10-14, midday in London.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T11:00:00Z"));
    const footer = renderFooter(SEEDED);
    const terms = [...footer.querySelectorAll("dt")].map((dt) => dt.textContent);
    expect(terms).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    const today = footer.querySelectorAll('[aria-current="date"]');
    expect(today).toHaveLength(1);
    expect(today[0].textContent).toBe("Wednesday9am – 8pm");
    expect(footer.textContent).not.toContain("Holiday hours");
  });

  it("lists an upcoming override under Holiday hours (#1060)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-20T12:00:00Z"));
    const footer = renderFooter({
      ...SEEDED,
      hoursOverrides: [
        {
          id: "o1",
          date: "2026-12-25",
          label: "Christmas Day",
          openTime: null,
          closeTime: null,
          closed: true,
        },
      ],
    });
    expect(footer.textContent).toContain("Holiday hours");
    expect(footer.textContent).toContain("Fri 25 Dec · Christmas Day · Closed");
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

  it("links the shop pages, Rewards and the contact channels when configured", () => {
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
    expect(
      within(footer).getByRole("link", { name: "First Shop on Facebook" }).getAttribute("href"),
    ).toBe(SEEDED.facebookUrl);
  });

  it("renders the help-assistant channel as a button when it is available (#1060)", () => {
    const footer = renderFooter({ ...SEEDED, whatsappNumber: "447700900123" }, undefined, true);
    const row = within(footer).getByRole("list", { name: "Contact us" });
    expect(within(row).getAllByRole("listitem")).toHaveLength(2);
    expect(within(row).getByRole("button", { name: "Open help assistant" })).toBeTruthy();
    expect(within(row).queryByRole("link", { name: /WhatsApp/ })).toBeNull();
  });

  it("hides everything a bare vendor has not set, with no platform fallback", () => {
    const footer = renderFooter(BARE);
    expect(within(footer).queryByRole("heading", { name: "Visit & contact us" })).toBeNull();
    expect(within(footer).queryByRole("heading", { name: "Shop opening hours" })).toBeNull();
    expect(within(footer).getByRole("heading", { name: "Shop with us" })).toBeTruthy();
    expect(within(footer).queryByRole("list", { name: "Contact us" })).toBeNull();
    expect(footer.querySelector('a[href="/account/loyalty"]')).toBeNull();
    expect(footer.querySelector("img")).toBeNull();
    const text = footer.textContent ?? "";
    expect(text).toContain("© ");
    expect(text).toContain("Second Shop");
    expect(text).not.toMatch(/Company no\.|VAT|Powered by|Secure checkout|Get directions/);
  });
});

describe("StorefrontFooter Legal row (#1107 R12)", () => {
  it("ends with a Cookie settings button after the three links", () => {
    const footer = renderFooter(SEEDED);
    const legal = within(footer).getByRole("navigation", { name: "Legal" });
    const controls = [...legal.querySelectorAll("a, button")].map((el) => [
      el.tagName,
      el.textContent?.trim(),
    ]);
    expect(controls).toEqual([
      ["A", "Terms"],
      ["A", "Privacy"],
      ["A", "Cookies"],
      ["BUTTON", "Cookie settings"],
    ]);
    expect(legal.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
  });

  // #1134 — the delivery link names slots only where the store offers them.
  it("names slots in the delivery link only when the store offers delivery slots", () => {
    const withSlots = renderFooter({ ...SEEDED, offerDeliverySlots: true });
    const slotsLink = within(withSlots).getByRole("link", { name: "Delivery areas & slots" });
    expect(slotsLink.getAttribute("href")).toBe("/help#delivery");
    cleanup();

    const withoutSlots = renderFooter({ ...SEEDED, offerDeliverySlots: false });
    const areasLink = within(withoutSlots).getByRole("link", { name: "Delivery areas" });
    expect(areasLink.getAttribute("href")).toBe("/help#delivery");
    expect(withoutSlots.textContent).not.toContain("slots");
  });
});
