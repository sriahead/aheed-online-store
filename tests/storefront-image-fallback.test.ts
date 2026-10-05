import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #655 — a stored image whose object is missing must not show the browser's broken-image icon on
 * any storefront page. `components/ui/ImageWithFallback.tsx` is the one place a storefront `<img>`
 * is written; every other storefront file renders through it (or through `ProductImage`, which
 * wraps it). A new bare `<img>` would compile, pass every other check and look fine until an
 * environment's bucket lost an object, so this reads the source.
 *
 * The pattern is a JSX `img` tag at the start of a line. Comments that mention `<img>` (several
 * explain why the project uses plain `<img>` rather than `next/image`, #46) start with `//` or `*`
 * and do not match. Staff pages are out of scope: `#655` is storefront-only.
 */

const root = join(__dirname, "..");
const SCANNED = ["components", join("app", "(storefront)"), join("app", "(landing)")];
const EXCLUDED = [join("components", "staff")];
const ALLOWED = "components/ui/ImageWithFallback.tsx";
const JSX_IMG = /^\s*<img\b/m;

function tsxFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((entry) => {
    const path = join(dir, entry);
    if (EXCLUDED.includes(path)) return [];
    if (statSync(join(root, path)).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

const posix = (path: string) => relative(root, join(root, path)).split(sep).join("/");

/** The surfaces `#655` named, plus the header logo (specs/2026-10-04-p979-655-storefront-finish). */
const SURFACES = [
  "components/product/ProductImageGallery.tsx",
  "components/cart/CartContents.tsx",
  "components/bundle/BundleCard.tsx",
  "components/layout/DepartmentHero.tsx",
  "components/layout/Header.tsx",
];

describe("storefront images degrade instead of breaking", () => {
  const files = SCANNED.flatMap(tsxFiles).map(posix);

  it("scans a real set of files", () => {
    expect(files).toContain(ALLOWED);
    expect(files.length).toBeGreaterThan(50);
  });

  it(`only ${ALLOWED} writes a JSX <img>`, () => {
    const offenders = files.filter(
      (file) => file !== ALLOWED && JSX_IMG.test(readFileSync(join(root, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  for (const file of SURFACES) {
    it(`${file} renders through ImageWithFallback or ProductImage`, () => {
      expect(readFileSync(join(root, file), "utf8")).toMatch(
        /import \{ (?:ImageWithFallback|ProductImage) \} from "@\/components\/(?:ui\/ImageWithFallback|product\/ProductImage)"/,
      );
    });
  }
});
