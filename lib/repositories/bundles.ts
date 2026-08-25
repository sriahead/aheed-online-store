import type { Prisma } from "@prisma/client";
import type { getPrisma, getPrismaWs } from "@/lib/db";
import { effectiveStock } from "@/lib/cart-rules";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";
import type { BundleItemInput } from "@/lib/bundle-pricing";

/**
 * Curated bundles (P8.5c, #347).
 *
 * EVERY EXPORTED FUNCTION takes `prisma` and (where vendor-scoped) `vendorId` as
 * EXPLICIT arguments and reads no request context — no `getCurrentVendorId()`,
 * no `headers()`, no `getAuth()`. The request-scoped facade lives in
 * `lib/bundles-service.ts` instead, matching every repository since #252/P8.1b.
 * `tests/repository-purity.test.ts` enforces the location whole-file, at import
 * level, with no allowlist — the `getPrisma` import here is TYPE-ONLY, which is
 * the documented pattern.
 */

type Db = ReturnType<typeof getPrisma>;
type DbWs = ReturnType<typeof getPrismaWs>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

export interface BundleWithItems {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  imageKey: string | null;
  altText: string | null;
  isActive: boolean;
  sortOrder: number;
  items: BundleItemInput[];
}

export interface BundleAdminRow {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  itemCount: number;
}

/**
 * One nested read serves the whole storefront section — the constituents and
 * their inventory come back inside the same query as the bundles, so adding a
 * fourth bundle to a vendor does not add a fourth query (R9). The alternative,
 * fetching bundles then looping to fetch each one's products, is the N+1 this
 * shape exists to avoid, and is exactly what `listCategorySpotlights` (P8.5b)
 * was written to dodge for the hero.
 */
const BUNDLE_INCLUDE = {
  items: {
    orderBy: [{ sortOrder: "asc" }, { productId: "asc" }],
    select: {
      productId: true,
      quantity: true,
      product: {
        select: {
          slug: true,
          name: true,
          unitLabel: true,
          basePrice: true,
          originalPrice: true,
          isActive: true,
          inventory: { select: { quantity: true } },
        },
      },
    },
  },
} satisfies Prisma.BundleInclude;

type RawBundleItem = {
  productId: string;
  quantity: number;
  product: {
    slug: string;
    name: string;
    unitLabel: string;
    basePrice: number;
    originalPrice: number | null;
    isActive: boolean;
    inventory: { quantity: number } | null;
  };
};

function toItemInput(row: RawBundleItem): BundleItemInput {
  return {
    productId: row.productId,
    slug: row.product.slug,
    name: row.product.name,
    unitLabel: row.product.unitLabel,
    basePrice: row.product.basePrice,
    originalPrice: row.product.originalPrice,
    quantity: row.quantity,
    isActive: row.product.isActive,
    // Normalised the same way ProductSummary does, so a missing Inventory row
    // or a negative count reads as 0 rather than leaking into the pricing math.
    stockQuantity: effectiveStock(row.product.inventory?.quantity ?? 0),
  };
}

/**
 * The storefront read: this vendor's active bundles, curated order first.
 *
 * Availability filtering is NOT done here — `lib/bundle-pricing.ts` decides it,
 * purely, so the same rule can be unit-tested without a database and so the
 * staff panel can still see a bundle whose products have all gone out of stock.
 */
export async function listActiveBundles(prisma: Db, vendorId: string): Promise<BundleWithItems[]> {
  const rows = await prisma.bundle.findMany({
    where: { vendorId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: BUNDLE_INCLUDE,
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    imageKey: row.imageKey,
    altText: row.altText,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    items: row.items.map(toItemInput),
  }));
}

/**
 * One bundle with its constituents, scoped to the vendor.
 *
 * `vendorId` in the `where` is what makes the bundle id UNTRUSTED INPUT safe
 * (R23): another vendor's id, or a random uuid, is indistinguishable from one
 * that doesn't exist, so the add action's caller cannot reach across tenants by
 * guessing. Nothing above this re-implements that check.
 */
export async function getBundleWithItems(
  prisma: Db,
  vendorId: string,
  bundleId: string,
): Promise<BundleWithItems | null> {
  const row = await prisma.bundle.findFirst({
    where: { id: bundleId, vendorId },
    include: BUNDLE_INCLUDE,
  });
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    imageKey: row.imageKey,
    altText: row.altText,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    items: row.items.map(toItemInput),
  };
}

