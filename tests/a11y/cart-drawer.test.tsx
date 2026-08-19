// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { computeAccessibleName } from "dom-accessibility-api";
import { CartDrawerShell } from "@/components/cart/CartDrawerShell";

/**
 * Proves R2–R6 and R9 (#251, P7 closeout) against the drawer users actually get.
 *
 * `components/cart/CartDrawerShell.tsx` is the live component — Header.tsx renders
 * it. (A second, richer `CartDrawer.tsx` shipped in P7a and was never imported by
 * anything; this slice deleted it. Asserting accessibility against that file would
 * have proved a property of a component no user could reach.)
 *
 * These run in jsdom rather than a browser: the properties under test — roles,
 * accessible names, focus order, heading levels — are all DOM-level, so a real
 * browser would add cost without adding evidence.
 */

afterEach(cleanup);

/** Stand-in for the server-rendered cart contents the shell receives as children. */
function contents() {
  return (
    <div>
      <h3>Your cart is empty</h3>
      <button type="button" aria-label="Decrease quantity of Basmati Rice">
        <span aria-hidden="true">-</span>
      </button>
      <button type="button" aria-label="Increase quantity of Basmati Rice">
        <span aria-hidden="true">+</span>
      </button>
      {/* A fragment href, not "/checkout": the real contents use next/link, and
          a bare <a> to a real route trips @next/next/no-html-link-for-pages.
          All this fixture needs is a focusable anchor after the buttons. */}
      <a href="#checkout">Proceed to Checkout</a>
    </div>
  );
}

function openDrawer(itemCount = 2) {
  const utils = render(<CartDrawerShell itemCount={itemCount}>{contents()}</CartDrawerShell>);
  const opener = screen.getByRole("button", { name: `Cart, ${itemCount} items` });
  fireEvent.click(opener);
  return { ...utils, opener, dialog: screen.getByRole("dialog") };
}

describe("cart drawer — dialog semantics (R2)", () => {
  it("exposes a dialog with aria-modal set", () => {
    const { dialog } = openDrawer();
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("takes its accessible name from the heading aria-labelledby points at", () => {
    const { dialog } = openDrawer(2);
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy, "dialog must be labelled by a heading, not a hardcoded string").toBeTruthy();

    const heading = document.getElementById(labelledBy!);
    expect(heading, `no element with id "${labelledBy}"`).toBeTruthy();
    expect(heading!.tagName).toBe("H2");

    const name = computeAccessibleName(dialog);
    expect(name).not.toBe("");
    expect(name).toBe(heading!.textContent?.trim());
    // The visible title carries the count, so the name is specific, not generic.
    expect(name).toContain("My Cart");
  });

  it("marks the opener as controlling a dialog and reflects its state", () => {
    const { opener } = openDrawer();
    expect(opener.getAttribute("aria-haspopup")).toBe("dialog");
    expect(opener.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("cart drawer — focus management (R3)", () => {
  const focusablesIn = (dialog: HTMLElement) =>
    Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );

  it("moves focus inside the drawer on open", () => {
    const { dialog } = openDrawer();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("wraps Tab from the last focusable back to the first", () => {
    const { dialog } = openDrawer();
    const panel = dialog.querySelector<HTMLElement>(".max-w-md")!;
    const focusable = focusablesIn(panel);
    expect(focusable.length).toBeGreaterThan(1);

    focusable[focusable.length - 1].focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(focusable[0]);
  });

  it("wraps Shift+Tab from the first focusable back to the last", () => {
    const { dialog } = openDrawer();
    const panel = dialog.querySelector<HTMLElement>(".max-w-md")!;
    const focusable = focusablesIn(panel);

    focusable[0].focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
  });

  it("returns focus to the cart button when the drawer closes", () => {
    const { opener } = openDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Close cart" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe("cart drawer — Escape (R4)", () => {
  it("closes on Escape and hands focus back", () => {
    const { opener } = openDrawer();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("still closes on Escape when focus has left the drawer", () => {
    // The reason key handling sits on `document` rather than on the dialog:
    // a handler bound to the container stops working the moment anything moves
    // focus out of it, which is exactly when Escape matters most.
    openDrawer();
    (document.activeElement as HTMLElement)?.blur();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("cart drawer — accessible names (R5)", () => {
  it("gives every interactive control a non-empty accessible name", () => {
    const { dialog } = openDrawer();
    const controls = Array.from(
      dialog.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea"),
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

  it("hides the backdrop from assistive tech instead of announcing a second close control", () => {
    const { dialog } = openDrawer();
    const backdrop = dialog.querySelector<HTMLElement>('button[aria-hidden="true"]');
    expect(backdrop).toBeTruthy();
    expect(backdrop!.getAttribute("tabindex")).toBe("-1");
    // Exactly one reachable "Close cart" — the header button.
    expect(within(dialog).getAllByRole("button", { name: "Close cart" })).toHaveLength(1);
  });
});

describe("cart drawer — heading order (R6)", () => {
  const levels = (root: HTMLElement) =>
    Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) => Number(h.tagName[1]));

  it("descends without skipping a level with items present", () => {
    const { dialog } = openDrawer(2);
    const seen = levels(dialog);
    expect(seen.length).toBeGreaterThan(0);
    seen.slice(1).forEach((level, i) => {
      expect(level - seen[i], `h${seen[i]} is followed by h${level}`).toBeLessThanOrEqual(1);
    });
  });

  it("descends without skipping a level when the cart is empty", () => {
    render(
      <CartDrawerShell itemCount={0}>
        <h3>Your cart is empty</h3>
      </CartDrawerShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cart, empty" }));
    const seen = levels(screen.getByRole("dialog"));
    expect(seen).toEqual([2, 3]);
  });
});

describe("cart drawer — no console errors (R9 sanity)", () => {
  it("renders and closes without React warnings", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { opener } = openDrawer();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(opener).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
