import { describe, expect, it, vi } from "vitest";
import {
  SEARCH_CANDIDATE_LIMIT,
  buildFilterWhere,
  listProductNameTokens,
  listProducts,
  listProductsByCategory,
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

    expect(result).toEqual({
      items: [],
      nextCursor: null,
      truncated: false,
      directResultCount: 0,
      recovery: null,
    });
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

describe("ProductPage shape on findPage-backed paths (R7)", () => {
  it("listProducts always reports directResultCount: 0, recovery: null — no ladder outside search()", async () => {
    const { client } = makeStub([row(1)]);
    const page = await listProducts(client, VENDOR, { take: 12 });
    expect(page.directResultCount).toBe(0);
    expect(page.recovery).toBeNull();
  });

  it("listProductsByCategory always reports directResultCount: 0, recovery: null", async () => {
    const { client } = makeStub([row(1)]);
    const page = await listProductsByCategory(client, VENDOR, ["cat-1"], { take: 12 });
    expect(page.directResultCount).toBe(0);
    expect(page.recovery).toBeNull();
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

/**
 * P2.6 slice 2 (#565) — the zero-result ladder.
 *
 * `makeLadderStub` distinguishes the token-vocabulary query (`listProductNameTokens`, which
 * carries no `orderBy`) from a ranked candidate fetch (direct/typo/identity/broad, which always
 * does), and hands successive candidate fetches their responses from `searchResponses` in call
 * order — the ladder's own rung order is what determines how many of those actually get consumed.
 */
function makeLadderStub(searchResponses: Row[][], tokenNames: string[] = []) {
  let searchCallIndex = 0;
  const productFindMany = vi.fn(async (args: unknown) => {
    const a = args as { orderBy?: unknown };
    if (!a.orderBy) return tokenNames.map((name) => ({ name }));
    const response = searchResponses[searchCallIndex] ?? [];
    searchCallIndex += 1;
    return response;
  });
  const tierFindMany = vi.fn(async (_args: unknown) => [] as unknown[]);

  const client = {
    product: { findMany: productFindMany },
    productPriceTier: { findMany: tierFindMany },
  };

  return { client: client as never, spies: { productFindMany, tierFindMany } };
}

function onlySearchCalls(spies: ReturnType<typeof makeLadderStub>["spies"]) {
  return spies.productFindMany.mock.calls.filter(
    (call) => (call[0] as { orderBy?: unknown }).orderBy,
  );
}

describe("listProductNameTokens (R6)", () => {
  it("tokenises active product NAMES only, vendor-scoped, deduplicated", async () => {
    const productFindMany = vi.fn(async (args: unknown) => {
      expect(args).toEqual({ where: { vendorId: VENDOR, isActive: true }, select: { name: true } });
      return [{ name: "Basmati Rice" }, { name: "Basmati Lentils" }];
    });
    const client = { product: { findMany: productFindMany } };

    const tokens = await listProductNameTokens(client as never, VENDOR);

    expect(tokens).toEqual(new Set(["basmati", "rice", "lentils"]));
  });
});

describe("direct search succeeds: the ladder never runs (R9)", () => {
  it("sets directResultCount from the direct fetch and issues no further query", async () => {
    const matches = [row(1), row(2), row(3)];
    const { client, spies } = makeLadderStub([matches]);

    const page = await searchProducts(client, VENDOR, "rice", { take: 12 });

    expect(page.directResultCount).toBe(3);
    expect(page.recovery).toBeNull();
    expect(onlySearchCalls(spies)).toHaveLength(1);
  });
});

describe("rung 1: typo correction (R10)", () => {
  it("re-queries the direct predicate shape with the corrected term and ranks against it", async () => {
    const matches = [row(1, { name: "Basmati Rice 1" })];
    const { client, spies } = makeLadderStub([[], matches], ["rice", "basmati"]);

    const page = await searchProducts(client, VENDOR, "ricd", { take: 12 });

    expect(page.directResultCount).toBe(0);
    expect(page.recovery).toEqual({ rung: "typo", correctedTerms: ["rice"] });
    expect(page.items).toHaveLength(1);

    const calls = onlySearchCalls(spies);
    expect(calls).toHaveLength(2);
    const secondWhere = (calls[1][0] as { where: { AND: unknown[] } }).where;
    expect(secondWhere.AND[0]).toEqual({
      OR: [
        { name: { contains: "rice", mode: "insensitive" } },
        { description: { contains: "rice", mode: "insensitive" } },
      ],
    });
  });

  it("skips the re-query entirely when nothing is correctable", async () => {
    const { client, spies } = makeLadderStub([[], [row(1)]], []);

    await searchProducts(client, VENDOR, "xyz", { take: 12 });

    // direct + identity only — no typo re-query, since correctTerms found nothing to correct.
    // (identity finds a match here, so the ladder stops before reaching the broad rung too.)
    expect(onlySearchCalls(spies)).toHaveLength(2);
  });
});

describe("rung 3: identity match — name or category name (R11)", () => {
  it("loosens AND-of-terms to OR-of-terms across name/category.name when typo doesn't apply", async () => {
    const matches = [row(1)];
    const { client, spies } = makeLadderStub([[], matches], []);

    const page = await searchProducts(client, VENDOR, "xyz", { take: 12 });

    expect(page.recovery).toEqual({ rung: "identity" });
    const calls = onlySearchCalls(spies);
    expect(calls).toHaveLength(2);
    const where = (calls[1][0] as { where: { OR: unknown[] } }).where;
    expect(where.OR).toContainEqual({ name: { contains: "xyz", mode: "insensitive" } });
    expect(where.OR).toContainEqual({
      category: { name: { contains: "xyz", mode: "insensitive" } },
    });
  });
});

describe("rung 4: broad match — name or description (R12)", () => {
  it("falls through to the widest OR when identity also finds nothing", async () => {
    const matches = [row(1)];
    const { client, spies } = makeLadderStub([[], [], matches], []);

    const page = await searchProducts(client, VENDOR, "xyz", { take: 12 });

    expect(page.recovery).toEqual({ rung: "broad" });
    const calls = onlySearchCalls(spies);
    expect(calls).toHaveLength(3);
    const where = (calls[2][0] as { where: { OR: unknown[] } }).where;
    expect(where.OR).toContainEqual({ name: { contains: "xyz", mode: "insensitive" } });
    expect(where.OR).toContainEqual({ description: { contains: "xyz", mode: "insensitive" } });
  });
});

describe("ladder exhausted (R13)", () => {
  it("tries all four attempts — including a genuinely correctable typo — and reports rung 'none'", async () => {
    const { client, spies } = makeLadderStub([[], [], [], []], ["rice"]);

    const page = await searchProducts(client, VENDOR, "ricd", { take: 12 });

    expect(page.items).toEqual([]);
    expect(page.directResultCount).toBe(0);
    expect(page.recovery).toEqual({ rung: "none" });
    expect(onlySearchCalls(spies)).toHaveLength(4);
  });
});

describe("every rung shares the same fetch/cap/sentinel shape (R14)", () => {
  it("carries the same take/orderBy regardless of which rung supplied results, and truncated reflects it", async () => {
    const rows = Array.from({ length: SEARCH_CANDIDATE_LIMIT + 1 }, (_, i) => row(i));
    const { client, spies } = makeLadderStub([[], rows], []);

    const page = await searchProducts(client, VENDOR, "xyz", { take: 12 });

    expect(page.recovery).toEqual({ rung: "identity" });
    expect(page.truncated).toBe(true);
    for (const call of onlySearchCalls(spies)) {
      const args = call[0] as { take: number; orderBy: unknown };
      expect(args.take).toBe(SEARCH_CANDIDATE_LIMIT + 1);
      expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    }
  });
});

describe("pagination is stable across the ladder (R15)", () => {
  it("page 2 re-derives the same rung and slices the same ranked set as page 1", async () => {
    const matches = Array.from({ length: 20 }, (_, i) => row(i, { name: `Basmati Rice ${i}` }));

    const { client: firstClient, spies: firstSpies } = makeLadderStub([[], matches], ["rice"]);
    const first = await searchProducts(firstClient, VENDOR, "ricd", { take: 12 });
    expect(first.recovery).toEqual({ rung: "typo", correctedTerms: ["rice"] });

    const { client: secondClient, spies: secondSpies } = makeLadderStub([[], matches], ["rice"]);
    const second = await searchProducts(secondClient, VENDOR, "ricd", {
      take: 12,
      cursor: first.nextCursor ?? undefined,
    });

    const firstTypoWhere = onlySearchCalls(firstSpies)[1][0] as { where: unknown };
    const secondTypoWhere = onlySearchCalls(secondSpies)[1][0] as { where: unknown };
    expect(secondTypoWhere.where).toEqual(firstTypoWhere.where);

    const firstIds = first.items.map((p) => p.id);
    const secondIds = second.items.map((p) => p.id);
    expect(new Set([...firstIds, ...secondIds]).size).toBe(firstIds.length + secondIds.length);
  });
});
