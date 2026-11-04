import { getPrisma } from "@/lib/db";
import { getVendorConfig } from "@/lib/vendor-service";
import {
  generatePromotionAiContent,
  type PromotionAiInput,
  type PromotionAiOutput,
} from "@/lib/promotions-ai";
import type { AudienceSegment, PromotionChannel } from "@/lib/promotions-service";

export interface GeneratePromotionAiParams {
  targetType: "PRODUCT" | "BUNDLE" | "DISCOUNT_CODE" | "GENERIC";
  categoryId?: string | null;
  productId?: string | null;
  bundleId?: string | null;
  discountCodeId?: string | null;
  audienceSegment: AudienceSegment;
  channel: PromotionChannel;
}

/**
 * Request-scoped AI generation orchestration for promotional campaigns.
 * Scoped strictly to vendorId without exposing Prisma to the API route layer.
 */
export async function generatePromotionAiForVendor(
  vendorId: string,
  params: GeneratePromotionAiParams,
): Promise<{ ok: true; value: PromotionAiOutput } | { ok: false; error: string }> {
  const prisma = getPrisma();

  const [vendor, config, category, product, bundle, discountCode] = await Promise.all([
    prisma.vendor.findUnique({ where: { id: vendorId }, select: { name: true } }),
    getVendorConfig(vendorId),
    params.categoryId
      ? prisma.category.findFirst({
          where: { id: params.categoryId, vendorId },
          select: { name: true },
        })
      : null,
    params.productId
      ? prisma.product.findFirst({
          where: { id: params.productId, vendorId },
          select: {
            name: true,
            description: true,
            basePrice: true,
            originalPrice: true,
            priceTier: { select: { groupQuantity: true, groupPricePence: true, isActive: true } },
          },
        })
      : null,
    params.bundleId
      ? prisma.bundle.findFirst({
          where: { id: params.bundleId, vendorId },
          select: { name: true, tagline: true },
        })
      : null,
    params.discountCodeId
      ? prisma.discountCode.findFirst({
          where: { id: params.discountCodeId, vendorId },
          select: { code: true, kind: true, value: true, minSubtotalPence: true },
        })
      : null,
  ]);

  const input: PromotionAiInput = {
    vendorId,
    storeName: vendor?.name,
    storeDescription: config?.storeDescription,
    targetType: params.targetType,
    categoryName: category?.name ?? null,
    audienceSegment: params.audienceSegment,
    channel: params.channel,
    itemDetails: product
      ? {
          name: product.name,
          description: product.description,
          basePricePence: product.basePrice,
          originalPricePence: product.originalPrice,
          savingsPence:
            product.originalPrice && product.originalPrice > product.basePrice
              ? product.originalPrice - product.basePrice
              : null,
          multiBuyQuantity: product.priceTier?.isActive ? product.priceTier.groupQuantity : null,
          multiBuyPricePence: product.priceTier?.isActive
            ? product.priceTier.groupPricePence
            : null,
        }
      : bundle
        ? {
            name: bundle.name,
            description: bundle.tagline,
          }
        : discountCode
          ? {
              name: `Code ${discountCode.code}`,
              discountKind: discountCode.kind,
              discountValue: discountCode.value,
            }
          : null,
  };

  return generatePromotionAiContent(input);
}
