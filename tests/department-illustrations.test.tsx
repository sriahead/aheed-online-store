// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEPARTMENT_ILLUSTRATIONS, departmentIllustration } from "@/components/icons/illustrations";
import { DepartmentGlyph } from "@/components/layout/DepartmentGlyph";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";

/**
 * Proves #1223 Phase 4a, R42 to R47 and R49: the department illustrations.
 *
 * They are static files, written by `npm run icons:build` and shown with `<img>`; the markup is checked
 * from inside a client component (`DepartmentScroller` is `"use client"`), which is where it ships.
 */

afterEach(cleanup);

const ROOT = join(__dirname, "..");
const DIRECTORY = join(ROOT, "public/illustrations/departments");

const EXPECTED: Record<string, string> = {
  "fruit-veg": "red-apple",
  bakery: "croissant",
  "dairy-eggs": "glass-of-milk",
  "halal-meat": "cut-of-meat",
  groceries: "shopping-cart",
  international: "globe-showing-europe-africa",
  beverages: "hot-beverage",
  snacks: "cookie",
  household: "soap",
  "frozen-foods": "ice-cream",
  "health-beauty": "lipstick",
  "baby-kids": "teddy-bear",
  "pet-supplies": "dog-face",
  fish: "fish",
  "sri-electronics": "headphone",
  "sri-home": "light-bulb",
};

describe("illustration map (R42)", () => {
  it("maps exactly the 16 slugs to the 16 Noto ids", () => {
    expect({ ...DEPARTMENT_ILLUSTRATIONS }).toEqual(EXPECTED);
  });

  it("returns the public path for a mapped slug and null for anything else", () => {
    expect(departmentIllustration("fruit-veg")).toBe("/illustrations/departments/fruit-veg.svg");
    expect(departmentIllustration("chargers")).toBeNull();
    expect(departmentIllustration("")).toBeNull();
    // Inherited object keys are not departments.
    expect(departmentIllustration("constructor")).toBeNull();
    expect(departmentIllustration("__proto__")).toBeNull();
  });
});

describe("generated files (R43)", () => {
  const files = readdirSync(DIRECTORY).sort();

  it("holds exactly one <slug>.svg per mapped slug", () => {
    expect(files).toEqual(
      Object.keys(EXPECTED)
        .map((slug) => `${slug}.svg`)
        .sort(),
    );
  });

  it("each is a safe, small, standalone SVG", () => {
    let total = 0;
    for (const file of files) {
      const path = join(DIRECTORY, file);
      const text = readFileSync(path, "utf8");
      const bytes = statSync(path).size;
      total += bytes;
      expect(text.startsWith("<svg"), file).toBe(true);
      expect(text, file).toContain("viewBox");
      expect(text, file).not.toMatch(/<script|<foreignObject|javascript:|\son[a-z]+\s*=/i);
      expect(bytes, file).toBeLessThanOrEqual(16_384);
    }
    expect(total).toBeLessThanOrEqual(98_304);
  });
});

const MAPPED = ["fruit-veg", "bakery", "dairy-eggs", "halal-meat", "groceries", "international"];
const CATEGORIES = [
  ...MAPPED.map((slug, index) => ({ id: String(index), slug, name: slug })),
  { id: "6", slug: "snacks", name: "snacks" },
  { id: "7", slug: "chargers", name: "Chargers" },
];

