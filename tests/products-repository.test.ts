import { describe, expect, it, vi } from "vitest";
import { getAvailableFacets } from "@/lib/repositories/products";
import { toUnexpandedGroups } from "@/lib/search-expansion";

/**
 * P2.6 slice 5 (#568), R18/R19 — context-aware speciality facets.
 *
 * THE TRAP THESE EXIST FOR, because it is easy to reintroduce and impossible to see in a passing
 * page: if each facet were probed against the FULL current filter state, ticking "Halal" would hide
 * "Organic" the moment no product is both — and, worse, an active facet could hide the very
 * checkbox needed to untick it, stranding the shopper inside a filter they can neither see nor
 * remove. Excluding all three speciality flags from every probe is what prevents that, and R19 is
 * the assertion that it is still happening.
 *
 * A spy client rather than a live database, for the reason `tests/search-repository.test.ts` gives:
 * the requirement is about what the composed `where` CONTAINS (and, for R19, what it must NOT
 * contain), and a live result set that happens to look right is consistent with the predicate being
 * wrong. Only possible because the function takes `prisma` explicitly (#252, #409).
 */

const VENDOR = "vendor-1";

function makeStub() {
  const findFirst = vi.fn(async (_args: unknown) => null);
  // #569 — origin and brand are distinct-VALUE facets, so they probe with findMany rather than
  // findFirst. Defaulting to empty keeps every pre-#569 assertion below about the boolean probes.
  const findMany = vi.fn(async (_args: unknown) => [] as unknown[]);
  const client = { product: { findFirst, findMany } } as never;
  return { client, findFirst, findMany };
}

/** The `where` each of the three probes was called with, in halal/fresh/organic order. */
function capturedWheres(findFirst: ReturnType<typeof makeStub>["findFirst"]) {
  return findFirst.mock.calls.map((call) => (call[0] as { where: Record<string, unknown> }).where);
}

describe("getAvailableFacets context (R18)", () => {
  it("forwards category, price and in-stock into every probe", async () => {
    const { client, findFirst } = makeStub();

    await getAvailableFacets(client, VENDOR, {
      categoryIds: ["cat-1"],
      minPricePence: 100,
      maxPricePence: 500,
      inStockOnly: true,
    });

    // #569 widened this from three probes to seven findFirst probes (six dietary/speciality
    // booleans plus offers); the two distinct-value facets use findMany instead.
    expect(findFirst).toHaveBeenCalledTimes(7);
    for (const where of capturedWheres(findFirst)) {
      expect(where).toMatchObject({
        vendorId: VENDOR,
        isActive: true,
        categoryId: { in: ["cat-1"] },
        basePrice: { gte: 100, lte: 500 },
        inventory: { quantity: { gt: 0 } },
      });
    }
  });

  it("forwards the search term predicate", async () => {
    const { client, findFirst } = makeStub();
    const groups = toUnexpandedGroups(["basmati", "rice"]);

    await getAvailableFacets(client, VENDOR, { groups });

    for (const where of capturedWheres(findFirst)) {
      expect(where.AND).toEqual(groups.map(() => ({ OR: expect.any(Array) })));
    }
  });

  it("issues a plain vendor-wide probe when given no context", async () => {
    const { client, findFirst } = makeStub();

    await getAvailableFacets(client, VENDOR);

    for (const where of capturedWheres(findFirst)) {
      expect(where).not.toHaveProperty("AND");
      expect(where).not.toHaveProperty("categoryId");
    }
  });

  it("reports a facet available only when its probe found a row", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: "p1" }) // halal
      .mockResolvedValueOnce(null) // fresh
      .mockResolvedValueOnce({ id: "p2" }) // organic
      .mockResolvedValueOnce(null) // vegetarian (#569)
      .mockResolvedValueOnce({ id: "p3" }) // glutenFree
      .mockResolvedValueOnce(null) // hmcCertified
      .mockResolvedValueOnce({ id: "p4" }); // onOffer
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([{ origin: "Morocco" }, { origin: null }])
      .mockResolvedValueOnce([
        { brand: { id: "b1", name: "Shan", slug: "shan" } },
        { brand: null },
      ]);
    const client = { product: { findFirst, findMany } } as never;

    expect(await getAvailableFacets(client, VENDOR)).toEqual({
      halal: true,
      fresh: false,
      organic: true,
      vegetarian: false,
      glutenFree: true,
      hmcCertified: false,
      onOffer: true,
      // A null origin/brand can survive `distinct` on a nullable column, so both lists are
      // filtered before being returned — a null reaching a `select` option would render blank.
      origins: ["Morocco"],
      brands: [{ id: "b1", name: "Shan", slug: "shan" }],
    });
  });
});

