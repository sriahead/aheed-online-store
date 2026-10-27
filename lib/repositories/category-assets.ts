import type { getPrisma, getPrismaWs } from "@/lib/db";

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

export async function selectCategoryAsset(
  prismaWs: DbWs,
  vendorId: string,
  assetId: string,
): Promise<{ ok: boolean; asset?: CategoryAssetSummary; error?: string }> {
  const asset = await prismaWs.categoryAsset.findFirst({
    where: { id: assetId, vendorId },
  });

  if (!asset) {
    return { ok: false, error: "Asset not found" };
  }

  if (asset.categoryId) {
    await prismaWs.categoryAsset.updateMany({
      where: { vendorId, categoryId: asset.categoryId },
      data: { isSelected: false },
    });
    const updated = await prismaWs.categoryAsset.update({
      where: { id: asset.id },
      data: { isSelected: true },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
    await prismaWs.category.update({
      where: { id: asset.categoryId, vendorId },
      data: { imageKey: asset.storageKey },
    });
    return {
      ok: true,
      asset: {
        id: updated.id,
        vendorId: updated.vendorId,
        categoryId: updated.categoryId,
        slot: updated.slot,
        storageKey: updated.storageKey,
        style: updated.style,
        isSelected: updated.isSelected,
        createdAt: updated.createdAt,
        category: updated.category,
      },
    };
  }

  if (asset.slot) {
    await prismaWs.categoryAsset.updateMany({
      where: { vendorId, slot: asset.slot },
      data: { isSelected: false },
    });
    const updated = await prismaWs.categoryAsset.update({
      where: { id: asset.id },
      data: { isSelected: true },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
    return {
      ok: true,
      asset: {
        id: updated.id,
        vendorId: updated.vendorId,
        categoryId: updated.categoryId,
        slot: updated.slot,
        storageKey: updated.storageKey,
        style: updated.style,
        isSelected: updated.isSelected,
        createdAt: updated.createdAt,
        category: updated.category,
      },
    };
  }

  const updated = await prismaWs.categoryAsset.update({
    where: { id: asset.id },
    data: { isSelected: true },
    include: {
      category: {
        select: { id: true, name: true, slug: true },
      },
    },
  });

  return {
    ok: true,
    asset: {
      id: updated.id,
      vendorId: updated.vendorId,
      categoryId: updated.categoryId,
      slot: updated.slot,
      storageKey: updated.storageKey,
      style: updated.style,
      isSelected: updated.isSelected,
      createdAt: updated.createdAt,
      category: updated.category,
    },
  };
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

  return {
    ok: true,
    storageKey,
    categoryId,
    wasSelected,
  };
}
