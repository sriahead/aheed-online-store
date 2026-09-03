import { describe, expect, it, vi } from "vitest";
import {
  SEARCH_CANDIDATE_LIMIT,
  buildFilterWhere,
  listProducts,
  searchProducts,
  type ProductFilters,
} from "@/lib/repositories/products";

/**
 * P2.6 slice 1 (#564), R6/R7/R8/R15/R16/R17/R18.
 *
 * WHY A STUB CLIENT RATHER THAN NEON.
 * Two of these requirements are NEGATIVES, and a live query cannot demonstrate
 * a negative. R7 says the empty-query guard issues no database query at all —
 * only a spy can show a call did not happen. R8 says the composed `where` still
 * carries every filter — a live result set that happens to look right is
 * consistent with a filter having been dropped. The live half of both lives in
 * `scripts/verify-search-slice.ts` as additional confidence, not as the proof.
 *
 * This is also only possible because `searchProducts` takes `prisma` as a
 * parameter (#252, #409) — the property
 * `tests/repository-client-injection.test.ts` exists to protect.
 */

type Row = ReturnType<typeof row>;

function row(i: number, over: Partial<{ name: string; quantity: number | null }> = {}) {
  return {
    id: `p${String(i).padStart(3, "0")}`,
    slug: `product-${i}`,
    name: over.name ?? `Basmati Rice ${i}`,
    basePrice: 100 + i,
    unitLabel: "each",
    origin: null,
    originalPrice: null,
    isHalal: false,
    isFresh: false,
    isOrganic: false,
    averageRating: 0,
    reviewCount: 0,
    images: [] as { storageKey: string; alt: string; isPrimary: boolean }[],
    inventory:
      over.quantity === null ? null : { quantity: over.quantity ?? 5, lowStockThreshold: 3 },
  };
}

/**
 * Every method is a spy, including ones `searchProducts` should never touch —
 * that is what makes R7's "no query at all" checkable rather than merely "no
 * findMany".
 */
function makeStub(rows: Row[]) {
  const spies = {
    // Typed to ACCEPT an argument so `mock.calls[0][0]` is a real value rather
    // than an empty tuple — the captured args are what most of this file
    // asserts on.
    productFindMany: vi.fn(async (_args: unknown) => rows),
    productFindFirst: vi.fn(async (_args: unknown) => null),
    productCount: vi.fn(async (_args: unknown) => rows.length),
    productCreate: vi.fn(async (_args: unknown) => null),
    productUpdate: vi.fn(async (_args: unknown) => null),
    tierFindMany: vi.fn(async (_args: unknown) => [] as unknown[]),
  };

  const client = {
    product: {
      findMany: spies.productFindMany,
      findFirst: spies.productFindFirst,
      count: spies.productCount,
      create: spies.productCreate,
      update: spies.productUpdate,
    },
    productPriceTier: { findMany: spies.tierFindMany },
  };

  return { client: client as never, spies };
}

const VENDOR = "vendor-1";

type Spies = ReturnType<typeof makeStub>["spies"];

type AnyRecord = Record<string, never>;

function capturedArgs(spies: Spies) {
  return spies.productFindMany.mock.calls[0][0] as AnyRecord;
}

function capturedWhere(spies: Spies) {
  return capturedArgs(spies).where as unknown as AnyRecord;
}

describe("searchProducts predicate (R6)", () => {
  it("ANDs one clause per term, each matching name OR description", async () => {
    const { client, spies } = makeStub([row(1)]);
    await searchProducts(client, VENDOR, "basmati rice", { take: 12 });

    const where = capturedWhere(spies);
    expect(where.AND).toHaveLength(2);
    for (const [index, term] of ["basmati", "rice"].entries()) {
      expect(where.AND[index]).toEqual({
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { description: { contains: term, mode: "insensitive" } },
        ],
      });
    }
  });
});

describe("empty-query guard (R7)", () => {
  it.each(["", "   ", " ,. "])("issues no database query at all for %j", async (query) => {
    const { client, spies } = makeStub([row(1)]);

    const result = await searchProducts(client, VENDOR, query, { take: 12 });

    expect(result).toEqual({ items: [], nextCursor: null, truncated: false });
    // The assertion that actually proves the requirement.
    for (const [name, spy] of Object.entries(spies)) {
      expect(spy, `${name} should not have been called`).toHaveBeenCalledTimes(0);
    }
  });
});

describe("filters, vendor scoping and active-only survive tokenisation (R8)", () => {
  it("composes vendorId, isActive and every filter control into the where", async () => {
    const filters: ProductFilters = {
      minPricePence: 100,
      maxPricePence: 900,
      inStockOnly: true,
      isHalal: true,
      isFresh: true,
      isOrganic: true,
      isFeatured: true,
    };

    const { client, spies } = makeStub([row(1)]);
    await searchProducts(client, VENDOR, "rice", { take: 12, ...filters });

    const where = capturedWhere(spies);
    expect(where.vendorId).toBe(VENDOR);
    expect(where.isActive).toBe(true);

    // Compared against the helper's own output, so the expectation cannot drift
    // away from what the helper actually builds.
    const expected = buildFilterWhere(filters);
    expect(Object.keys(expected).length).toBeGreaterThanOrEqual(6);
    for (const [key, value] of Object.entries(expected)) {
      expect(where[key as keyof typeof where]).toEqual(value);
    }
  });
});

