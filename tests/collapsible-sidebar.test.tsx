// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CollapsibleSidebar } from "@/components/product/CollapsibleSidebar";
import {
  FILTERS_COLLAPSED_ATTRIBUTE,
  FILTERS_COLLAPSED_SCRIPT,
} from "@/components/product/filters-collapsed";
import { FILTERS_COLLAPSED_KEY } from "@/lib/storage-keys";

/**
 * #1173 R10–R13, R15 — the collapsible browse sidebar.
 *
 * The toggle is a progressive enhancement: the server render (no JavaScript) has no button and the
 * column is there. Once mounted it hides and shows the column through the `<html>` attribute that
 * `app/globals.css` keys off, remembers the choice in `sessionStorage` for the tab, and moves focus
 * to the counterpart button.
 */

const root = () => document.documentElement;

function renderSidebar() {
  return render(
    <CollapsibleSidebar id="browse-sidebar">
      <nav aria-label="Collections">browse links</nav>
    </CollapsibleSidebar>,
  );
}

beforeEach(() => {
  root().removeAttribute(FILTERS_COLLAPSED_ATTRIBUTE);
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CollapsibleSidebar (#1173 R10–R12)", () => {
  it("server-renders no toggle, with the column content present (R10, no JavaScript)", () => {
    const html = renderToString(
      <CollapsibleSidebar id="browse-sidebar">
        <nav aria-label="Collections">browse links</nav>
      </CollapsibleSidebar>,
    );
    expect(html).not.toContain("<button");
    expect(html).toContain('id="browse-sidebar"');
    expect(html).toContain("browse links");
  });

  it("hides and shows the column, moving focus to the counterpart button (R10, R11)", () => {
    renderSidebar();
    const hide = screen.getByRole("button", { name: "Hide filters" });
    expect(hide.getAttribute("aria-expanded")).toBe("true");
    expect(hide.getAttribute("aria-controls")).toBe("browse-sidebar");

    fireEvent.click(hide);
    const show = screen.getByRole("button", { name: "Show filters" });
    expect(show.getAttribute("aria-expanded")).toBe("false");
    expect(show.getAttribute("aria-controls")).toBe("browse-sidebar");
    expect(document.activeElement).toBe(show);
    expect(root().hasAttribute(FILTERS_COLLAPSED_ATTRIBUTE)).toBe(true);

    fireEvent.click(show);
    const hideAgain = screen.getByRole("button", { name: "Hide filters" });
    expect(document.activeElement).toBe(hideAgain);
    expect(root().hasAttribute(FILTERS_COLLAPSED_ATTRIBUTE)).toBe(false);
  });

  it("starts collapsed when the attribute was set before paint (R13)", () => {
    root().setAttribute(FILTERS_COLLAPSED_ATTRIBUTE, "");
    renderSidebar();
    expect(screen.getByRole("button", { name: "Show filters" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Hide filters" })).toBeNull();
  });

  it("remembers the choice in sessionStorage only (R12)", () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Hide filters" }));
    expect(window.sessionStorage.getItem(FILTERS_COLLAPSED_KEY)).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Show filters" }));
    expect(window.sessionStorage.getItem(FILTERS_COLLAPSED_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).not.toContain(FILTERS_COLLAPSED_KEY);
  });

  it("keeps working when storage is blocked (R12)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderSidebar();
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "Hide filters" })),
    ).not.toThrow();
    expect(root().hasAttribute(FILTERS_COLLAPSED_ATTRIBUTE)).toBe(true);
  });
});

describe("the pre-paint script (#1173 R13)", () => {
  const run = () => act(() => new Function(FILTERS_COLLAPSED_SCRIPT)());

  it("sets the attribute when the tab collapsed earlier", () => {
    window.sessionStorage.setItem(FILTERS_COLLAPSED_KEY, "1");
    run();
    expect(root().hasAttribute(FILTERS_COLLAPSED_ATTRIBUTE)).toBe(true);
  });

  it("leaves it open otherwise, and swallows a storage error", () => {
    run();
    expect(root().hasAttribute(FILTERS_COLLAPSED_ATTRIBUTE)).toBe(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(run).not.toThrow();
  });

  it("names the key from lib/storage-keys.ts", () => {
    expect(FILTERS_COLLAPSED_SCRIPT).toContain(JSON.stringify(FILTERS_COLLAPSED_KEY));
    expect(FILTERS_COLLAPSED_SCRIPT.startsWith("try{")).toBe(true);
  });
});

describe("the extra product column (#1173 R15)", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const scope = "html[data-filters-collapsed] [data-filters-layout] [data-product-grid]";

  it("adds one column per density at lg and xl, scoped to the collapsible layout", () => {
    const lg = css.slice(css.indexOf("@media (min-width: 64rem)"));
    const xl = css.slice(css.indexOf("@media (min-width: 80rem)"));
    expect(lg).toContain(`${scope}[data-density="STANDARD"]`);
    expect(lg).toContain(`${scope}[data-density="COMPACT"]`);
    expect(lg).toMatch(/repeat\(5, minmax\(0, 1fr\)\)/);
    expect(lg).toMatch(/\[data-density="SPACIOUS"\] \{\s*grid-template-columns: repeat\(3,/);
    expect(xl).toMatch(/\[data-density="COMPACT"\] \{\s*grid-template-columns: repeat\(7,/);
    expect(xl).toMatch(/\[data-density="SPACIOUS"\] \{\s*grid-template-columns: repeat\(5,/);
  });
});
