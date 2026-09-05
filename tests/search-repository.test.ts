import { describe, expect, it, vi } from "vitest";
import {
  SEARCH_CANDIDATE_LIMIT,
  buildDirectSearchWhere,
  buildFilterWhere,
  listProductNameTokens,
  listProducts,
  listProductsByCategory,
  searchProducts,
  type ProductFilters,
} from "@/lib/repositories/products";
import { toUnexpandedGroups } from "@/lib/search-expansion";

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
function makeStub(rows: Row[], aliases: { alias: string; canonical: string }[] = []) {
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
    // P2.6 slice 3 (#566) — searchProducts now reads the approved dictionary before searching.
    // Defaults to empty, which is what keeps every pre-existing case below asserting #564's
    // unchanged behaviour rather than quietly testing an expanded predicate.
    synonymFindMany: vi.fn(async (_args: unknown) => aliases),
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
    searchSynonym: { findMany: spies.synonymFindMany },
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

/**
 * R6, and P2.6 slice 3's R11.
 *
 * This case now carries a second job. #566 turned the predicate builder from a flat term list into
 * term GROUPS; R11 requires that with NO approved synonyms the `where` is structurally identical to
 * the one #564 built. That is exactly what this assertion says, so it is left byte-for-byte as
 * written and the stub simply returns an empty dictionary — a shape change here would be the
 * regression R11 is about.
 */
describe("searchProducts predicate (R6, R11)", () => {
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
      directNameMatch: false,
      suggestions: null,
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

  // #566 — the dictionary read. Empty for every pre-existing ladder case, so each still exercises
  // the unexpanded predicate it was written against.
  const synonymFindMany = vi.fn(async (_args: unknown) => [] as unknown[]);

  const client = {
    product: { findMany: productFindMany },
    productPriceTier: { findMany: tierFindMany },
    searchSynonym: { findMany: synonymFindMany },
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

/** P2.6 slice 3 (#566) — R11 and the expansion half of the predicate. */
describe("synonym expansion widens the direct predicate (R11)", () => {
  it("adds the canonical term to the shopper's own term, in one OR group", async () => {
    const { client, spies } = makeStub([row(1)], [{ alias: "haldi", canonical: "turmeric" }]);
    await searchProducts(client, VENDOR, "haldi", { take: 12 });

    const where = capturedWhere(spies);
    // ONE group, not two clauses: an AND of "haldi" and "turmeric" would demand both words.
    expect(where.AND).toHaveLength(1);
    expect(where.AND[0]).toEqual({
      OR: [
        { name: { contains: "haldi", mode: "insensitive" } },
        { description: { contains: "haldi", mode: "insensitive" } },
        { name: { contains: "turmeric", mode: "insensitive" } },
        { description: { contains: "turmeric", mode: "insensitive" } },
      ],
    });
  });

  it("reads the dictionary vendor-scoped and APPROVED-only", async () => {
    const { client, spies } = makeStub([row(1)]);
    await searchProducts(client, VENDOR, "rice", { take: 12 });

    const args = spies.synonymFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ vendorId: VENDOR, status: "APPROVED" });
  });
});

/**
 * P2.6 slice 3 (#580) — R30, R32. A THIN result keeps every product it found.
 *
 * The damaging case #580 exists for: a query returning one tangential product, matched because a
 * term appears in some unrelated item's description prose. #565's ladder never runs (the result is
 * not zero), so before this the shopper saw one irrelevant product and no way out.
 */
describe("thin results get suggestions, never a replaced result set (R30, R32)", () => {
  it("returns the direct products AND suggestions when nothing matched on name", async () => {
    // The candidate's name shares no term with the query, so it can only have matched through its
    // description — exactly a thin result.
    const { client } = makeStub([row(1, { name: "Pilau Seasoning" })]);
    const page = await searchProducts(client, VENDOR, "haldi", { take: 12 });

    expect(page.items.map((item) => item.id)).toEqual(["p001"]);
    expect(page.directNameMatch).toBe(false);
    // Non-null even though there is no alias and no in-budget correction to offer: the notice
    // still has to tell the shopper these results are loose. Both fields being null is the
    // commonest thin result before the dictionary is populated.
    expect(page.suggestions).toEqual({ canonicalQuery: null, correctedQuery: null });
    // The ladder did NOT run — this is a direct result, kept whole.
    expect(page.recovery).toBeNull();
  });

  it("offers the canonical term when an approved alias covers the query", async () => {
    const { client } = makeStub(
      [row(1, { name: "Pilau Seasoning" })],
      [{ alias: "haldi", canonical: "turmeric" }],
    );
    const page = await searchProducts(client, VENDOR, "haldi", { take: 12 });

    expect(page.suggestions?.canonicalQuery).toBe("turmeric");
  });

  it("renders no suggestions when a candidate DID match on name (R32)", async () => {
    const { client } = makeStub([row(1, { name: "Basmati Rice 5kg" })]);
    const page = await searchProducts(client, VENDOR, "basmati rice", { take: 12 });

    expect(page.directNameMatch).toBe(true);
    expect(page.suggestions).toBeNull();
  });

  it("reports directNameMatch false with no suggestions when the query found nothing at all", async () => {
    // Zero results are the LADDER's territory, not the thin-result path's; both must not fire.
    const { client } = makeStub([]);
    const page = await searchProducts(client, VENDOR, "zzzznothing", { take: 12 });

    expect(page.recovery?.rung).toBe("none");
    expect(page.suggestions).toBeNull();
  });
});

/**
 * P2.6 slice 5 (#568), R11/R12/R20 — the category predicate.
 *
 * The ordering case below is the one worth understanding. `listProductsByCategory` composes its
 * `where` by spreading `buildFilterWhere(filters)` alongside its own explicit `categoryId`. Once
 * that helper could ALSO emit `categoryId`, whichever key spread last would silently win — and if
 * the filter won, a `?category=` parameter in the URL would override the category the route is
 * actually displaying. That is a URL parameter replacing a page's own subject, and nothing about
 * the composed object's shape makes it visible on read, which is why it is pinned by a test.
 */
describe("category predicate (R11, R12)", () => {
  it("emits categoryId for a non-empty categoryIds", () => {
    expect(buildFilterWhere({ categoryIds: ["a", "b"] })).toEqual({
      categoryId: { in: ["a", "b"] },
    });
  });

  it("emits no categoryId key when absent or empty", () => {
    // Empty must mean "no predicate", NOT "match nothing": an unknown slug resolves to no ids, and
    // narrowing on that would empty the catalogue instead of showing unfiltered results.
    expect(buildFilterWhere({})).not.toHaveProperty("categoryId");
    expect(buildFilterWhere({ categoryIds: [] })).not.toHaveProperty("categoryId");
  });

  it("still composes alongside the other filters", () => {
    expect(buildFilterWhere({ categoryIds: ["a"], isHalal: true, inStockOnly: true })).toEqual({
      categoryId: { in: ["a"] },
      isHalal: true,
      inventory: { quantity: { gt: 0 } },
    });
  });

  it("searchProducts applies the category predicate (R13, R14)", async () => {
    const { client, spies } = makeStub([row(1)]);
    await searchProducts(client, VENDOR, "rice", { take: 12, categoryIds: ["cat-1"] });

    expect(capturedWhere(spies)).toMatchObject({ categoryId: { in: ["cat-1"] } });
  });

  it("listProducts applies it in browse mode too (R13)", async () => {
    const { client, spies } = makeStub([row(1)]);
    await listProducts(client, VENDOR, { take: 12, categoryIds: ["cat-1"] });

    expect(capturedWhere(spies)).toMatchObject({ categoryId: { in: ["cat-1"] } });
  });

  it("listProductsByCategory's own category wins over one passed in filters (R12)", async () => {
    const { client, spies } = makeStub([row(1)]);
    await listProductsByCategory(client, VENDOR, ["page-category"], {
      take: 12,
      categoryIds: ["url-supplied"],
    } as ProductFilters & { take: number });

    expect(capturedWhere(spies).categoryId).toEqual({ in: ["page-category"] });
  });
});

/**
 * R20 — the facet probe and the search itself must compose the SAME term predicate. Exported so
 * both call one function; a second hand-written copy of this shape would drift the moment either
 * changed, and the failure would be silent (the toggle offered simply stops corresponding to the
 * result set it describes).
 */
describe("buildDirectSearchWhere is the shared term predicate (R20)", () => {
  it("is what searchProducts composes its where from", async () => {
    const { client, spies } = makeStub([row(1)]);
    await searchProducts(client, VENDOR, "basmati rice", { take: 12 });

    const groups = toUnexpandedGroups(["basmati", "rice"]);
    expect(capturedWhere(spies).AND).toEqual(buildDirectSearchWhere(groups).AND);
  });
});

/**
 * P2.6 slice 6 (#569), R8-R13 — the facet predicates, and the collision the offers filter would
 * otherwise introduce.
 *
 * R11 and R12 are the load-bearing ones. `buildFilterWhere` and the #565 ladder rungs both compose
 * into the same `where`, and before this slice they were merged by object spread. Offers is the
 * first filter that emits a compound key (`AND`/`OR`), so a spread would silently drop whichever
 * fragment came first — handing a shopper products that are not on offer while the chip still says
 * the filter is applied. Both objects are valid `Prisma.ProductWhereInput`, so nothing in lint,
 * typecheck or build would notice. These tests are the only thing that would.
 */
describe("#569 facet predicates", () => {
  it("emits each dietary flag only when set (R8)", () => {
    expect(buildFilterWhere({ isVegetarian: true })).toMatchObject({ isVegetarian: true });
    expect(buildFilterWhere({ isGlutenFree: true })).toMatchObject({ isGlutenFree: true });
    expect(buildFilterWhere({ isHmcCertified: true })).toMatchObject({ isHmcCertified: true });
    expect(buildFilterWhere({})).not.toHaveProperty("isVegetarian");
    expect(buildFilterWhere({})).not.toHaveProperty("isGlutenFree");
    expect(buildFilterWhere({})).not.toHaveProperty("isHmcCertified");
  });

  it("matches origin exactly, and ignores an empty value (R9)", () => {
    expect(buildFilterWhere({ origin: "Morocco" })).toMatchObject({ origin: "Morocco" });
    expect(buildFilterWhere({ origin: "" })).not.toHaveProperty("origin");
  });

  it("narrows by brandId, and ignores an empty value (R10)", () => {
    expect(buildFilterWhere({ brandId: "brand-1" })).toMatchObject({ brandId: "brand-1" });
    expect(buildFilterWhere({ brandId: "" })).not.toHaveProperty("brandId");
  });

  it("nests the offers clause under AND and never emits a top-level OR (R11)", () => {
    const where = buildFilterWhere({ onOffer: true });

    // The whole point: a bare `OR` here is silently overwritten by the ladder rungs' own `OR`.
    expect(Object.keys(where)).not.toContain("OR");

    const and = where.AND as { OR: unknown[] }[];
    expect(and).toHaveLength(1);
    expect(and[0].OR).toEqual([{ originalPrice: { not: null } }, { priceTier: { isNot: null } }]);
  });

  it("leaves an unfiltered query completely unchanged (R13)", () => {
    expect(buildFilterWhere({})).toEqual({});
  });

  it("keeps BOTH the offers clause and each rung's own OR on all three search paths (R12)", async () => {
    // No rows, so the direct search finds nothing and the identity and broad rungs both run.
    const { client, spies } = makeStub([]);
    await searchProducts(client, VENDOR, "basmati rice", {
      take: 12,
      onOffer: true,
    } as ProductFilters & { take: number });

    // The typo rung reads the vendor's whole name vocabulary with NO term predicate, so it is not
    // a candidate fetch and carries no filters — selecting on the search term is what separates the
    // three rung queries from it.
    const wheres = spies.productFindMany.mock.calls
      .map((call) => (call[0] as { where?: unknown }).where)
      .filter(
        (where): where is Record<string, unknown> => typeof where === "object" && where !== null,
      )
      .filter((where) => JSON.stringify(where).includes('"basmati"'));

    // Direct + identity + broad.
    expect(wheres).toHaveLength(3);

    for (const where of wheres) {
      const serialised = JSON.stringify(where);
      // The offers clause survived...
      expect(serialised).toContain('"originalPrice"');
      expect(serialised).toContain('"priceTier"');
      // ...alongside that rung's own term predicate, rather than one overwriting the other.
      expect(serialised).toContain('"rice"');
    }
  });
});