describe("DepartmentScroller (R44, R45, R47)", () => {
  it("a mapped slug renders its illustration as an <img> and no inline svg for that tile", () => {
    const { container } = render(<DepartmentScroller categories={CATEGORIES} />);
    const tile = container.querySelector("a[href='/categories/fruit-veg']")!;
    const img = tile.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/illustrations/departments/fruit-veg.svg");
    expect(img.getAttribute("alt")).toBe("");
    expect(tile.querySelector("svg")).toBeNull();
  });

  it("an unmapped slug renders the neutral decorative glyph and no <img> (#729)", () => {
    const { container } = render(<DepartmentScroller categories={CATEGORIES} />);
    const tile = container.querySelector("a[href='/categories/chargers']")!;
    expect(tile.querySelector("img")).toBeNull();
    expect(tile.querySelector("svg")?.getAttribute("data-icon")).toBe("tag");
  });

  it("keeps the 64px tile, a 48px illustration and alternates the tint by position", () => {
    const { container } = render(<DepartmentScroller categories={CATEGORIES} />);
    const tiles = [...container.querySelectorAll("a[href^='/categories/']")];
    tiles.forEach((tile, index) => {
      const box = tile.querySelector("div")!;
      expect(box.className).toContain("h-16 w-16");
      expect(box.className).toContain(index % 2 === 0 ? "bg-action-tint" : "bg-accent-tint");
      expect(box.className).not.toContain(index % 2 === 0 ? "bg-accent-tint" : "bg-action-tint");
      const img = tile.querySelector("img");
      if (img) expect(img.getAttribute("class")).toBe("h-12 w-12");
    });
  });

  it("gives every image its size and async decoding; the first six load eagerly, the rest lazily", () => {
    const { container } = render(<DepartmentScroller categories={CATEGORIES} />);
    const images = [...container.querySelectorAll("img")];
    expect(images).toHaveLength(7);
    images.forEach((img, index) => {
      expect(img.getAttribute("width")).toBe("48");
      expect(img.getAttribute("height")).toBe("48");
      expect(img.getAttribute("decoding")).toBe("async");
      expect(img.getAttribute("loading")).toBe(index < 6 ? "eager" : "lazy");
    });
  });
});

describe("DepartmentGlyph (R46)", () => {
  it("a mapped slug renders the illustration at the hero size", () => {
    const { container } = render(<DepartmentGlyph slug="halal-meat" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/illustrations/departments/halal-meat.svg");
    expect(img.getAttribute("class")).toBe("h-24 w-24 md:h-32 md:w-32");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("an unmapped slug renders the neutral glyph with the thin stroke", () => {
    const { container } = render(<DepartmentGlyph slug="chargers" />);
    expect(container.querySelector("img")).toBeNull();
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("data-icon")).toBe("tag");
    expect(svg.getAttribute("stroke-width")).toBe("1.25");
  });

  it("is the one glyph DepartmentHero renders, in both of its places", () => {
    const source = readFileSync(join(ROOT, "components/layout/DepartmentHero.tsx"), "utf8");
    expect(source.match(/<DepartmentGlyph\b/g)).toHaveLength(2);
    expect(source).not.toContain("categoryIconName");
  });
});

describe("components/icons names no vendor and no department outside illustrations.ts (R49)", () => {
  const names = [...Object.keys(EXPECTED), ...Object.values(EXPECTED)];
  const vendors = [/aheed/i, /srimart/i, /\bsri-/i];

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return entry === "generated" ? [] : sourceFiles(path);
      return /\.tsx?$/.test(entry) ? [path] : [];
    });
  }

  it("holds", () => {
    const offenders: string[] = [];
    for (const path of sourceFiles(join(ROOT, "components/icons"))) {
      const name = path.split("/").pop()!;
      const text = readFileSync(path, "utf8");
      for (const vendor of vendors) {
        // illustrations.ts is the one file that names the slugs, including the SriMart ones.
        if (name !== "illustrations.ts" && vendor.test(text)) offenders.push(`${name}: ${vendor}`);
      }
      // registry.ts keeps its Lucide semantic names (`apple`, `milk`, `cookie` ...) from Phase 1; those are
      // icon names, not department art, so only the slug and Noto-id checks skip it.
      if (name === "illustrations.ts" || name === "registry.ts") continue;
      for (const word of names) {
        if (new RegExp(`["'\`]${word}["'\`]`).test(text)) offenders.push(`${name}: "${word}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
