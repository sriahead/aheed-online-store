/**
 * #489 — deterministic generated catalogue for scale testing.
 *
 * WHY THIS IS ITS OWN MODULE, AND NOT PART OF `prisma/seed.ts`.
 * `seed.ts` calls `main()` at module scope, so *importing* it runs the entire seed against
 * whatever database the environment happens to resolve. A unit test asserting this generator is
 * deterministic therefore cannot live behind an import of `seed.ts` — it would seed a real
 * database as a side effect of `npx vitest run`. Everything here is pure: no Prisma, no storage,
 * no `process.env` read, no I/O of any kind. `seed.ts` imports it, never the reverse.
 * (spec: specs/2026-08-31-catalogue-depth-and-scale/, R6b)
 *
 * WHY A SEEDED PRNG RATHER THAN `Math.random()`.
 * The generated catalogue is the substrate for a latency measurement recorded in
 * `docs/developer-portal/nfr-baseline.md`. A measurement taken against a catalogue nobody can
 * reproduce is an anecdote, so the same `SEED_SCALE_PRODUCTS` value must always produce byte-identical
 * rows. `Math.random()` cannot be seeded in JS; mulberry32 is 4 lines and is deterministic across
 * platforms and Node versions.
 */

/** Prefix on every generated slug. No curated fixture slug uses it — that is what makes the
 *  generated set identifiable for both the idempotency check and the removal path (R7). */
export const GENERATED_SLUG_PREFIX = "gen-";

/** Fixed, committed seed. Changing it changes every generated row, which invalidates any
 *  previously recorded measurement — treat it as part of the measurement's identity. */
export const GENERATOR_SEED = 20260831;

export type GeneratedProduct = {
  slug: string;
  name: string;
  description: string;
  categorySlug: string;
  basePrice: number;
  unitLabel: string;
  quantity: number;
  origin: string | null;
  isHalal: boolean;
  isFresh: boolean;
  isOrganic: boolean;
};

/** mulberry32 — small, fast, seedable. Returns a function yielding [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Word pools. Deliberately generic grocery vocabulary rather than anything resembling a real
 * Aheed or SriMart product: these rows exist to make queries work harder, and a generated row
 * that reads like genuine vendor merchandising is exactly the confusion #239 was filed over.
 */
const QUALIFIERS = [
  "Everyday",
  "Premium",
  "Value",
  "Classic",
  "Fresh",
  "Traditional",
  "Family",
  "Extra",
  "Golden",
  "Choice",
];

const NOUNS = [
  "Rice",
  "Lentils",
  "Flour",
  "Chickpeas",
  "Oil",
  "Spice Mix",
  "Tea",
  "Biscuits",
  "Noodles",
  "Chutney",
  "Yoghurt",
  "Paneer",
  "Bread",
  "Juice",
  "Dates",
  "Almonds",
  "Cashews",
  "Pickle",
  "Ghee",
  "Semolina",
];

const PACKS = ["250g", "500g", "1kg", "2kg", "5kg", "10kg", "Pack of 4", "Pack of 6", "1L", "2L"];

/** Country of origin. `null` is in the pool on purpose — `Product.origin` is nullable and the
 *  catalogue filter has to behave when it is absent, not only when it is set. */
const ORIGINS: (string | null)[] = [
  "United Kingdom",
  "India",
  "Pakistan",
  "Bangladesh",
  "Turkey",
  "Spain",
  "Morocco",
  "Sri Lanka",
  null,
  null,
];

function pick<T>(rng: () => number, pool: readonly T[]): T {
  return pool[Math.floor(rng() * pool.length)] as T;
}

function formatUnitLabel(pence: number, pack: string): string {
  const pounds = (pence / 100).toFixed(2);
  // Free text today (Product.unitLabel) — #398 is the issue that would make this derived.
  return pack.startsWith("Pack") ? `£${pounds} ${pack.toLowerCase()}` : `£${pounds} / ${pack}`;
}

/**
 * Produce exactly `count` products spread evenly across `categorySlugs`.
 *
 * Pure and deterministic: same `count`, same `categorySlugs` (same order) and same `seed` always
 * yield a deeply-equal array. Callers pass `vendorId` nowhere — this returns plain data, and the
 * caller decides what to write it into, which is what lets the determinism test run with no
 * database at all.
 */
export function generateProducts(
  count: number,
  categorySlugs: readonly string[],
  seed: number = GENERATOR_SEED,
): GeneratedProduct[] {
  if (count < 0) throw new Error(`generateProducts: count must be >= 0, got ${count}`);
  if (categorySlugs.length === 0) {
    throw new Error("generateProducts: needs at least one category slug to distribute across");
  }

  const rng = mulberry32(seed);
  const products: GeneratedProduct[] = [];

  for (let i = 0; i < count; i += 1) {
    const qualifier = pick(rng, QUALIFIERS);
    const noun = pick(rng, NOUNS);
    const pack = pick(rng, PACKS);
    const basePrice = 50 + Math.floor(rng() * 2450); // 50p - £25.00
    const origin = pick(rng, ORIGINS);
    const isHalal = rng() < 0.35;
    const isFresh = rng() < 0.25;
    const isOrganic = rng() < 0.15;
    // ~8% out of stock, so `inStockOnly` and the low-stock badge both have something to exclude.
    const quantity = rng() < 0.08 ? 0 : 1 + Math.floor(rng() * 120);

    const name = `${qualifier} ${noun} ${pack}`;
    // The index guarantees uniqueness against Product's @@unique([vendorId, slug]) without
    // needing to track collisions between generated names, which repeat by design.
    const slug = `${GENERATED_SLUG_PREFIX}${i}-${noun.toLowerCase().replace(/\s+/g, "-")}`;

    products.push({
      slug,
      name,
      description: `${name} — generated catalogue row for scale testing (#489).`,
      // Even, deterministic spread. Round-robin rather than random so every category is
      // populated regardless of `count`, which keeps per-category query timings comparable.
      categorySlug: categorySlugs[i % categorySlugs.length] as string,
      basePrice,
      unitLabel: formatUnitLabel(basePrice, pack),
      quantity,
      origin,
      isHalal,
      isFresh,
      isOrganic,
    });
  }

  return products;
}
