// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FavouriteButton } from "@/components/product/FavouriteButton";
import { favouriteControlLabel } from "@/lib/favourites";

/**
 * `#232` — the product card's favourite control, in each of its three states.
 *
 * The states come from ONE `favouriteState` prop rather than an `isFavourite`/`canFavourite` pair,
 * because that pair would admit a fourth, meaningless combination — favourited but signed out —
 * which every reader of the component would then have to decide what to do with.
 *
 * The placement case (R11) is the one worth explaining: the card's top-right corner is ALREADY
 * the below-`sm` quick-view button, so the heart sits 48px inboard below `sm` and takes the
 * corner only from `sm` up, where that button is hidden. Both halves have to be present — with only
 * `sm:right-0` the two controls overlap on a phone, and that is invisible in a desktop browser,
 * which is exactly why it is asserted here rather than left to a visual check.
 *
 * Same `@/lib/db` mock as the other card tests: the toggle action transitively imports
 * `@prisma/client/wasm`, a subpath export only Next's webpack build can resolve.
 */
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));

afterEach(cleanup);

const NAME = "Golden Paneer 500g";

function renderHeart(state: "on" | "off" | "signed-out") {
  return render(<FavouriteButton productId="prod-1" productName={NAME} state={state} />);
}

describe("FavouriteButton — the three states (R10)", () => {
  it('"off" is a button inviting the shopper to save the product', () => {
    renderHeart("off");

    const control = screen.getByRole("button");
    expect(control.tagName).toBe("BUTTON");
    expect(control.getAttribute("aria-label")).toBe(`Save ${NAME} to your favourites`);
    expect(control.getAttribute("aria-label")).toContain(NAME);
    expect(control.getAttribute("aria-pressed")).toBe("false");
  });

  it('"on" is a button offering removal, and is marked pressed', () => {
    renderHeart("on");

    const control = screen.getByRole("button");
    expect(control.tagName).toBe("BUTTON");
    expect(control.getAttribute("aria-label")).toBe(`Remove ${NAME} from your favourites`);
    expect(control.getAttribute("aria-pressed")).toBe("true");
  });

  it('"signed-out" is a LINK to /login, not a disabled button', () => {
    renderHeart("signed-out");

    // A link, because "sign in to do this" is a navigation: a shopper can middle-click it and a
    // screen reader announces it as a link rather than a control that does nothing.
    expect(screen.queryByRole("button")).toBeNull();
    const control = screen.getByRole("link");
    expect(control.tagName).toBe("A");
    expect(control.getAttribute("href")).toBe("/login");
    expect(control.getAttribute("aria-label")).toBe(`Sign in to save ${NAME} to your favourites`);
    expect(control.getAttribute("aria-label")).toContain(NAME);
  });

  it("every label names the product, from the one shared helper", () => {
    // The component and this test assert against one function rather than two copies of three
    // strings — the drift `lib/favourites.ts` exists to prevent.
    for (const state of ["on", "off", "signed-out"] as const) {
      expect(favouriteControlLabel(state, NAME)).toContain(NAME);
    }
  });
});

describe("FavouriteButton — placement and tap size (R11, R16)", () => {
  it("clears the quick-view button below sm and takes the corner from sm up", () => {
    renderHeart("off");
    const className = screen.getByRole("button").className;

    // 48px inboard at the base breakpoint. NOT the 44px tap token: validation pass 1 measured
    // both controls at 46px wide (the card's skew widens them), so a 44px offset overlapped the
    // quick-view button by 2px. The geometry itself is measured by validation.md's R11 row.
    expect(className).toContain("right-12");
    // ...and the corner itself from `sm`.
    expect(className).toContain("sm:right-0");
    // Never an unprefixed `right-0`, which would put it under the quick-view button on a phone.
    expect(className).not.toMatch(/(^|\s)right-0(\s|$)/);
  });

  it("carries a 44px hit area and the measuring hook", () => {
    renderHeart("off");
    const control = screen.getByRole("button");

    expect(control.className).toContain("size-tap");
    // `scripts/verify-mobile-layout.ts` finds surfaces by this attribute, and
    // `tests/tap-targets.test.ts` guards that it stays in the source.
    expect(control.getAttribute("data-tap-surface")).toBe("product-card-favourite");
  });

  it("the signed-out link carries the same placement and hook", () => {
    renderHeart("signed-out");
    const control = screen.getByRole("link");

    expect(control.className).toContain("size-tap");
    expect(control.className).toContain("sm:right-0");
    expect(control.getAttribute("data-tap-surface")).toBe("product-card-favourite");
  });
});
