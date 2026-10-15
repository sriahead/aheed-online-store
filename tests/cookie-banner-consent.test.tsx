// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CookieBanner } from "@/components/consent/CookieBanner";

/**
 * #1080 R10–R13 and #1065 — the consent cookie's vendor-neutral rename, the migration of a choice
 * made under the legacy name, and the event `RewardsLauncher` waits on before writing a referral
 * cookie.
 *
 * jsdom drops cookie attributes from `document.cookie` on read, so the attribute assertions (R10)
 * record what was WRITTEN through a spy on the setter, delegating to the real one.
 */

const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;
let writes: string[] = [];

function clearAllCookies() {
  for (const row of document.cookie.split("; ")) {
    const name = row.split("=")[0];
    if (name) cookieDescriptor.set!.call(document, `${name}=; max-age=0; path=/`);
  }
}

const banner = () => screen.queryByRole("complementary", { name: "Cookie Consent Banner" });

beforeEach(() => {
  clearAllCookies();
  writes = [];
  vi.spyOn(document, "cookie", "set").mockImplementation((value: string) => {
    writes.push(value);
    cookieDescriptor.set!.call(document, value);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("saving a choice (#1080 R10)", () => {
  it.each([
    ["Essential Only", "essential"],
    ["Accept All", "accepted"],
  ])(
    "%s writes store_cookie_consent=%s, hides the banner and dispatches the event",
    (label, value) => {
      const received: unknown[] = [];
      const listener = (e: Event) => received.push((e as CustomEvent).detail);
      window.addEventListener("store-consent-change", listener);

      render(<CookieBanner />);
      fireEvent.click(screen.getByRole("button", { name: label }));

      const written = writes.find((w) => w.startsWith("store_cookie_consent="));
      expect(written).toBeDefined();
      const parts = written!.split("; ");
      expect(parts[0]).toBe(`store_cookie_consent=${value}`);
      expect(parts).toEqual(
        expect.arrayContaining(["max-age=31536000", "path=/", "SameSite=Lax", "Secure"]),
      );
      expect(banner()).toBeNull();
      expect(received).toEqual([{ value }]);

      window.removeEventListener("store-consent-change", listener);
    },
  );
});

describe("a choice made under the legacy name (#1080 R11, R12)", () => {
  it.each(["accepted", "essential"])(
    "legacy %s is carried across and the banner stays hidden",
    (value) => {
      cookieDescriptor.set!.call(document, `aheed_cookie_consent=${value}; path=/`);
      render(<CookieBanner />);
      expect(banner()).toBeNull();
      expect(document.cookie).toContain(`store_cookie_consent=${value}`);
      expect(document.cookie).not.toContain("aheed_cookie_consent");
    },
  );

  it("an unrecognised legacy value is no answer, so the banner renders", () => {
    cookieDescriptor.set!.call(document, "aheed_cookie_consent=yes; path=/");
    render(<CookieBanner />);
    expect(banner()).not.toBeNull();
  });

  it("no consent cookie at all renders the banner", () => {
    render(<CookieBanner />);
    expect(banner()).not.toBeNull();
  });
});

describe("a choice already under the new name (#1080 R13)", () => {
  it("does not render the banner", () => {
    cookieDescriptor.set!.call(document, "store_cookie_consent=accepted; path=/");
    render(<CookieBanner />);
    expect(banner()).toBeNull();
  });
});
