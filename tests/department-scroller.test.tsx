// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";

/**
 * #1223. A CLIENT component (`DepartmentScroller` is `"use client"`) renders `Icon` for a department that
 * has no illustration. Phase 4a (R44, R45) supersedes the Phase 1 assertions that every tile carried an
 * inline `svg` at `h-7 w-7`: a department with an illustration now shows a static `<img>`; the full
 * behaviour is in `tests/department-illustrations.test.tsx`. What stays here is the unmapped branch.
 */

afterEach(cleanup);

const CATEGORIES = [
  { id: "1", slug: "fruit-veg", name: "Fruit & Veg" },
  { id: "2", slug: "chargers", name: "Chargers" },
];

describe("DepartmentScroller renders Icon from a client component (R22, R44)", () => {
  it("renders the neutral tag glyph for a department with no illustration, not a grocery icon (#729)", () => {
    const { container } = render(<DepartmentScroller categories={[CATEGORIES[1]]} />);
    const svg = container.querySelector("a[href='/categories/chargers'] svg")!;
    expect(svg.getAttribute("data-icon")).toBe("tag");
    expect(svg.getAttribute("class")).toBe("h-7 w-7 text-primary");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("24");
  });

  it("renders one tile per department, each either an illustration or an svg", () => {
    const { container } = render(<DepartmentScroller categories={CATEGORIES} />);
    const tiles = [...container.querySelectorAll("a[href^='/categories/']")];
    expect(tiles).toHaveLength(2);
    expect(tiles[0].querySelector("img")).not.toBeNull();
    expect(tiles[1].querySelector("svg[data-icon]")).not.toBeNull();
  });
});
