import { cache } from "react";
import { getPrisma } from "@/lib/db";
import { getCurrentVendorIdOrNull } from "@/lib/tenant";
import {
  listPromotionsForAdmin as listAdminRepo,
  getPromotionById as getByIdRepo,
  listLivePromotions as listLiveRepo,
  createPromotion as createRepo,
  updatePromotion as updateRepo,
  deletePromotion as deleteRepo,
  listEligiblePromotionalProducts as listEligibleProductsRepo,
  type PromotionRow,
  type PromotionWriteInput,
  type PromotionWriteResult,
  type EligiblePromotionalProduct,
  type AudienceSegment,
  type PromotionChannel,
} from "@/lib/repositories/promotions";

/**
 * Request-scoped wrapper around `lib/repositories/promotions.ts` pure functions.
 * Resolves live Prisma client and tenant context.
 */

/**
 * Storefront live promotions read (R11). Memoized per request with React `cache()`.
 */
export const getLivePromotionsForStorefront = cache(
  async (now = new Date(), limit = 3): Promise<PromotionRow[]> => {
    const vendorId = await getCurrentVendorIdOrNull();
    if (!vendorId) return [];
    return listLiveRepo(getPrisma(), vendorId, now, limit);
  },
);

/**
 * Staff admin promotion list (R7).
 */
export async function listPromotionsForAdmin(vendorId: string): Promise<PromotionRow[]> {
  return listAdminRepo(getPrisma(), vendorId);
}

/**
 * Fetch a single promotion by ID for staff editing.
 */
export async function getPromotionForAdmin(
  vendorId: string,
  id: string,
): Promise<PromotionRow | null> {
  return getByIdRepo(getPrisma(), vendorId, id);
}

/**
 * Create a promotion for staff back-office.
 */
export async function createPromotionForVendor(
  vendorId: string,
  input: PromotionWriteInput,
): Promise<PromotionWriteResult> {
  return createRepo(getPrisma(), vendorId, input);
}

/**
 * Update an existing promotion for staff back-office.
 */
export async function updatePromotionForVendor(
  vendorId: string,
  id: string,
  input: PromotionWriteInput,
): Promise<PromotionWriteResult> {
  return updateRepo(getPrisma(), vendorId, id, input);
}

/**
 * Delete a promotion for staff back-office.
 */
export async function deletePromotionForVendor(
  vendorId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return deleteRepo(getPrisma(), vendorId, id);
}

// Re-export types
export type {
  PromotionRow,
  PromotionWriteInput,
  PromotionWriteResult,
  EligiblePromotionalProduct,
  AudienceSegment,
  PromotionChannel,
};

/**
 * List eligible promotional products for staff campaign creation.
 */
export async function listEligiblePromotionalProductsForAdmin(
  vendorId: string,
): Promise<EligiblePromotionalProduct[]> {
  return listEligibleProductsRepo(getPrisma(), vendorId);
}
