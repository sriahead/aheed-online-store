// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CookieBanner } from "@/components/consent/CookieBanner";
import { CookieSettingsButton } from "@/components/consent/CookieSettingsButton";

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

const BODY_TEXT =
  "We use essential cookies and browser storage to keep you signed in, hold your basket, and remember your delivery choice and checkout details. One optional cookie remembers a referral code from a link you followed, and it is set only if you choose Accept All. Read our Privacy Policy and Terms of Service.";

const bodyText = () => {
  const heading = screen.getByText("We value your privacy");
  return (heading.parentElement?.textContent ?? "")
    .replace("We value your privacy", "")
    .replace(/\s+/g, " ")
    .trim();
};

const reopen = () => act(() => void window.dispatchEvent(new Event("store-consent-open")));

describe("banner copy (#1107 R4)", () => {
  it("names what is stored and the one optional cookie", () => {
    render(<CookieBanner />);
    expect(bodyText()).toBe(BODY_TEXT);
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe(
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "Terms of Service" }).getAttribute("href")).toBe(
      "/terms",
    );
  });
});

describe("Cookie settings (#1107 R6)", () => {
  it("is a named button that dispatches store-consent-open", () => {
    let opened = 0;
    const listener = () => opened++;
    window.addEventListener("store-consent-open", listener);
    render(<CookieSettingsButton />);
    const button = screen.getByRole("button", { name: "Cookie settings" });
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(opened).toBe(1);
    window.removeEventListener("store-consent-open", listener);
  });
});

describe("reopening the banner (#1107 R7–R10)", () => {
  it.each([
    ["essential", "Essential Only"],
    ["accepted", "Accept All"],
  ])("with %s stored: hidden until opened, then states the choice and focuses", (value, label) => {
    cookieDescriptor.set!.call(document, `store_cookie_consent=${value}; path=/`);
    render(<CookieBanner />);
    expect(banner()).toBeNull();

    reopen();
    expect(banner()).not.toBeNull();
    expect(screen.getByText(`Your current choice: ${label}.`)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Essential Only" }));
  });

  it("a first visit shows no current-choice line and takes no focus (R8, R9)", () => {
    render(<CookieBanner />);
    expect(banner()).not.toBeNull();
    expect(screen.queryByText(/Your current choice/)).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it.each([
    ["accepted", "Essential Only", "essential"],
    ["essential", "Accept All", "accepted"],
  ])(
    "with %s stored, choosing %s overwrites it like a first visit (R10)",
    (stored, label, value) => {
      cookieDescriptor.set!.call(document, `store_cookie_consent=${stored}; path=/`);
      const received: unknown[] = [];
      const listener = (e: Event) => received.push((e as CustomEvent).detail);
      window.addEventListener("store-consent-change", listener);
      render(<CookieBanner />);
      reopen();
      writes = [];

      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(writes.some((w) => w.startsWith(`store_cookie_consent=${value};`))).toBe(true);
      expect(banner()).toBeNull();
      expect(received).toEqual([{ value }]);
      window.removeEventListener("store-consent-change", listener);
    },
  );
});

describe("Essential Only clears the referral cookie from the banner itself (#1107 R11)", () => {
  const referralWrites = () =>
    writes.filter((w) => /^(store_referral_code|aheed_referral_code)=/.test(w));

  it.each([
    ["a first visit", false],
    ["a reopen", true],
  ])("on %s, both referral names are expired", (_case, viaReopen) => {
    if (viaReopen) cookieDescriptor.set!.call(document, "store_cookie_consent=accepted; path=/");
    render(<CookieBanner />);
    if (viaReopen) reopen();
    fireEvent.click(screen.getByRole("button", { name: "Essential Only" }));
    expect(referralWrites().sort()).toEqual([
      "aheed_referral_code=; max-age=0; path=/",
      "store_referral_code=; max-age=0; path=/",
    ]);
  });

  it("Accept All writes no referral cookie", () => {
    render(<CookieBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Accept All" }));
    expect(referralWrites()).toEqual([]);
  });
});
