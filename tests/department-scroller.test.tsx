// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";

/**
 * Proves R22's third clause (#1223): a CLIENT component (`DepartmentScroller` is `"use client"`) renders
 * `Icon`. `Icon` itself is a plain function, so the same markup comes out on both sides of the boundary;
 * this is the test that shows it from inside a client component.
 *
 * Also the behaviour-preservation check for this file's own migration: the tile keeps the classes it had
 * when it rendered `lucide-react` directly (`h-7 w-7 text-primary`), and the icon stays `aria-hidden`.
 */

afterEach(cleanup);

const CATEGORIES = [
  { id: "1", slug: "fruit-veg", name: "Fruit & Veg" },
  { id: "2", slug: "chargers", name: "Chargers" },
];

describe("DepartmentScroller renders Icon from a client component (R22)", () => {
  it("renders one svg per department, named by categoryIconName", () => {
    const { container } = render(<DepartmentScroller categories={CATEGORIES} />);
    const icons = [...container.querySelectorAll("svg[data-icon]")].filter((svg) =>
      svg.closest("a[href^='/categories/']"),
    );
    expect(icons.map((svg) => svg.getAttribute("data-icon"))).toEqual(["apple", "tag"]);
  });

  it("an unmapped slug gets the neutral tag glyph, not a grocery icon (#729)", () => {
    const { container } = render(<DepartmentScroller categories={[CATEGORIES[1]]} />);
    expect(
      container.querySelector("a[href='/categories/chargers'] svg")?.getAttribute("data-icon"),
    ).toBe("tag");
  });

  it("keeps the classes it had before the migration, and stays aria-hidden", () => {
    const { container } = render(<DepartmentScroller categories={[CATEGORIES[0]]} />);
    const svg = container.querySelector("a[href='/categories/fruit-veg'] svg")!;
    expect(svg.getAttribute("class")).toBe("h-7 w-7 text-primary");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("24");
  });
});
