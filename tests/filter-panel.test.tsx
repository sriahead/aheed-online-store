// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { FilterPanel } from "@/components/product/FilterPanel";

/**
 * P2.6 slice 5 (#568), R1/R3/R4.
 *
 * What these actually protect is the PROGRESSIVE-ENHANCEMENT decision, not the markup. The filter
 * surface was specified as a modal drawer and was deliberately built as a `details` disclosure,
 * because filters stack above the results today and a shopper with JavaScript off therefore has
 * them — a client-only drawer would have taken that away. Every assertion below is a way for that
 * decision to fail silently: a `"use client"` added later, dialog semantics copied in from
 * `CartDrawerShell`, or an `open` attribute that quietly makes the disclosure a permanent panel.
 */

afterEach(cleanup);

const NO_SPECIALITIES = { halal: false, fresh: false, organic: false };

function renderPanel() {
  return render(
    <FilterPanel heading="Search & filters" searchParams={{}} specialities={NO_SPECIALITIES} />,
  );
}

describe("FilterPanel structure (R1)", () => {
  it("renders the filter form twice — once per breakpoint container", () => {
    const { container } = renderPanel();
    expect(container.querySelectorAll("form[method='GET']")).toHaveLength(2);
  });

  it("puts one form inside a md:hidden details disclosure", () => {
    const { container } = renderPanel();
    const details = container.querySelector("details");

    expect(details).not.toBeNull();
    expect(details?.className).toContain("md:hidden");
    expect(details?.querySelectorAll("form[method='GET']")).toHaveLength(1);
  });

  it("puts the other form inside a container hidden below md", () => {
    const { container } = renderPanel();
    const sidebar = container.querySelector("aside");

    expect(sidebar?.className).toContain("hidden");
    expect(sidebar?.className).toContain("md:block");
    expect(sidebar?.querySelectorAll("form[method='GET']")).toHaveLength(1);
  });
});

describe("FilterPanel is a disclosure, not a dialog (R3, R4)", () => {
  it("renders the details closed", () => {
    const { container } = renderPanel();
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
  });

  it("carries no dialog semantics", () => {
    const { container } = renderPanel();
    expect(container.querySelector("[aria-modal]")).toBeNull();
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  /**
   * Source-level rather than render-level on purpose: a `"use client"` directive or a
   * `usePathname` close-on-navigate effect would not change the rendered output at all, and both
   * are exactly what someone reaching for the cart drawer's pattern would add.
   */
  it("is a server component with no navigation effect", () => {
    const source = readFileSync("components/product/FilterPanel.tsx", "utf8");

    // Matched as the MECHANISM, not as a substring: this file's own docstring explains why it has
    // no `"use client"` directive and no `aria-modal`, so a plain `toContain` check would be
    // failed by the very comment documenting the decision. A directive is only a directive as the
    // file's first statement, and the others only matter as a real import or a JSX attribute.
    expect(source.trimStart().startsWith('"use client"')).toBe(false);
    expect(source.trimStart().startsWith("'use client'")).toBe(false);
    expect(source).not.toMatch(/import\s*\{[^}]*usePathname/);
    expect(source).not.toMatch(/aria-modal=/);
    // Hook CALLS, not the words — the docstring above names `useEffect` while explaining why this
    // component has none.
    expect(source).not.toMatch(/\buseEffect\(|\buseState\(/);
  });
});
