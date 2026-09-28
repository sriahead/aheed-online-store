import { describe, expect, it, vi } from "vitest";
import {
  buildFilterWhere,
  listProducts,
  listProductsByCategory,
  searchProducts,
} from "@/lib/repositories/products";

/**
 * #912 R17, #918 R23 — vendor-filter predicates compose with `onOffer` instead of colliding with it.
 *
 * Both need `AND` (several vendor filters share the one `attributeValues` relation key, and
 * `onOffer` must never emit a top-level `OR` — specs/architecture.md). Assigning `where.AND` twice
 * would silently discard whichever ran first, and every result would still be a valid
 * `Prisma.ProductWhereInput`, so only an assertion on the built object can catch it. A stub client,
 * as in `tests/search-repository.test.ts`, because a live result set that looks right is consistent
 * with a dropped predicate.
 */

const OFFER_CLAUSE = { OR: [{ originalPrice: { not: null } }, { priceTier: { isNot: null } }] };
/** #918 — one clause per list filter, `in` over every ticked value. */
const groupClause = (...optionIds: string[]) => ({
  attributeValues: { some: { optionId: { in: optionIds } } },
});
/** #918 — one clause per number filter, both bounds on the same value row. */
const RANGE = { attributeId: "attr-power", min: "15", max: "65" };
const RANGE_CLAUSE = {
  attributeValues: {
    some: { attributeId: "attr-power", numericValue: { gte: "15", lte: "65" } },
  },
};

describe("buildFilterWhere", () => {
  it("puts onOffer, one two-value group and one range in ONE top-level AND of three clauses", () => {
    const where = buildFilterWhere({
      onOffer: true,
      attributeOptionGroups: [["opt-a", "opt-b"]],
      attributeRanges: [RANGE],
    });
    expect(where.AND).toEqual([OFFER_CLAUSE, groupClause("opt-a", "opt-b"), RANGE_CLAUSE]);
    expect(where).not.toHaveProperty("OR");
  });

  it("emits only the bound a range carries", () => {
    const where = buildFilterWhere({ attributeRanges: [{ attributeId: "attr-power", min: "15" }] });
    expect(where.AND).toEqual([
      { attributeValues: { some: { attributeId: "attr-power", numericValue: { gte: "15" } } } },
    ]);
  });

  it("emits nothing for empty or absent groups and ranges", () => {
    expect(buildFilterWhere({ attributeOptionGroups: [], attributeRanges: [] })).toEqual({});
    expect(buildFilterWhere({ attributeOptionGroups: [[]] })).toEqual({});
    expect(buildFilterWhere({ attributeRanges: [{ attributeId: "attr-power" }] })).toEqual({});
    expect(buildFilterWhere({})).toEqual({});
  });
});

function makeStub() {
  const productFindMany = vi.fn(async (_args: unknown) => [] as unknown[]);
  const client = {
    product: {
      findMany: productFindMany,
      findFirst: vi.fn(async () => null),
      count: vi.fn(async () => 0),
    },
    productPriceTier: { findMany: vi.fn(async () => []) },
    searchSynonym: { findMany: vi.fn(async () => []) },
  };
  return { client: client as never, productFindMany };
}

/** Every `findMany` where the path issued, serialised, so a nested clause is found wherever it sits. */
function allWheres(spy: ReturnType<typeof makeStub>["productFindMany"]): string {
  return JSON.stringify(spy.mock.calls.map(([args]) => (args as { where: unknown }).where));
}

describe("every listing path keeps the vendor-filter clauses", () => {
  const filters = {
    onOffer: true,
    attributeOptionGroups: [["opt-a", "opt-b"]],
    attributeRanges: [RANGE],
  };

  it.each([
    [
      "searchProducts",
      (client: never) => searchProducts(client, "v1", "cable", { take: 12, ...filters }),
    ],
    ["listProducts", (client: never) => listProducts(client, "v1", { take: 12, ...filters })],
    [
      "listProductsByCategory",
      (client: never) => listProductsByCategory(client, "v1", ["cat-1"], { take: 12, ...filters }),
    ],
  ])("%s", async (_name, run) => {
    const { client, productFindMany } = makeStub();
    await run(client);
    const where = allWheres(productFindMany);
    expect(where).toContain(JSON.stringify(groupClause("opt-a", "opt-b")));
    expect(where).toContain(JSON.stringify(RANGE_CLAUSE));
    expect(where).toContain(JSON.stringify(OFFER_CLAUSE));
  });
});
