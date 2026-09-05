import { describe, expect, it, vi } from "vitest";
import { getAvailableSpecialities } from "@/lib/repositories/products";
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
  const client = { product: { findFirst } } as never;
  return { client, findFirst };
}

/** The `where` each of the three probes was called with, in halal/fresh/organic order. */
function capturedWheres(findFirst: ReturnType<typeof makeStub>["findFirst"]) {
  return findFirst.mock.calls.map((call) => (call[0] as { where: Record<string, unknown> }).where);
}

describe("getAvailableSpecialities context (R18)", () => {
  it("forwards category, price and in-stock into every probe", async () => {
    const { client, findFirst } = makeStub();

    await getAvailableSpecialities(client, VENDOR, {
      categoryIds: ["cat-1"],
      minPricePence: 100,
      maxPricePence: 500,
      inStockOnly: true,
    });

    expect(findFirst).toHaveBeenCalledTimes(3);
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

    await getAvailableSpecialities(client, VENDOR, { groups });

    for (const where of capturedWheres(findFirst)) {
      expect(where.AND).toEqual(groups.map(() => ({ OR: expect.any(Array) })));
    }
  });

  it("issues a plain vendor-wide probe when given no context", async () => {
    const { client, findFirst } = makeStub();

    await getAvailableSpecialities(client, VENDOR);

    for (const where of capturedWheres(findFirst)) {
      expect(where).not.toHaveProperty("AND");
      expect(where).not.toHaveProperty("categoryId");
    }
  });

  it("reports a speciality available only when its probe found a row", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: "p1" }) // halal
      .mockResolvedValueOnce(null) // fresh
      .mockResolvedValueOnce({ id: "p2" }); // organic
    const client = { product: { findFirst } } as never;

    expect(await getAvailableSpecialities(client, VENDOR)).toEqual({
      halal: true,
      fresh: false,
      organic: true,
    });
  });
});

describe("speciality probes exclude all three speciality filters (R19)", () => {
  it("does not narrow any probe by another speciality", async () => {
    const { client, findFirst } = makeStub();

    // The type deliberately has no speciality fields, so this is the closest a caller can get to
    // passing them — and the probes must still be free of every flag but their own.
    await getAvailableSpecialities(client, VENDOR, {
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
