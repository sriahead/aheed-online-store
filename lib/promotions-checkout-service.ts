import { getPrisma } from "@/lib/db";
import {
  resolveAutoPromotionAtCheckout,
  type AutoAppliedPromotion,
} from "@/lib/promotions-checkout";

/**
 * Request-scoped checkout promotion resolution.
 * Takes no Prisma client from UI layers, keeping repository isolation clean.
 */
export async function getAutoPromotionForCheckout(
  vendorId: string,
  cartProductIds: string[],
): Promise<AutoAppliedPromotion | null> {
  return resolveAutoPromotionAtCheckout(getPrisma(), vendorId, cartProductIds);
}

export type { AutoAppliedPromotion };
