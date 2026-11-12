/**
 * #1517 — where a promotion banner's button goes, what it says, and the bundle price it shows. Pure
 * (no Prisma, no request context), so the rules are unit-tested and `PromotionHero` — a client
 * component — imports it directly.
 *
 * A bundle is the most specific target a promotion can have, so it wins over a category: a banner
 * for "4 chickens for £18" lands on that bundle's page (`/bundles/<slug>`), where "Buy this offer"
 * adds it in one tap. An explicit `linkUrl` / `callToActionText` always wins over both.
 */
import { tieredLineTotalPence, type ProductTier } from "@/lib/tier-pricing";

export interface PromotionCtaInput {
  linkUrl: string | null;
  callToActionText: string | null;
  category?: { name: string; slug: string } | null;
  bundle?: {
    slug: string;
    items: { quantity: number; product: { basePrice: number; priceTier?: ProductTier | null } }[];
  } | null;
  discountCode?: unknown;
}

export function promotionHref(promo: PromotionCtaInput): string {
  if (promo.linkUrl) return promo.linkUrl;
  if (promo.bundle) return `/bundles/${promo.bundle.slug}`;
  if (promo.category) return `/categories/${promo.category.slug}`;
  return "/categories";
}

export function promotionLabel(promo: PromotionCtaInput): string {
  if (promo.callToActionText) return promo.callToActionText;
  if (promo.bundle) return "Buy This Offer";
  if (promo.category) return `Shop ${promo.category.name}`;
  if (promo.discountCode) return "Shop with Code";
  return "Explore Offers";
}

/**
 * The bundle's price as the cart will charge it: each line through the product's multi-buy tier.
 * Null when the promotion has no bundle or the bundle has no items.
 */
export function promotionBundleTotalPence(promo: PromotionCtaInput): number | null {
  const items = promo.bundle?.items;
  if (!items || items.length === 0) return null;
  return items.reduce(
    (total, item) =>
      total +
      tieredLineTotalPence(item.product.basePrice, item.quantity, item.product.priceTier ?? null),
    0,
  );
}
