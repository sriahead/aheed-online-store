import type { getPrisma, getPrismaWs } from "@/lib/db";
import { composePublicUrl } from "@/lib/storage";

/**
 * Category and UI system icon asset management repository.
 *
 * Implements R1, R2, R3 for tracking candidate imagery generated for categories
 * and system icon slots, enabling operators to generate, review, select, and delete.
 *
 * All functions take `prisma` (or `prismaWs`) and `vendorId` as explicit parameters
 * per CLAUDE.md repository layer rules and tests/repository-purity.test.ts.
 */

type Db = ReturnType<typeof getPrisma>;
type DbWs = ReturnType<typeof getPrismaWs>;
type Tx = Parameters<Parameters<DbWs["$transaction"]>[0]>[0];

export interface CategoryAssetSummary {
  id: string;
  vendorId: string;
  categoryId: string | null;
  slot: string | null;
  storageKey: string;
  style: string;
  isSelected: boolean;
  createdAt: Date;
  category?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface ListCategoryAssetsOptions {
  categoryId?: string | null;
  slot?: string | null;
  style?: string | null;
  limit?: number;
}

export async function listCategoryAssets(
  prisma: Db,
  vendorId: string,
  options?: ListCategoryAssetsOptions,
): Promise<CategoryAssetSummary[]> {
  const where: {
    vendorId: string;
    categoryId?: string | null;
    slot?: string | null;
    style?: string;
  } = { vendorId };

  if (options?.categoryId !== undefined) {
    where.categoryId = options.categoryId;
  }
  if (options?.slot !== undefined) {
    where.slot = options.slot;
  }
  if (options?.style) {
    where.style = options.style;
  }

  const rows = await prisma.categoryAsset.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 100,
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    vendorId: r.vendorId,
    categoryId: r.categoryId,
    slot: r.slot,
    storageKey: r.storageKey,
    style: r.style,
    isSelected: r.isSelected,
    createdAt: r.createdAt,
    category: r.category,
  }));
}

