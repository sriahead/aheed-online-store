// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * #1064 — `/privacy#cookies` lists every cookie and local-storage item the storefront sets, under
 * the name a browser shows.
 *
 * WHY THIS TEST EXISTS. The section used to name `aheed_session`, a string that appears nowhere in
 * code, and omitted four items the storefront does set. A privacy page that misnames cookies is
 * worse than a short one, and nothing tied the page to the code.
 *
 * WHAT IT CAN AND CANNOT PROVE. It pins the exact wording and order (R1–R5, R7) and ties the
 * three names that exist as exported constants to those constants, so renaming a cookie fails
 * here instead of leaving the page quietly wrong. It cannot prove the list is TRUE of a real
 * browser: that is validation.md R8–R11, which read the actual cookie jar.
 *
 * The page is an async server component with no nested async children, so awaiting it yields an
 * ordinary element tree that `@testing-library/react` can render.
 */

vi.mock("@/lib/vendor-service", () => ({
  getCurrentVendorProfile: vi.fn(async () => ({ name: "Some Vendor" })),
}));
// `lib/cart-identity` calls `cookies()` only inside functions, never at import time; the mock just
// lets the module load so its exported name constant can be read.
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/auth-rbac", () => ({ getUserId: vi.fn() }));

import PrivacyPage from "@/app/(storefront)/privacy/page";
import { CART_COOKIE } from "@/lib/cart-identity";
import { DELIVERY_POSTCODE_COOKIE } from "@/lib/delivery-cookie";
import { FULFILMENT_METHOD_COOKIE } from "@/lib/fulfilment-cookie";

const squash = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

const EXPECTED_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ["__Secure-better-auth.session_token", "Maintains your authenticated session."],
  ["aheed_cart", "Stores your shopping cart state."],
  ["aheed_cookie_consent", "Records your cookie consent preferences."],
  [
    "delivery-postcode",
    "Remembers the postcode you entered so we can show delivery availability and fees.",
  ],
  ["fulfilment-method", "Remembers whether you chose delivery or collection."],
  [
    "aheed_referral_code",
    "Remembers a referral code from a link you followed so it can be applied at checkout. Only set when you arrive through a referral link.",
  ],
  [
    "aheed_checkout_details",
    "Local storage. Keeps the contact and delivery details you type into the checkout form on your device so they are filled in next time. It stays on your device.",
  ],
];

async function renderSection(): Promise<{ container: HTMLElement; section: HTMLElement }> {
  const { container } = render(await PrivacyPage());
  const section = container.querySelector<HTMLElement>("#cookies");
  if (!section) throw new Error("no #cookies section rendered");
  return { container, section };
}

afterEach(cleanup);

describe("privacy page — Cookies and Local Storage (#1064)", () => {
  it("R1: keeps the anchor and heading, and the anchor occurs once", async () => {
    const { container, section } = await renderSection();
    expect(container.querySelectorAll("#cookies")).toHaveLength(1);
    expect(section.querySelector("h2")?.textContent).toBe("4. Cookies and Local Storage");
  });

  it("R2–R4: the intro, lead-in and closing paragraphs are the approved text", async () => {
    const { section } = await renderSection();
    const paragraphs = [...section.querySelectorAll(":scope > p")].map((p) =>
      squash(p.textContent),
    );
    expect(paragraphs).toEqual([
      "We use cookies and local storage technologies to support essential website functionality, including user authentication, shopping cart management, delivery and collection preferences, checkout convenience, referral links, and the storage of cookie consent preferences.",
      "The following cookies and local storage items are used for these purposes:",
      "These cookies and local storage items are scoped to the relevant host and are used to provide core website functionality.",
    ]);
    // The closing paragraph comes after the list; the lead-in comes before it.
    const list = section.querySelector("ul");
    expect(list).not.toBeNull();
    const [, leadIn, closing] = [...section.querySelectorAll(":scope > p")];
    expect(leadIn.compareDocumentPosition(list!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(closing.compareDocumentPosition(list!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("R5: the list is exactly the seven approved items, in order, as `name — description`", async () => {
    const { section } = await renderSection();
    const items = [...section.querySelectorAll("ul > li")];
    expect(items).toHaveLength(EXPECTED_ITEMS.length);
    items.forEach((li, i) => {
      const [name, description] = EXPECTED_ITEMS[i];
      expect(li.querySelector("code")?.textContent).toBe(name);
      // A space, an em dash (U+2014), a space — not a hyphen or an en dash.
      expect(squash(li.textContent)).toBe(`${name} — ${description}`);
    });
  });

  it("R7: never names the cookies that do not exist, or the staff-only one", async () => {
    const { section } = await renderSection();
    const text = squash(section.textContent);
    expect(text).not.toContain("aheed_session");
    expect(text).not.toContain("admin-tier");
    const names = [...section.querySelectorAll("li > code")].map((c) => c.textContent);
    for (const bare of ["session", "cart", "cookie_consent"]) {
      expect(names).not.toContain(bare);
    }
  });

  it("R12: the three names that exist as constants are listed under those constants' values", async () => {
    const { section } = await renderSection();
    const names = [...section.querySelectorAll("li > code")].map((c) => c.textContent);
    expect(names).toContain(CART_COOKIE);
    expect(names).toContain(DELIVERY_POSTCODE_COOKIE);
    expect(names).toContain(FULFILMENT_METHOD_COOKIE);
  });

  it("R6: carries no vendor name or grocery wording", async () => {
    const { section } = await renderSection();
    const text = squash(section.textContent);
    expect(text).not.toMatch(/Food Centre|SriMart|Some Vendor/);
    // The only `aheed` left is inside the `aheed_`-prefixed names.
    expect(text.replace(/aheed_[a-z_]+/g, "")).not.toMatch(/aheed/i);
  });
});
