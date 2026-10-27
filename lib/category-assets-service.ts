import { getPrisma, getPrismaWs } from "@/lib/db";
import { getEnv } from "@/lib/config";
import {
  listCategoryAssets,
  getCategoryAssetById,
  createCategoryAsset,
  selectCategoryAsset,
  deleteCategoryAsset,
  getActiveSlotAssetsMap,
  type CategoryAssetSummary,
  type ListCategoryAssetsOptions,
} from "./repositories/category-assets";

/**
 * Request-scoped facade for Category and Icon Assets (ADR-004, #252).
 *
 * Resolves the appropriate Prisma client (HTTP vs WebSocket) and injects it into
 * the pure repository functions in lib/repositories/category-assets.ts.
 */

export async function listCategoryAssetsForVendor(
  vendorId: string,
  options?: ListCategoryAssetsOptions,
): Promise<CategoryAssetSummary[]> {
  const prisma = getPrisma();
  return listCategoryAssets(prisma, vendorId, options);
}

export async function getCategoryAssetByIdForVendor(
  vendorId: string,
  assetId: string,
): Promise<CategoryAssetSummary | null> {
  const prisma = getPrisma();
  return getCategoryAssetById(prisma, vendorId, assetId);
}

export async function createCategoryAssetForVendor(
  vendorId: string,
  data: {
    categoryId?: string | null;
    slot?: string | null;
    storageKey: string;
    style: string;
    isSelected?: boolean;
  },
): Promise<CategoryAssetSummary> {
  const prismaWs = getPrismaWs();
  return createCategoryAsset(prismaWs, vendorId, data);
}

export async function selectCategoryAssetForVendor(vendorId: string, assetId: string) {
  const prismaWs = getPrismaWs();
  return selectCategoryAsset(prismaWs, vendorId, assetId);
}

export async function deleteCategoryAssetForVendor(vendorId: string, assetId: string) {
  const prismaWs = getPrismaWs();
  return deleteCategoryAsset(prismaWs, vendorId, assetId);
}

export async function getActiveSlotAssetsForVendor(
  vendorId: string,
): Promise<Record<string, string>> {
  const prisma = getPrisma();
  const { CDN_BASE_URL } = getEnv();
  return getActiveSlotAssetsMap(prisma, vendorId, CDN_BASE_URL);
}
