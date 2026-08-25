import { describe, it, expect, vi } from "vitest";

// lib/repositories/product-tiers.ts imports lib/db type-only, but vitest still
// resolves the specifier — mock it (and lib/tenant, for parity with the other
// repository tests) so the module loads. Every test below drives the functions
// with a fake client, which is exactly why they take `prisma` and `vendorId` as
// explicit arguments rather than resolving them from request context.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn() }));

const { listActiveTiersForProducts, getTierForProduct, deleteProductTier } =
  await import("@/lib/repositories/product-tiers");
const { tieredLineTotalPence } = await import("@/lib/tier-pricing");

/**
 * R12a — a ProductPriceTier belonging to another vendor can never price a line.
 *
 * The tenant boundary in this repo lives in `lib/repositories/*` rather than in
 * Postgres (ADR-004 decision 2 deferred RLS; the P7-closeout experiment
 * established it is not reachable on `PrismaNeonHttp`). So the boundary is only
 * as real as the `where` clauses, and this asserts them against a fake client
 * that actually ENFORCES the filter rather than one that records it and returns
 * rows regardless — a fake that ignores `where` would pass a function that had
 * dropped `vendorId` entirely, which is the exact bug being guarded.
 */

const AHEED = "v-aheed";
const SRIMART = "v-srimart";
const RICE = "p-basmati";

/** One row per vendor for the SAME product id — the cross-tenant collision case. */
const ROWS = [
  {
    vendorId: AHEED,
    productId: RICE,
    groupQuantity: 2,
    groupPricePence: 1650,
    isActive: true,
  },
  {
    vendorId: SRIMART,
    productId: RICE,
    groupQuantity: 3,
    groupPricePence: 100,
    isActive: true,
  },
];

function fakeDb(rows = ROWS) {
  const seenWhere: Record<string, unknown>[] = [];

  const matches = (row: (typeof ROWS)[number], where: Record<string, unknown>): boolean => {
    if ("vendorId" in where && row.vendorId !== where.vendorId) return false;
    if ("isActive" in where && row.isActive !== where.isActive) return false;
    if ("productId" in where) {
      const p = where.productId as string | { in: string[] };
      if (typeof p === "string") {
        if (row.productId !== p) return false;
      } else if (!p.in.includes(row.productId)) {
        return false;
      }
    }
    return true;
  };

  const db = {
    productPriceTier: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        seenWhere.push(where);
        return rows.filter((r) => matches(r, where));
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        seenWhere.push(where);
        return rows.find((r) => matches(r, where)) ?? null;
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        seenWhere.push(where);
        return { count: rows.filter((r) => matches(r, where)).length };
      },
    },
  };

  return { db, seenWhere };
}

/**
 * The fake models only the three operations these functions call, so it is not
 * assignable to the real client's type. Cast at the boundary rather than
 * widening the repository's own signatures to accommodate a test.
 */
const asDb = (db: unknown) => db as Parameters<typeof getTierForProduct>[0];

describe("listActiveTiersForProducts — vendor scoping (R12a)", () => {
  it("returns only the querying vendor's tier for a shared product id", async () => {
    const { db } = fakeDb();

    const aheed = await listActiveTiersForProducts(asDb(db), AHEED, [RICE]);
    expect(aheed.get(RICE)).toEqual({ groupQuantity: 2, groupPricePence: 1650, isActive: true });

    const srimart = await listActiveTiersForProducts(asDb(db), SRIMART, [RICE]);
    expect(srimart.get(RICE)).toEqual({ groupQuantity: 3, groupPricePence: 100, isActive: true });
  });

  it("prices an identical product at BASE for a vendor with no tier of its own", async () => {
    // Only Aheed has a tier here. SriMart sells the same product id and must be
    // charged the plain base price — the actual consequence R12a is protecting.
    const { db } = fakeDb([ROWS[0]]);

    const srimart = await listActiveTiersForProducts(asDb(db), SRIMART, [RICE]);
    expect(srimart.get(RICE)).toBeUndefined();
    expect(tieredLineTotalPence(899, 2, srimart.get(RICE) ?? null)).toBe(1798);

    // ...while Aheed, with the tier, gets the multi-buy price.
    const aheed = await listActiveTiersForProducts(asDb(db), AHEED, [RICE]);
    expect(tieredLineTotalPence(899, 2, aheed.get(RICE) ?? null)).toBe(1650);
  });

  it("puts vendorId in the where clause of every read", async () => {
    const { db, seenWhere } = fakeDb();

    await listActiveTiersForProducts(asDb(db), AHEED, [RICE]);
    await getTierForProduct(asDb(db), AHEED, RICE);
    await deleteProductTier(asDb(db), AHEED, RICE);

    expect(seenWhere).toHaveLength(3);
    for (const where of seenWhere) expect(where.vendorId).toBe(AHEED);
  });

  it("filters inactive tiers out of the storefront read", async () => {
    const { db } = fakeDb([{ ...ROWS[0], isActive: false }]);
    const tiers = await listActiveTiersForProducts(asDb(db), AHEED, [RICE]);
    expect(tiers.size).toBe(0);
  });

  it("issues no query at all for an empty product list", async () => {
    const { db, seenWhere } = fakeDb();
    const tiers = await listActiveTiersForProducts(asDb(db), AHEED, []);
    expect(tiers.size).toBe(0);
    expect(seenWhere).toHaveLength(0);
  });
});

describe("getTierForProduct — the staff form's read", () => {
  it("returns an INACTIVE tier so it can be re-enabled without retyping", async () => {
    const { db } = fakeDb([{ ...ROWS[0], isActive: false }]);
    const tier = await getTierForProduct(asDb(db), AHEED, RICE);
    expect(tier).toEqual({ groupQuantity: 2, groupPricePence: 1650, isActive: false });
  });

  it("returns null for another vendor's product", async () => {
    const { db } = fakeDb([ROWS[0]]);
    expect(await getTierForProduct(asDb(db), SRIMART, RICE)).toBeNull();
  });
});
