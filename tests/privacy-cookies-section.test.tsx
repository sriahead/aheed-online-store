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

/**
 * `[technical name, the purpose the entry LEADS with]` (#1089).
 *
 * The order is unchanged from `#1064`; what changed is which half comes first. The owner's
 * user-testing pass read the previous name-led, `<code>`-styled version as "code base words". Every
 * name stays on the page — naming the cookie is the PECR/UK GDPR transparency a shopper is owed —
 * so this test now pins both halves AND the fact that no entry is code-styled.
 */
const EXPECTED_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ["__Secure-better-auth.session_token", "Keeps you signed in."],
  ["aheed_cart", "Keeps the items in your basket."],
  ["aheed_cookie_consent", "Remembers your cookie choices."],
  [
    "delivery-postcode",
    "Remembers the postcode you entered, so we can show delivery availability and fees.",
  ],
  ["fulfilment-method", "Remembers whether you chose delivery or collection."],
  [
    "aheed_referral_code",
    "Remembers a referral code from a link you followed, so it can be applied at checkout. Only set if you arrive through a referral link.",
  ],
  [
    "aheed_checkout_details",
    "Keeps the contact and delivery details you type at checkout, so they are filled in next time. Stored on your device, not on our servers.",
  ],
];

/** The technical names, as the page now presents them: emphasised, not code-styled. */
const renderedNames = (section: HTMLElement) =>
  [...section.querySelectorAll("ul > li .font-semibold")].map((el) => el.textContent);

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

  it("R5/#1089 R15: the seven items are in order and each LEADS with its purpose", async () => {
    const { section } = await renderSection();
    const items = [...section.querySelectorAll("ul > li")];
    expect(items).toHaveLength(EXPECTED_ITEMS.length);
    items.forEach((li, i) => {
      const [name, purpose] = EXPECTED_ITEMS[i];
      const text = squash(li.textContent);
      // Leads with the purpose: a shopper reads what it is for before any identifier.
      expect(text.startsWith(purpose)).toBe(true);
      // And still names the cookie, after the purpose, not before it.
      expect(text).toBe(`${purpose} Shown in your browser as ${name}.`);
      expect(text.indexOf(purpose)).toBeLessThan(text.indexOf(name));
    });
  });

  it("#1089 R15: no entry is code-styled", async () => {
    const { section } = await renderSection();
    expect(section.querySelectorAll("code")).toHaveLength(0);
  });

  it("R7: never names the cookies that do not exist, or the staff-only one", async () => {
    const { section } = await renderSection();
    const text = squash(section.textContent);
    expect(text).not.toContain("aheed_session");
    expect(text).not.toContain("admin-tier");
    const names = renderedNames(section);
    for (const bare of ["session", "cart", "cookie_consent"]) {
      expect(names).not.toContain(bare);
    }
  });

  it("R12: the three names that exist as constants are listed under those constants' values", async () => {
    const { section } = await renderSection();
    const names = renderedNames(section);
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