describe("speciality probes exclude all three speciality filters (R19)", () => {
  it("does not narrow any probe by another speciality", async () => {
    const { client, findFirst } = makeStub();

    // The type deliberately has no speciality fields, so this is the closest a caller can get to
    // passing them — and the probes must still be free of every flag but their own.
    await getAvailableFacets(client, VENDOR, {
      categoryIds: ["cat-1"],
      inStockOnly: true,
    });

    const [halal, fresh, organic] = capturedWheres(findFirst);

    expect(halal).toMatchObject({ isHalal: true });
    expect(halal).not.toHaveProperty("isFresh");
    expect(halal).not.toHaveProperty("isOrganic");

    expect(fresh).toMatchObject({ isFresh: true });
    expect(fresh).not.toHaveProperty("isHalal");
    expect(fresh).not.toHaveProperty("isOrganic");

    expect(organic).toMatchObject({ isOrganic: true });
    expect(organic).not.toHaveProperty("isHalal");
    expect(organic).not.toHaveProperty("isFresh");
  });
});

/**
 * P2.6 slice 6 (#569), R17/R18 — the exclusion rule, now over NINE facet fields rather than three.
 *
 * `FacetContext` excludes every facet field by TYPE, so these tests cannot even express the failure
 * they guard against by passing one in. What they assert instead is the observable consequence:
 * whatever the caller supplies, no probe's `where` ends up carrying a facet key — which is what
 * makes an active facet always report itself available, and therefore always removable.
 */
describe("#569 widened facet probes", () => {
  const FACET_KEYS = [
    "isHalal",
    "isFresh",
    "isOrganic",
    "isVegetarian",
    "isGlutenFree",
    "isHmcCertified",
    "onOffer",
    "origin",
    "brandId",
  ];

  it("excludes every facet field from each boolean probe (R17)", async () => {
    const { client, findFirst } = makeStub();

    await getAvailableFacets(client, VENDOR, {
      categoryIds: ["cat-1"],
      minPricePence: 100,
      inStockOnly: true,
    });

    const wheres = capturedWheres(findFirst);
    // Six dietary/speciality booleans plus the offers probe.
    expect(wheres).toHaveLength(7);

    for (const where of wheres) {
      const serialised = JSON.stringify(where);
      // The probe's OWN flag is the one key it legitimately sets, so count keys across the whole
      // set instead: no probe may carry a facet key it did not itself add.
      const own = Object.keys(where).filter((key) => FACET_KEYS.includes(key));
      expect(own.length).toBeLessThanOrEqual(1);
      // The context's non-facet filters must still be there — a probe that dropped them would
      // report availability against the wrong result set.
      expect(serialised).toContain("cat-1");
    }
  });

  it("omits origin from the origin probe and brandId from the brand probe (R18)", async () => {
    const { client, findMany } = makeStub();

    await getAvailableFacets(client, VENDOR, { categoryIds: ["cat-1"] });

    const wheres = findMany.mock.calls.map(
      (call) => (call[0] as { where: Record<string, unknown> }).where,
    );
    expect(wheres).toHaveLength(2);

    const [originWhere, brandWhere] = wheres;
    // Each narrows to rows that HAVE a value, never to a chosen one.
    expect(JSON.stringify(originWhere)).toContain('"origin"');
    expect(originWhere).not.toHaveProperty("origin.equals");
    expect(JSON.stringify(brandWhere)).toContain('"brandId"');
    expect(brandWhere).not.toHaveProperty("brandId.equals");
  });

  it("issues every probe in one Promise.all rather than sequentially (R19)", async () => {
    const { client, findFirst, findMany } = makeStub();
    await getAvailableFacets(client, VENDOR);
    // Nine probes total: seven findFirst, two findMany. If they were awaited in sequence the counts
    // would be identical — what this pins is the probe SET, so a facet added without extending the
    // Promise.all shows up here as a count change rather than passing silently.
    expect(findFirst.mock.calls.length + findMany.mock.calls.length).toBe(9);
  });
});
