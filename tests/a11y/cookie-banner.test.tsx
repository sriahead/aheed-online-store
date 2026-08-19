// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { computeAccessibleName } from "dom-accessibility-api";
import { CookieBanner } from "@/components/consent/CookieBanner";

/**
 * Proves R5 (#251, P7 closeout) for the consent banner, and pins the one
 * behaviour that is easy to "fix" into a defect.
 *
 * The banner deliberately does NOT trap focus. It is a non-blocking
 * complementary landmark, not a modal — trapping focus in it would stop a
 * keyboard user reaching the page at all until they answered it, which is a
 * WCAG failure rather than compliance. specs/design-system.md's "Modal
 * surfaces" rule states the distinction; this test is what keeps a future
 * "make the banner consistent with the cart drawer" change honest.
 */

beforeEach(() => {
  // The banner renders only when no consent cookie is present.
  document.cookie = "aheed_cookie_consent=; max-age=0; path=/";
});
afterEach(cleanup);

describe("cookie banner — accessible names (R5)", () => {
  it("gives every interactive control a non-empty accessible name", () => {
    const { container } = render(<CookieBanner />);
    const controls = Array.from(
      container.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea"),
    ).filter((el) => el.getAttribute("aria-hidden") !== "true");

    expect(
      controls.length,
      "selector matched nothing — the test would pass vacuously",
    ).toBeGreaterThan(0);

    const unnamed = controls
      .filter((el) => computeAccessibleName(el).trim() === "")
      .map((el) => el.outerHTML.slice(0, 80));
    expect(unnamed, `controls with no accessible name: ${unnamed.join(" | ")}`).toEqual([]);
  });

  it("exposes a named complementary landmark rather than an anonymous div", () => {
    render(<CookieBanner />);
    const banner = screen.getByRole("complementary", { name: /cookie/i });
    expect(banner).toBeTruthy();
  });

  it("offers both consent choices as real buttons", () => {
    render(<CookieBanner />);
    expect(screen.getByRole("button", { name: "Essential Only" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept All" })).toBeTruthy();
  });
});

describe("cookie banner — does not behave like a modal", () => {
  it("does not steal focus on mount", () => {
    render(<CookieBanner />);
    expect(document.activeElement).toBe(document.body);
  });

  it("does not declare itself a dialog", () => {
    const { container } = render(<CookieBanner />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector("[aria-modal]")).toBeNull();
  });

  it("dismisses itself once a choice is made", () => {
    render(<CookieBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Essential Only" }));
    expect(screen.queryByRole("complementary", { name: /cookie/i })).toBeNull();
  });
});
