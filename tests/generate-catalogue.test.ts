import { describe, expect, it } from "vitest";
import {
  GENERATED_SLUG_PREFIX,
  GENERATOR_SEED,
  generateProducts,
} from "../prisma/generate-catalogue";

/**
 * #489 R6/R6b — determinism of the generated catalogue.
 *
 * NOTE THE IMPORT PATH. This imports `prisma/generate-catalogue`, NEVER `prisma/seed`.
 * `prisma/seed.ts` calls `main()` at module scope, so importing it here would run the entire seed
 * against whatever database the environment resolves — as a side effect of `npx vitest run`. That
 * hazard is the whole reason the generator lives in its own module.
 */

const CATEGORIES = ["rice-grains", "lentils-pulses", "cooking-oils"];

/** The tuple R6 actually pins. Ids are excluded on purpose — they are uuids minted at write time
 *  and are not part of the reproducibility claim. */
function fingerprint(p: ReturnType<typeof generateProducts>[number]) {
  return [
    p.slug,
    p.name,
    p.basePrice,
    p.origin,
    p.isHalal,
    p.isFresh,
    p.isOrganic,
    p.quantity,
    p.categorySlug,
  ];
}

describe("generateProducts", () => {
  it("produces exactly the requested count", () => {
    expect(generateProducts(0, CATEGORIES)).toHaveLength(0);
    expect(generateProducts(1, CATEGORIES)).toHaveLength(1);
    expect(generateProducts(2000, CATEGORIES)).toHaveLength(2000);
  });

  it("is deterministic across calls with the same seed", () => {
    const first = generateProducts(500, CATEGORIES);
    const second = generateProducts(500, CATEGORIES);
    expect(first.map(fingerprint)).toEqual(second.map(fingerprint));
  });

  it("is deterministic at the default committed seed specifically", () => {
    const explicit = generateProducts(200, CATEGORIES, GENERATOR_SEED);
    const implicit = generateProducts(200, CATEGORIES);
    expect(explicit.map(fingerprint)).toEqual(implicit.map(fingerprint));
  });

  it("produces different data for a different seed", () => {
    const a = generateProducts(200, CATEGORIES, 1);
    const b = generateProducts(200, CATEGORIES, 2);
    // Slugs are index-derived so they match by construction; the generated *content* must not.
    expect(a.map((p) => p.name)).not.toEqual(b.map((p) => p.name));
  });

  it("gives every product the generated slug prefix, and slugs are unique", () => {
    const products = generateProducts(2000, CATEGORIES);
    expect(products.every((p) => p.slug.startsWith(GENERATED_SLUG_PREFIX))).toBe(true);
    expect(new Set(products.map((p) => p.slug)).size).toBe(2000);
  });

  it("spreads products evenly across every category it is given", () => {
    const products = generateProducts(300, CATEGORIES);
    const perCategory = new Map<string, number>();
    for (const p of products) {
      perCategory.set(p.categorySlug, (perCategory.get(p.categorySlug) ?? 0) + 1);
    }
    expect(perCategory.size).toBe(CATEGORIES.length);
    expect([...perCategory.values()]).toEqual([100, 100, 100]);
  });

  it("produces rows the catalogue filters can actually discriminate on", () => {
    const products = generateProducts(2000, CATEGORIES);
    // Each of these would make a filter or badge untestable if it came back empty or total.
    const some = (predicate: (p: (typeof products)[number]) => boolean) => {
      const n = products.filter(predicate).length;
      return n > 0 && n < products.length;
    };
    expect(some((p) => p.isHalal)).toBe(true);
    expect(some((p) => p.isFresh)).toBe(true);
    expect(some((p) => p.isOrganic)).toBe(true);
    expect(some((p) => p.origin === null)).toBe(true);
    expect(some((p) => p.quantity === 0)).toBe(true);
    expect(products.every((p) => p.basePrice > 0)).toBe(true);
  });

  it("rejects a negative count and an empty category list", () => {
    expect(() => generateProducts(-1, CATEGORIES)).toThrow(/count must be/);
    expect(() => generateProducts(10, [])).toThrow(/at least one category/);
  });
});
