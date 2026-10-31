// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ICON_REGISTRY } from "@/components/icons/registry";
import { DepartmentGlyph } from "@/components/layout/DepartmentGlyph";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";

/**
 * #1288 R15-R18: the circular medallion is the only frame for 3D icons, large decorative icons and
 * category imagery — enforced over the source tree so new code cannot quietly bypass it.
 *
 * Rule 1 (R15): `<Icon3D` JSX appears only under `components/icons/`.
 * Rule 2 (R16): outside `components/icons/`, a LARGE `<Icon>` (size="xl"|"2xl", or an h-N/w-N class
 *   with N >= 8, i.e. >= 32 px) must name a functional icon by string literal; anything else
 *   renders through `IconMedallion`.
 */

afterEach(cleanup);

const ROOT = join(__dirname, "..");
const SCANNED = ["app", "components", "features"];
const EXEMPT = `components${sep}icons${sep}`;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === "generated") continue;
      out.push(...tsxFiles(path));
    } else if (path.endsWith(".tsx")) {
      out.push(path);
    }
  }
  return out;
}

const FILES = SCANNED.flatMap((dir) => tsxFiles(join(ROOT, dir)))
  .map((path) => relative(ROOT, path))
  .filter((path) => !path.startsWith(EXEMPT));

const FUNCTIONAL = new Set<string>([
  ...Object.entries(ICON_REGISTRY)
    .filter(([, entry]) => entry.tier === "functional")
    .map(([name]) => name),
  "star",
]);

/** Every `<Icon …>` opening element (not Icon3D/IconMedallion), quote- and brace-aware. */
function iconElements(source: string): { text: string; line: number }[] {
  const found: { text: string; line: number }[] = [];
  const opener = /<Icon(?=[\s/>])/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source))) {
    let depth = 0;
    let quote: string | null = null;
    let end = -1;
    for (let i = match.index + 5; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1) continue;
    found.push({
      text: source.slice(match.index, end + 1),
      line: source.slice(0, match.index).split("\n").length,
    });
  }
  return found;
}

function isLarge(element: string): boolean {
  if (/\bsize="(xl|2xl)"/.test(element)) return true;
  for (const m of element.matchAll(/(?:^|[\s"'`:])[hw]-(\d+)\b/g)) {
    if (Number(m[1]) >= 8) return true;
  }
  return false;
}

function violations(files: string[]): string[] {
  const bad: string[] = [];
  for (const file of files) {
    const source = readFileSync(join(ROOT, file), "utf8");
    for (const { text, line } of iconElements(source)) {
      if (!isLarge(text)) continue;
      const literal = text.match(/\bname="([a-z0-9-]+)"/);
      if (literal && FUNCTIONAL.has(literal[1])) continue;
      bad.push(`${file}:${line} ${text.replace(/\s+/g, " ").slice(0, 100)}`);
    }
  }
  return bad;
}

describe("medallion coverage over the source tree", () => {
  it("scans a real tree", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("R15: no <Icon3D outside components/icons/", () => {
    const offenders = FILES.filter((file) =>
      /<Icon3D\b/.test(readFileSync(join(ROOT, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("R16: no large non-functional <Icon> outside components/icons/", () => {
    expect(violations(FILES)).toEqual([]);
  });

  it("R16: the rule catches a large decorative icon and a dynamic name, and allows a spinner", () => {
    expect(isLarge(`<Icon name="package" className="mx-auto h-8 w-8" />`)).toBe(true);
    expect(isLarge(`<Icon name="package" className="h-6 w-6" />`)).toBe(false);
    expect(isLarge(`<Icon name="package" size="2xl" />`)).toBe(true);
    expect(isLarge(`<Icon name={x} className="h-24 w-24 md:h-32" />`)).toBe(true);
    const elements = iconElements(
      `<Icon name="loader-circle" className="h-8 w-8 animate-spin" />\n<Icon3D name="a" />\n<IconMedallion icon="b" size={32} />`,
    );
    expect(elements).toHaveLength(1);
  });

  it("R18: product photography never uses the medallion", () => {
    for (const file of [
      "components/product/ProductCard.tsx",
      "components/product/ProductImageGallery.tsx",
    ]) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).not.toContain("IconMedallion");
    }
  });
});

describe("category imagery renders in the medallion (#1288 R17)", () => {
  const CATEGORIES = [
    {
      id: "c1",
      slug: "fruit-veg",
      name: "Fruit & Veg",
      imageUrl: "/images/categories/fruit-veg.jpg",
    },
    { id: "c2", slug: "halal-meat", name: "Halal Meat", imageUrl: null },
    { id: "c3", slug: "chargers", name: "Chargers", imageUrl: null },
  ];

  it("DepartmentScroller: photo, 3D and glyph tiles are all action-tinted medallions", () => {
    const { container } = render(
      <DepartmentScroller categories={CATEGORIES as never} activeSlug="halal-meat" use3D />,
    );
    const medallions = [...container.querySelectorAll<HTMLElement>("[data-medallion]")].filter(
      (element) => element.parentElement?.tagName === "A",
    );
    expect(medallions).toHaveLength(3);
    for (const medallion of medallions) {
      expect(medallion.className).toContain("bg-action-tint");
      expect(medallion.className).toContain("rounded-full");
    }
    expect(medallions[0].getAttribute("data-medallion-source")).toBe("photo");
    const active = container.querySelector("a[href='/categories/halal-meat'] [data-medallion]");
    expect(active?.className).toContain("ring-action");
  });

  it("DepartmentScroller no longer alternates tints", () => {
    expect(
      readFileSync(join(ROOT, "components/layout/DepartmentScroller.tsx"), "utf8"),
    ).not.toContain("bg-accent-tint");
  });

  it("DepartmentGlyph renders a medallion with and without a photo", () => {
    const { container: photo } = render(
      <DepartmentGlyph slug="fruit-veg" imageUrl="/images/categories/fruit-veg.jpg" />,
    );
    expect(photo.querySelector("[data-medallion]")).not.toBeNull();
    cleanup();
    const { container: glyph } = render(<DepartmentGlyph slug="chargers" />);
    expect(glyph.querySelector("[data-medallion]")).not.toBeNull();
  });

  it("the staff gallery and category manager preview through the medallion", () => {
    for (const file of [
      "components/staff/IconGalleryClient.tsx",
      "components/staff/CategoryImageManager.tsx",
    ]) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).toContain("<IconMedallion");
    }
  });
});
