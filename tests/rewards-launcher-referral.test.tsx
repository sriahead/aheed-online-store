// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { RewardsLauncher } from "@/components/rewards/RewardsLauncher";

/**
 * #1065 R14–R17 — a `?ref=` code is optional storage, so the launcher holds it in memory and
 * writes `store_referral_code` only once consent is `accepted`. Choosing Essential Only writes
 * nothing and clears any referral cookie under either name.
 *
 * jsdom drops cookie attributes on read, so R15's attribute check records what was WRITTEN
 * through a spy on the `document.cookie` setter, delegating to the real one.
 */

const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;
let writes: string[] = [];
const setCookie = (value: string) => cookieDescriptor.set!.call(document, value);

function clearAllCookies() {
  for (const row of document.cookie.split("; ")) {
    const name = row.split("=")[0];
    if (name) setCookie(`${name}=; max-age=0; path=/`);
  }
}

const mount = () => render(<RewardsLauncher initialData={null} vendorName="Some Vendor" />);
const announce = (value: string) =>
  act(() => {
    window.dispatchEvent(new CustomEvent("store-consent-change", { detail: { value } }));
  });

beforeEach(() => {
  clearAllCookies();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/?ref=CODE");
  writes = [];
  vi.spyOn(document, "cookie", "set").mockImplementation((value: string) => {
    writes.push(value);
    setCookie(value);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("no consent yet (#1065 R14)", () => {
  it("writes no referral cookie and puts the code in no browser storage", () => {
    mount();
    expect(document.cookie).not.toContain("referral_code");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

describe("consent arrives as Accept All (#1065 R15)", () => {
  it("writes store_referral_code with its attributes", () => {
    mount();
    announce("accepted");
    expect(document.cookie).toContain("store_referral_code=CODE");
    const written = writes.find((w) => w.startsWith("store_referral_code="));
    expect(written).toBeDefined();
    expect(written!.split("; ")).toEqual(
      expect.arrayContaining([
        "store_referral_code=CODE",
        "path=/",
        "max-age=2592000",
        "SameSite=Lax",
        "Secure",
      ]),
    );
  });
});

describe("consent already given (#1065 R16)", () => {
  it.each(["store_cookie_consent", "aheed_cookie_consent"])(
    "%s=accepted writes the cookie on mount",
    (consentName) => {
      setCookie(`${consentName}=accepted; path=/`);
      mount();
      expect(document.cookie).toContain("store_referral_code=CODE");
    },
  );
});

describe("Essential Only (#1065 R17)", () => {
  it("on mount: writes nothing and clears referral cookies under both names", () => {
    setCookie("store_cookie_consent=essential; path=/");
    setCookie("store_referral_code=OLD; path=/");
    setCookie("aheed_referral_code=OLD; path=/");
    mount();
    expect(document.cookie).not.toContain("store_referral_code");
    expect(document.cookie).not.toContain("aheed_referral_code");
  });

  it("as an event: writes nothing and clears referral cookies under both names", () => {
    setCookie("aheed_referral_code=OLD; path=/");
    mount();
    announce("essential");
    expect(document.cookie).not.toContain("store_referral_code");
    expect(document.cookie).not.toContain("aheed_referral_code");
  });
});
