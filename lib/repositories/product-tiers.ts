import type { getPrisma } from "@/lib/db";
import type { ProductTier } from "@/lib/tier-pricing";

/**
 * Multi-buy tier read/write path (P8.5d, #348) — the ONLY DB access for
 * `ProductPriceTier`. Pages, components and feature actions go through here
 * (ADR-004 slice-2 no-direct-Prisma guard).
 *
 * Every function takes `prisma` and `vendorId` as EXPLICIT arguments and reads
 * no request context, matching `placeOrder(prisma, vendorId, input)` and
 * `claimCode(tx, vendorId, …)`. `tests/repository-purity.test.ts` enforces the
 * no-request-context half whole-file at import level with no allowlist (#252),
 * which is why `getPrisma` is a TYPE-ONLY import here — this module never
 * resolves a client of its own.
 *
 * WHY THE READS ARE EXPLICIT QUERIES RATHER THAN A RELATION JOIN. Every caller
 * already fetches its products under a `where: { vendorId }`, so joining
 * `Product.priceTier` would inherit the tenant scope for free and cost no extra
 * query. It is done this way instead because the tenant boundary in this repo is
 * a *checkable* property, not an inherited one: `tests/repository-vendor-scoping.
 * test.ts` asserts that an exported function touching a vendor-scoped model both
 * takes a vendor id and uses it, and a relation join gives it nothing to see.
 * One extra indexed query per page is the price of the boundary being provable
 * rather than argued — and `ProductPriceTier_vendorId_isActive_idx` exists for it.
 */

type Db = ReturnType<typeof getPrisma>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
type AnyDb = Db | Tx;

/** The columns `lib/tier-pricing.ts` needs, and nothing else. */
const tierSelect = {
  productId: true,
  groupQuantity: true,
  groupPricePence: true,
  isActive: true,
} as const;

/**
 * Active tiers for the given products, keyed by `productId`.
 *
 * Returns a Map so a caller decorating N cart lines or N cards does one query
 * and N lookups, never N queries. An empty `productIds` short-circuits — a
 * `findMany` with `in: []` is a pointless round trip.
 *
 * Filters `isActive` in SQL as well as in `lib/tier-pricing.ts`: the pure
 * function defends itself against any row it is handed, but there is no reason
 * to read rows that cannot price anything.
 */
export async function listActiveTiersForProducts(
  db: AnyDb,
  vendorId: string,
  productIds: string[],
): Promise<Map<string, ProductTier>> {
  if (productIds.length === 0) return new Map();

  const rows = await db.productPriceTier.findMany({
    where: { vendorId, isActive: true, productId: { in: productIds } },
    select: tierSelect,
  });

  return new Map(
    rows.map((row) => [
      row.productId,
      {
        groupQuantity: row.groupQuantity,
        groupPricePence: row.groupPricePence,
        isActive: row.isActive,
      },
    ]),
  );
}

/**
 * One product's tier, active or not — the staff form needs to render an
 * existing-but-deactivated tier so it can be re-activated rather than retyped.
 */
export async function getTierForProduct(
  db: AnyDb,
  vendorId: string,
  productId: string,
): Promise<ProductTier | null> {
  const row = await db.productPriceTier.findFirst({
    where: { vendorId, productId },
    select: tierSelect,
  });
  if (!row) return null;
  return {
    groupQuantity: row.groupQuantity,
    groupPricePence: row.groupPricePence,
    isActive: row.isActive,
  };
}

export interface TierWriteInput {
  groupQuantity: number;
  groupPricePence: number;
  isActive: boolean;
}

/**
 * Create or replace a product's tier.
 *
 * An upsert rather than create-or-update because `@@unique([vendorId,
 * productId])` makes "does one already exist?" a race the database can settle
 * on its own. Editing a live tier is safe: orders snapshot
 * `OrderItem.lineTotalPence` at checkout and never recompute, so no past order
 * re-prices.
 *
 * `vendorId` comes from the caller's `requireVendorRole`, which resolves it from
 * the request host — never from the submitted form.
 */
export async function upsertProductTier(
  db: AnyDb,
  vendorId: string,
  productId: string,
  input: TierWriteInput,
): Promise<void> {
  await db.productPriceTier.upsert({
    where: { vendorId_productId: { vendorId, productId } },
    create: {
      vendorId,
      productId,
      groupQuantity: input.groupQuantity,
      groupPricePence: input.groupPricePence,
      isActive: input.isActive,
    },
    update: {
      groupQuantity: input.groupQuantity,
      groupPricePence: input.groupPricePence,
      isActive: input.isActive,
    },
  });
}

/**
 * Remove a product's tier outright — what the staff form does when the fields
 * are cleared, as opposed to deactivating and keeping the numbers.
 *
 * `deleteMany` rather than `delete` so `vendorId` is in the WHERE and a missing
 * row is a no-op rather than a thrown error.
 */
export async function deleteProductTier(
  db: AnyDb,
  vendorId: string,
  productId: string,
): Promise<number> {
  const { count } = await db.productPriceTier.deleteMany({ where: { vendorId, productId } });
  return count;
}