describe("bounded candidate fetch (R15)", () => {
  it("is capped at 200", () => {
    expect(SEARCH_CANDIDATE_LIMIT).toBe(200);
  });

  it("fetches the cap plus one sentinel row, in a total order", async () => {
    const { client, spies } = makeStub([row(1)]);
    await searchProducts(client, VENDOR, "rice", { take: 12 });

    const args = capturedArgs(spies);
    expect(args.take).toBe(SEARCH_CANDIDATE_LIMIT + 1);
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    // Offset cursor, not keyset — findPage's cursor/skip must not appear here.
    expect(args.cursor).toBeUndefined();
    expect(args.skip).toBeUndefined();
  });

  it("never lets the sentinel row reach a rendered page", async () => {
    const rows = Array.from({ length: SEARCH_CANDIDATE_LIMIT + 1 }, (_, i) => row(i));
    const sentinelId = rows[SEARCH_CANDIDATE_LIMIT].id;

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const { client } = makeStub(rows);
      const page = await searchProducts(client, VENDOR, "rice", { take: 25, cursor });
      seen.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(seen).toHaveLength(SEARCH_CANDIDATE_LIMIT);
    expect(new Set(seen).size).toBe(SEARCH_CANDIDATE_LIMIT);
    expect(seen).not.toContain(sentinelId);
  });
});

describe("offset cursor (R16)", () => {
  const rows = Array.from({ length: 30 }, (_, i) => row(i));

  it.each([undefined, "abc", "-5", "1.5", ""])(
    "treats %j as the first page rather than throwing",
    async (cursor) => {
      const { client } = makeStub(rows);
      const page = await searchProducts(client, VENDOR, "rice", { take: 12, cursor });

      const { client: baseline } = makeStub(rows);
      const first = await searchProducts(baseline, VENDOR, "rice", { take: 12 });

      expect(page.items.map((p) => p.id)).toEqual(first.items.map((p) => p.id));
      expect(page.nextCursor).toBe(first.nextCursor);
    },
  );

  it("returns an honest empty page at and beyond the candidate count", async () => {
    const { client: base } = makeStub(rows);
    const firstPage = await searchProducts(base, VENDOR, "rice", { take: 12 });

    for (const cursor of [String(rows.length), String(rows.length + 500)]) {
      const { client } = makeStub(rows);
      const page = await searchProducts(client, VENDOR, "rice", { take: 12, cursor });

      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeNull();
      // The real value, not a hardcoded false: the candidate fetch happened.
      expect(page.truncated).toBe(firstPage.truncated);
    }
  });

  it("walks forward without repeating or skipping a product", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const { client } = makeStub(rows);
      const page = await searchProducts(client, VENDOR, "rice", { take: 12, cursor });
      seen.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(seen).toHaveLength(rows.length);
    expect(new Set(seen).size).toBe(rows.length);
  });
});

describe("tier lookup is scoped to the rendered page (R17)", () => {
  it("asks for at most `take` product ids, never the whole candidate set", async () => {
    const rows = Array.from({ length: SEARCH_CANDIDATE_LIMIT }, (_, i) => row(i));
    const { client, spies } = makeStub(rows);

    await searchProducts(client, VENDOR, "rice", { take: 12 });

    expect(spies.tierFindMany).toHaveBeenCalledTimes(1);
    const call = spies.tierFindMany.mock.calls[0][0] as unknown as {
      where: { productId: { in: string[] } };
    };
    expect(call.where.productId.in.length).toBeLessThanOrEqual(12);
    expect(call.where.productId.in.length).toBeGreaterThan(0);
  });
});

describe("item shape and the truncated flag (R18)", () => {
  it("returns the same fields as the keyset path, for the same product", async () => {
    const rows = [row(1)];

    const { client: a } = makeStub(rows);
    const searched = await searchProducts(a, VENDOR, "rice", { take: 12 });

    const { client: b } = makeStub(rows);
    const listed = await listProducts(b, VENDOR, { take: 12 });

    expect(searched.items).toHaveLength(1);
    expect(listed.items).toHaveLength(1);
    expect(Object.keys(searched.items[0]).sort()).toEqual(Object.keys(listed.items[0]).sort());
    expect(searched.items[0]).toEqual(listed.items[0]);
  });

  it("reports false for the uncapped keyset path", async () => {
    const { client } = makeStub(Array.from({ length: 50 }, (_, i) => row(i)));
    const page = await listProducts(client, VENDOR, { take: 12 });
    expect(page.truncated).toBe(false);
  });

  /*
   * The case that distinguishes a sentinel from a cap. Defining `truncated` as
   * "the cap was reached" makes it LIE here: exactly 200 matches is a COMPLETE
   * result set, and the shopper would be told it is incomplete. Do not remove.
   */
  it("reports false when the catalogue holds exactly SEARCH_CANDIDATE_LIMIT matches", async () => {
    const rows = Array.from({ length: SEARCH_CANDIDATE_LIMIT }, (_, i) => row(i));
    const { client } = makeStub(rows);
    const page = await searchProducts(client, VENDOR, "rice", { take: 12 });
    expect(page.truncated).toBe(false);
  });

  it("reports true only once the sentinel row comes back", async () => {
    const rows = Array.from({ length: SEARCH_CANDIDATE_LIMIT + 1 }, (_, i) => row(i));
    const { client } = makeStub(rows);
    const page = await searchProducts(client, VENDOR, "rice", { take: 12 });
    expect(page.truncated).toBe(true);
  });
});