export async function getCategoryAssetById(
  prisma: Db,
  vendorId: string,
  assetId: string,
): Promise<CategoryAssetSummary | null> {
  const row = await prisma.categoryAsset.findFirst({
    where: { id: assetId, vendorId },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    vendorId: row.vendorId,
    categoryId: row.categoryId,
    slot: row.slot,
    storageKey: row.storageKey,
    style: row.style,
    isSelected: row.isSelected,
    createdAt: row.createdAt,
    category: row.category,
  };
}

export async function createCategoryAsset(
  prismaWs: DbWs,
  vendorId: string,
  data: {
    categoryId?: string | null;
    slot?: string | null;
    storageKey: string;
    style: string;
    isSelected?: boolean;
  },
): Promise<CategoryAssetSummary> {
  const shouldSelect = data.isSelected ?? false;

  // If selecting for a category, unselect existing and update Category.imageKey
  if (shouldSelect && data.categoryId) {
    await prismaWs.categoryAsset.updateMany({
      where: {
        vendorId,
        categoryId: data.categoryId,
      },
      data: { isSelected: false },
    });
    await prismaWs.category.update({
      where: { id: data.categoryId, vendorId },
      data: { imageKey: data.storageKey },
    });
  } else if (shouldSelect && data.slot) {
    await prismaWs.categoryAsset.updateMany({
      where: {
        vendorId,
        slot: data.slot,
      },
      data: { isSelected: false },
    });
  }

  const asset = await prismaWs.categoryAsset.create({
    data: {
      vendorId,
      categoryId: data.categoryId ?? null,
      slot: data.slot ?? null,
      storageKey: data.storageKey,
      style: data.style,
      isSelected: shouldSelect,
    },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  return {
    id: asset.id,
    vendorId: asset.vendorId,
    categoryId: asset.categoryId,
    slot: asset.slot,
    storageKey: asset.storageKey,
    style: asset.style,
    isSelected: asset.isSelected,
    createdAt: asset.createdAt,
    category: asset.category,
  };
}

const ASSET_INCLUDE = {
  category: {
    select: { id: true, name: true, slug: true },
  },
} as const;

type AssetRow = Awaited<ReturnType<Tx["categoryAsset"]["update"]>> & {
  category?: { id: string; name: string; slug: string } | null;
};

function toSummary(row: AssetRow): CategoryAssetSummary {
  return {
    id: row.id,
    vendorId: row.vendorId,
    categoryId: row.categoryId,
    slot: row.slot,
    storageKey: row.storageKey,
    style: row.style,
    isSelected: row.isSelected,
    createdAt: row.createdAt,
    category: row.category,
  };
}

/**
 * Makes one asset the active one for its category or slot (#1285; atomic since #1288 R2).
 *
 * Every write runs inside ONE interactive transaction: clearing the previous selection and setting
 * the new one used to be separate statements, so a failure between them left the category or slot
 * with nothing selected. Interactive transactions need the WebSocket client (CLAUDE.md).
 */
export async function selectCategoryAsset(
  prismaWs: DbWs,
  vendorId: string,
  assetId: string,
): Promise<{ ok: boolean; asset?: CategoryAssetSummary; error?: string }> {
  return prismaWs.$transaction(async (tx: Tx) => {
    const asset = await tx.categoryAsset.findFirst({
      where: { id: assetId, vendorId },
    });

    if (!asset) {
      return { ok: false, error: "Asset not found" };
    }

    if (asset.categoryId) {
      await tx.categoryAsset.updateMany({
        where: { vendorId, categoryId: asset.categoryId },
        data: { isSelected: false },
      });
    } else if (asset.slot) {
      await tx.categoryAsset.updateMany({
        where: { vendorId, slot: asset.slot },
        data: { isSelected: false },
      });
    }

    const updated = await tx.categoryAsset.update({
      where: { id: asset.id },
      data: { isSelected: true },
      include: ASSET_INCLUDE,
    });

    if (asset.categoryId) {
      await tx.category.update({
        where: { id: asset.categoryId, vendorId },
        data: { imageKey: asset.storageKey },
      });
    }

    return { ok: true, asset: toSummary(updated) };
  });
}

/**
 * Switches an asset back to inactive (#1288 R1) so the surface falls back to its built-in artwork:
 * a slot to the static 3D asset or build-time icon, a category to its icon/illustration/glyph
 * (`Category.imageKey` is cleared). Idempotent: an already-inactive asset returns `ok: true`.
 */
export async function deactivateCategoryAsset(
  prismaWs: DbWs,
  vendorId: string,
  assetId: string,
): Promise<{ ok: boolean; asset?: CategoryAssetSummary; error?: string }> {
  return prismaWs.$transaction(async (tx: Tx) => {
    const asset = await tx.categoryAsset.findFirst({
      where: { id: assetId, vendorId },
    });

    if (!asset) {
      return { ok: false, error: "Asset not found" };
    }

    const updated = await tx.categoryAsset.update({
      where: { id: asset.id },
      data: { isSelected: false },
      include: ASSET_INCLUDE,
    });

    if (asset.categoryId) {
      await tx.category.update({
        where: { id: asset.categoryId, vendorId },
        data: { imageKey: null },
      });
    }

    return { ok: true, asset: toSummary(updated) };
  });
}

export async function deleteCategoryAsset(
  prismaWs: DbWs,
  vendorId: string,
  assetId: string,
): Promise<{
  ok: boolean;
  storageKey?: string;
  categoryId?: string | null;
  wasSelected?: boolean;
  error?: string;
}> {
  const asset = await prismaWs.categoryAsset.findFirst({
    where: { id: assetId, vendorId },
  });

  if (!asset) {
    return { ok: false, error: "Asset not found" };
  }

  const wasSelected = asset.isSelected;
  const storageKey = asset.storageKey;
  const categoryId = asset.categoryId;
  const slot = asset.slot;

  await prismaWs.categoryAsset.delete({
    where: { id: asset.id },
  });

  if (wasSelected && categoryId) {
    const nextCandidate = await prismaWs.categoryAsset.findFirst({
      where: { vendorId, categoryId },
      orderBy: { createdAt: "desc" },
    });

    if (nextCandidate) {
      await prismaWs.categoryAsset.update({
        where: { id: nextCandidate.id },
        data: { isSelected: true },
      });
      await prismaWs.category.update({
        where: { id: categoryId, vendorId },
        data: { imageKey: nextCandidate.storageKey },
      });
    } else {
      await prismaWs.category.update({
        where: { id: categoryId, vendorId },
        data: { imageKey: null },
      });
    }
  }

  if (wasSelected && slot) {
    const nextCandidate = await prismaWs.categoryAsset.findFirst({
      where: { vendorId, slot },
      orderBy: { createdAt: "desc" },
    });
    if (nextCandidate) {
      await prismaWs.categoryAsset.update({
        where: { id: nextCandidate.id },
        data: { isSelected: true },
      });
    }
  }

  return {
    ok: true,
    storageKey,
    categoryId,
    wasSelected,
  };
}

/**
 * Returns a map of all currently active (selected) system slot assets for a vendor.
 * Maps slot ID -> public image URL.
 */
export async function getActiveSlotAssetsMap(
  prisma: Db,
  vendorId: string,
  cdnBaseUrl?: string | null,
): Promise<Record<string, string>> {
  const rows = await prisma.categoryAsset.findMany({
    where: {
      vendorId,
      slot: { not: null },
      isSelected: true,
    },
    select: {
      slot: true,
      storageKey: true,
    },
  });

  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r.slot) {
      const url =
        r.storageKey.startsWith("/") || r.storageKey.startsWith("http")
          ? r.storageKey
          : cdnBaseUrl
            ? composePublicUrl(cdnBaseUrl, r.storageKey)
            : `/${r.storageKey}`;
      map[r.slot] = url;
      // Alias common equivalents
      if (r.slot === "cart-floating") map["cart-add"] = url;
      if (r.slot === "cart-add") map["cart-floating"] = url;
    }
  }
  return map;
}
