import type { getPrisma } from "@/lib/db";
import { listLivePromotions } from "@/lib/repositories/promotions";

/**
 * Auto-applied promotion resolution at checkout (R9, R10, R11).
 * Pure business logic mapping cart contents to highest-priority eligible promotion.
 */

export interface AutoAppliedPromotion {
  promotionId: string;
  headline: string;
  discountCode: string;
}

/**
 * Resolves any active promotion that should be auto-applied at checkout.
 * Evaluates live promotions ordered by priority descending.
 * Matches:
 * 1. Store-wide promotions (categoryId === null && productId === null).
 * 2. Product-specific promotions (productId in cart).
 * 3. Department-scoped promotions (categoryId matches any cart line product's category or parent category).
 */
export async function resolveAutoPromotionAtCheckout(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  cartProductIds: string[],
  now = new Date(),
): Promise<AutoAppliedPromotion | null> {
  if (cartProductIds.length === 0) return null;

  // 1. Get live promotions for this vendor
  const livePromos = await listLivePromotions(prisma, vendorId, now, 10);
  const eligibleWithCodes = livePromos.filter(
    (p) => p.discountCode && p.discountCode.code.trim() !== "",
  );
  if (eligibleWithCodes.length === 0) return null;

  // 2. Fetch category mappings for cart products to test category matches
  const products = await prisma.product.findMany({
    where: { id: { in: cartProductIds }, vendorId },
    select: {
      id: true,
      categoryId: true,
      category: { select: { id: true, parentId: true } },
    },
  });

  const cartCategoryIds = new Set<string>();
  for (const p of products) {
    cartCategoryIds.add(p.categoryId);
    if (p.category?.parentId) cartCategoryIds.add(p.category.parentId);
  }
  const cartProductIdSet = new Set(cartProductIds);

  // 3. Find first matching promotion by priority
  for (const promo of eligibleWithCodes) {
    if (!promo.discountCode) continue;

    // A. Product-specific
    if (promo.productId) {
      if (cartProductIdSet.has(promo.productId)) {
        return {
          promotionId: promo.id,
          headline: promo.headline,
          discountCode: promo.discountCode.code,
        };
      }
      continue;
    }

    // B. Department-scoped
    if (promo.categoryId) {
      if (cartCategoryIds.has(promo.categoryId)) {
        return {
          promotionId: promo.id,
          headline: promo.headline,
          discountCode: promo.discountCode.code,
        };
      }
      continue;
    }

    // C. Store-wide (no categoryId and no productId)
    return {
      promotionId: promo.id,
      headline: promo.headline,
      discountCode: promo.discountCode.code,
    };
  }

  return null;
}
