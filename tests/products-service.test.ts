import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P2.6 slice 2 (#565), R20 — proves the query-log guard actually wired into
 * `getProductRepository().search()`, not just the underlying repository logic
 * `tests/search-repository.test.ts` already covers. Same mocking shape as
 * `tests/roles.test.ts`/`tests/tenant.test.ts`: replace `@/lib/db`, `@/lib/tenant`
 * and `next/headers` at the module boundary, then dynamically import the
 * service so it picks up the mocks. `@/lib/repositories/products` is left
 * un-mocked — `searchProducts` runs for real against the stub Prisma client
 * below, matching `tests/search-repository.test.ts`'s own stub shape.
 */

function row(i: number) {
  return {
    id: `p${String(i).padStart(3, "0")}`,
    slug: `product-${i}`,
    name: `Basmati Rice ${i}`,
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
    inventory: null,
  };
}

const productFindMany = vi.fn(async (_args: unknown) => [row(1)]);
const tierFindMany = vi.fn(async (_args: unknown) => [] as unknown[]);
const synonymFindMany = vi.fn(async (_args: unknown) => [] as unknown[]);
const recordSearchQuery = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn(async () => "vendor-1") }));
vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    product: { findMany: productFindMany },
    productPriceTier: { findMany: tierFindMany },
    // #566 — searchProducts reads the approved dictionary before searching. Empty here: this file
    // is about the query-log guard, not about expansion.
    searchSynonym: { findMany: synonymFindMany },
  }),
  getPrismaWs: () => ({}),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "cf-connecting-ip": "203.0.113.5" })),
}));
vi.mock("@/lib/repositories/search-query-log", () => ({ recordSearchQuery }));

beforeEach(() => {
  vi.clearAllMocks();
  productFindMany.mockResolvedValue([row(1)]);
  tierFindMany.mockResolvedValue([]);
});

describe("getProductRepository().search — query log guard (R20)", () => {
  it("records the search once on the first page (cursor omitted)", async () => {
    const { getProductRepository } = await import("@/lib/products-service");

    await getProductRepository().search("rice", { take: 12 });

    expect(recordSearchQuery).toHaveBeenCalledTimes(1);
    const [, vendorArg, ipArg, queryArg, countArg, rungArg] = recordSearchQuery.mock.calls[0];
    expect(vendorArg).toBe("vendor-1");
    expect(ipArg).toBe("203.0.113.5");
    expect(queryArg).toBe("rice");
    expect(countArg).toBe(1);
    expect(rungArg).toBeNull();
  });

  it("does not record on a paginated 'Next page' request (cursor present)", async () => {
    const { getProductRepository } = await import("@/lib/products-service");

    await getProductRepository().search("rice", { take: 12, cursor: "12" });

    expect(recordSearchQuery).not.toHaveBeenCalled();
  });
});