/** `/staff/bundles`'s list — includes inactive bundles, which the storefront read excludes. */
export async function listBundlesForAdmin(prisma: Db, vendorId: string): Promise<BundleAdminRow[]> {
  const rows = await prisma.bundle.findMany({
    where: { vendorId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      sortOrder: true,
      _count: { select: { items: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    itemCount: row._count.items,
  }));
}

export interface BundleWriteInput {
  slug: string;
  name: string;
  tagline: string | null;
  isActive: boolean;
  sortOrder: number;
}

export type BundleWriteResult =
  { ok: true; id: string } | { ok: false; error: string; field?: string };

/**
 * Create a bundle, or update an existing one when `bundleId` is given.
 *
 * The unique `(vendorId, slug)` collision is CAUGHT and turned into a field
 * error rather than allowed to surface as an unhandled `P2002` (R29) — the same
 * posture `lib/repositories/categories.ts` takes, and the reason
 * `isUniqueViolation` exists as a shared helper instead of a `catch` that
 * pattern-matches an error string.
 */
export async function upsertBundle(
  prisma: Db,
  vendorId: string,
  bundleId: string | null,
  input: BundleWriteInput,
): Promise<BundleWriteResult> {
  try {
    if (bundleId === null) {
      const created = await prisma.bundle.create({
        data: { vendorId, ...input },
        select: { id: true },
      });
      return { ok: true, id: created.id };
    }

    // updateMany, not update: `where` carries vendorId, so another vendor's
    // bundle id updates nothing instead of updating their row.
    const updated = await prisma.bundle.updateMany({
      where: { id: bundleId, vendorId },
      data: input,
    });
    if (updated.count === 0) {
      return { ok: false, error: "That bundle no longer exists." };
    }
    return { ok: true, id: bundleId };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: "Another bundle in this store already uses that web address.",
        field: "slug",
      };
    }
    throw error;
  }
}

export interface BundleItemWriteInput {
  productId: string;
  quantity: number;
}

/**
 * Replace a bundle's constituent list wholesale.
 *
 * Deliberately a REPLACE rather than a per-row add/remove API: the staff form
 * submits the whole list every time, and reconciling it row by row would need a
 * diff the form has no reason to compute. `deleteMany` + `createMany` inside one
 * transaction keeps the bundle from being briefly empty for a concurrent reader.
 *
 * Every `productId` is re-checked against `vendorId` here rather than trusted
 * from the caller (R28) — the same posture `upsertCampaign` takes with its
 * category id, and the reason another vendor's product id must be
 * indistinguishable from one that doesn't exist.
 */
export async function setBundleItems(
  prisma: Db,
  prismaWs: DbWs,
  vendorId: string,
  bundleId: string,
  items: readonly BundleItemWriteInput[],
): Promise<BundleWriteResult> {
  const bundle = await prisma.bundle.findFirst({
    where: { id: bundleId, vendorId },
    select: { id: true },
  });
  if (!bundle) return { ok: false, error: "That bundle no longer exists." };

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return {
        ok: false,
        error: "Every product's quantity must be a whole number of 1 or more.",
        field: "items",
      };
    }
  }

  const productIds = items.map((item) => item.productId);
  if (new Set(productIds).size !== productIds.length) {
    return { ok: false, error: "That product is already in this bundle.", field: "items" };
  }

  if (productIds.length > 0) {
    const owned = await prisma.product.findMany({
      where: { id: { in: productIds }, vendorId },
      select: { id: true },
    });
    if (owned.length !== productIds.length) {
      return { ok: false, error: "One of those products is no longer available.", field: "items" };
    }
  }

  await prismaWs.$transaction(async (tx: Tx) => {
    await tx.bundleItem.deleteMany({ where: { bundleId } });
    if (items.length > 0) {
      await tx.bundleItem.createMany({
        data: items.map((item, index) => ({
          bundleId,
          productId: item.productId,
          quantity: item.quantity,
          sortOrder: index,
        })),
      });
    }
  });

  return { ok: true, id: bundleId };
}

/** Deleting a bundle cascades its items (schema `onDelete: Cascade`) and touches no cart. */
export async function deleteBundle(
  prisma: Db,
  vendorId: string,
  bundleId: string,
): Promise<BundleWriteResult> {
  const deleted = await prisma.bundle.deleteMany({ where: { id: bundleId, vendorId } });
  if (deleted.count === 0) return { ok: false, error: "That bundle no longer exists." };
  return { ok: true, id: bundleId };
}

/**
 * Attach an uploaded image to an EXISTING bundle.
 *
 * Mirrors `setCampaignImage`'s posture (P8.5e): the image is a property of a
 * bundle that already exists, not a second way to bring one into being, so a
 * missing bundle is a named refusal rather than a silent create.
 */
export async function setBundleImage(
  prisma: Db,
  vendorId: string,
  bundleId: string,
  imageKey: string,
  altText: string,
): Promise<BundleWriteResult> {
  const updated = await prisma.bundle.updateMany({
    where: { id: bundleId, vendorId },
    data: { imageKey, altText },
  });
  if (updated.count === 0) return { ok: false, error: "That bundle no longer exists." };
  return { ok: true, id: bundleId };
}
