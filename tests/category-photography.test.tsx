// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { composeCategoryImageUrl } from "@/lib/repositories/categories";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";
import { DepartmentGlyph } from "@/components/layout/DepartmentGlyph";

afterEach(cleanup);

const ROOT = join(__dirname, "..");
const CATEGORIES_DIR = join(ROOT, "public/images/categories");

const EXPECTED_SLUGS = [
  "fruit-veg",
  "bakery",
  "dairy-eggs",
  "halal-meat",
  "groceries",
  "beverages",
  "snacks",
  "household",
  "frozen-foods",
  "international",
  "health-beauty",
  "baby-kids",
  "pet-supplies",
  "sri-electronics",
  "sri-home",
];

describe("Category Photography Assets (#1278)", () => {
  it("every active department has a corresponding realistic product photograph in public/images/categories/", () => {
    for (const slug of EXPECTED_SLUGS) {
      const filePath = join(CATEGORIES_DIR, `${slug}.jpg`);
      expect(existsSync(filePath), `Missing asset: ${filePath}`).toBe(true);

      const size = statSync(filePath).size;
      expect(size).toBeGreaterThan(1024); // at least 1 KB
      expect(size).toBeLessThan(1024 * 100); // under 100 KB for fast loading
    }
  });
});

describe("composeCategoryImageUrl (#1278)", () => {
  it("composes with CDN_BASE_URL when imageKey and cdnBaseUrl are provided", () => {
    expect(
      composeCategoryImageUrl("categories/custom.jpg", "fruit-veg", "https://images.example.com"),
    ).toBe("https://images.example.com/categories/custom.jpg");
  });

  it("handles leading/trailing slashes in CDN URL composition", () => {
    expect(
      composeCategoryImageUrl("categories/custom.jpg", "fruit-veg", "https://images.example.com/"),
    ).toBe("https://images.example.com/categories/custom.jpg");
  });

  it("falls back to canonical static category photograph when imageKey is absent", () => {
    expect(composeCategoryImageUrl(null, "bakery", "https://images.example.com")).toBe(
      "/images/categories/bakery.jpg",
    );
    expect(composeCategoryImageUrl(undefined, "groceries")).toBe(
      "/images/categories/groceries.jpg",
    );
  });

  it("returns explicit root paths directly", () => {
    expect(composeCategoryImageUrl("/custom/path.jpg", "bakery")).toBe("/custom/path.jpg");
  });
});

describe("DepartmentScroller Photography Rendering (#1278)", () => {
  const TEST_CATEGORIES = EXPECTED_SLUGS.map((slug, idx) => ({
    id: `cat-${idx}`,
    slug,
    name: slug.toUpperCase(),
    imageUrl: `/images/categories/${slug}.jpg`,
  }));

  it("renders realistic category photographs when imageUrl is provided", () => {
    const { container } = render(<DepartmentScroller categories={TEST_CATEGORIES} />);
    const fruitTile = container.querySelector("a[href='/categories/fruit-veg']")!;
    const img = fruitTile.querySelector("img")!;

    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("/images/categories/fruit-veg.jpg");
    // #1288 R17: every department tile is the circular medallion, photo or not.
    expect(fruitTile.querySelector("[data-medallion]")?.className).toContain("rounded-full");
  });

  it("eager loads the first 6 category photographs and lazy loads subsequent ones", () => {
    const { container } = render(<DepartmentScroller categories={TEST_CATEGORIES} />);
    const images = [...container.querySelectorAll("a[href^='/categories/'] img")];

    expect(images.length).toBe(15);
    for (let i = 0; i < 6; i++) {
      expect(images[i].getAttribute("loading")).toBe("eager");
    }
    for (let i = 6; i < images.length; i++) {
      expect(images[i].getAttribute("loading")).toBe("lazy");
    }
  });

  it("DepartmentGlyph renders category photograph when imageUrl is supplied", () => {
    const { container } = render(
      <DepartmentGlyph slug="bakery" imageUrl="/images/categories/bakery.jpg" />,
    );
    const img = container.querySelector("img")!;
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("/images/categories/bakery.jpg");
  });
});
