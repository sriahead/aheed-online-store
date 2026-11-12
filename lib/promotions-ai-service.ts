import { getPrisma } from "@/lib/db";
import { getVendorConfig } from "@/lib/vendor-service";
import {
  generatePromotionAiContent,
  type PromotionAiInput,
  type PromotionAiOutput,
} from "@/lib/promotions-ai";
import type { AudienceSegment, PromotionChannel } from "@/lib/promotions-service";
import { describeItems } from "@/lib/ai-image-prompts";

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
          select: {
            name: true,
            tagline: true,
            items: {
              select: {
                quantity: true,
                product: {
                  select: {
                    name: true,
                    basePrice: true,
                    originalPrice: true,
                  },
                },
              },
              orderBy: { sortOrder: "asc" },
            },
          },
        })
      : null,
    params.discountCodeId
      ? prisma.discountCode.findFirst({
          where: { id: params.discountCodeId, vendorId },
          select: { code: true, kind: true, value: true, minSubtotalPence: true },
        })
      : null,
  ]);

  const hasProductMarkdown =
    product &&
    typeof product.originalPrice === "number" &&
    product.originalPrice > product.basePrice;

  const multiBuyActive = product?.priceTier?.isActive ?? false;
  const regularMultiBuyCost =
    product && multiBuyActive ? product.priceTier!.groupQuantity * product.basePrice : 0;
  const multiBuySavingsPence =
    product && multiBuyActive && regularMultiBuyCost > product.priceTier!.groupPricePence
      ? regularMultiBuyCost - product.priceTier!.groupPricePence
      : null;

  const bundleTotalPence = bundle
    ? bundle.items.reduce((sum, item) => sum + item.quantity * item.product.basePrice, 0)
    : 0;

  const bundleWasTotalPence = bundle
    ? bundle.items.reduce(
        (sum, item) =>
          sum +
          item.quantity *
            (typeof item.product.originalPrice === "number" &&
            item.product.originalPrice > item.product.basePrice
              ? item.product.originalPrice
              : item.product.basePrice),
        0,
      )
    : 0;

  const bundleSavingsPence =
    bundle && bundleWasTotalPence > bundleTotalPence
      ? bundleWasTotalPence - bundleTotalPence
      : null;

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
          originalPricePence: hasProductMarkdown ? product.originalPrice : null,
          savingsPence: hasProductMarkdown ? product.originalPrice! - product.basePrice : null,
          multiBuyQuantity: multiBuyActive ? product.priceTier!.groupQuantity : null,
          multiBuyPricePence: multiBuyActive ? product.priceTier!.groupPricePence : null,
          multiBuySavingsPence,
        }
      : bundle
        ? {
            name: bundle.name,
            description: bundle.tagline,
            basePricePence: bundleTotalPence,
            savingsPence: bundleSavingsPence,
            bundleItems: bundle.items.map((it) => ({
              name: it.product.name,
              quantity: it.quantity,
              pricePence: it.product.basePrice,
            })),
          }
        : discountCode
          ? {
              name: `Discount Code ${discountCode.code}`,
              discountKind: discountCode.kind,
              discountValue: discountCode.value,
            }
          : null,
  };

  return generatePromotionAiContent(input);
}

/**
 * #1535 — what a promotion banner should picture: the chosen product, the bundle's contents, or
 * the department, in that order. Empty when the promotion has no such target (a code-only or
 * general promotion); the banner prompt then falls back to the headline.
 */
export async function describePromotionSubjectForVendor(
  vendorId: string,
  target: { productId?: string | null; bundleId?: string | null; categoryId?: string | null },
): Promise<string> {
  const prisma = getPrisma();
  if (target.productId) {
    const product = await prisma.product.findFirst({
      where: { id: target.productId, vendorId },
      select: { name: true },
    });
    if (product) return product.name;
  }
  if (target.bundleId) {
    const bundle = await prisma.bundle.findFirst({
      where: { id: target.bundleId, vendorId },
      select: {
        name: true,
        items: {
          orderBy: { sortOrder: "asc" },
          select: { quantity: true, product: { select: { name: true } } },
        },
      },
    });
    if (bundle) {
      return (
        describeItems(
          bundle.items.map((item) => ({ name: item.product.name, quantity: item.quantity })),
        ) || bundle.name
      );
    }
  }
  if (target.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: target.categoryId, vendorId },
      select: { name: true },
    });
    if (category) return category.name;
  }
  return "";
}
