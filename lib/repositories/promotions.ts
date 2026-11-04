import type { getPrisma } from "@/lib/db";
import type { AudienceSegment } from "@prisma/client";

/**
 * Promotion repository (R3) — pure functions taking `prisma` and `vendorId` explicitly.
 *
 * Reads no request context (no headers, no cookies, no getAuth). Enforced by
 * tests/repository-purity.test.ts and tests/repository-client-injection.test.ts.
 */

export interface PromotionRow {
  id: string;
  vendorId: string;
  headline: string;
  subtitle: string | null;
  badgeText: string | null;
  callToActionText: string | null;
  imageKey: string | null;
  altText: string | null;
  linkUrl: string | null;
  priority: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  audienceSegment: AudienceSegment;
  createdAt: Date;
  updatedAt: Date;
  categoryId: string | null;
  bundleId: string | null;
  discountCodeId: string | null;
  category?: { id: string; name: string; slug: string } | null;
  bundle?: {
    id: string;
    name: string;
    slug: string;
    items: { quantity: number; product: { id: string; basePrice: number } }[];
  } | null;
  discountCode?: {
    id: string;
    code: string;
    kind: "PERCENTAGE" | "FIXED_AMOUNT";
    value: number;
    minSubtotalPence: number;
  } | null;
}

const PROMOTION_SELECT = {
  id: true,
  vendorId: true,
  headline: true,
  subtitle: true,
  badgeText: true,
  callToActionText: true,
  imageKey: true,
  altText: true,
  linkUrl: true,
  priority: true,
  isActive: true,
  startsAt: true,
  endsAt: true,
  audienceSegment: true,
  createdAt: true,
  updatedAt: true,
  categoryId: true,
  bundleId: true,
  discountCodeId: true,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  bundle: {
    select: {
      id: true,
      name: true,
      slug: true,
      items: {
        select: {
          quantity: true,
          product: {
            select: {
              id: true,
              basePrice: true,
            },
          },
        },
      },
    },
  },
  discountCode: {
    select: {
      id: true,
      code: true,
      kind: true,
      value: true,
      minSubtotalPence: true,
    },
  },
} as const;

export interface PromotionWriteInput {
  headline: string;
  subtitle?: string | null;
  badgeText?: string | null;
  callToActionText?: string | null;
  imageKey?: string | null;
  altText?: string | null;
  linkUrl?: string | null;
  priority?: number;
  isActive?: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  audienceSegment?: AudienceSegment;
  categoryId?: string | null;
  bundleId?: string | null;
  discountCodeId?: string | null;
}

export type PromotionWriteResult =
  { ok: true; id: string } | { ok: false; error: string; field?: string };

/**
 * List all promotions for a vendor (staff management view).
 * Ordered by priority descending, then createdAt descending.
 */
export async function listPromotionsForAdmin(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
): Promise<PromotionRow[]> {
  const rows = await prisma.promotion.findMany({
    where: { vendorId },
    select: PROMOTION_SELECT,
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
  return rows as PromotionRow[];
}

/**
 * Get a single promotion by ID, strictly scoped to vendorId.
 */
export async function getPromotionById(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  id: string,
): Promise<PromotionRow | null> {
  const row = await prisma.promotion.findFirst({
    where: { id, vendorId },
    select: PROMOTION_SELECT,
  });
  return (row as PromotionRow) ?? null;
}

/**
 * List live promotions for the storefront hero.
 * Filters: isActive = true, startsAt <= now (or null), endsAt >= now (or null).
 * Ordered by priority descending, then createdAt descending.
 */
export async function listLivePromotions(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  now: Date,
  limit = 3,
): Promise<PromotionRow[]> {
  const rows = await prisma.promotion.findMany({
    where: {
      vendorId,
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    select: PROMOTION_SELECT,
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return rows as PromotionRow[];
}

/**
 * Create a new promotion for a vendor.
 */
export async function createPromotion(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  input: PromotionWriteInput,
): Promise<PromotionWriteResult> {
  try {
    const row = await prisma.promotion.create({
      data: {
        vendorId,
        headline: input.headline,
        subtitle: input.subtitle ?? null,
        badgeText: input.badgeText ?? null,
        callToActionText: input.callToActionText ?? null,
        imageKey: input.imageKey ?? null,
        altText: input.altText ?? null,
        linkUrl: input.linkUrl ?? null,
        priority: input.priority ?? 0,
        isActive: input.isActive ?? true,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        audienceSegment: input.audienceSegment ?? "ALL",
        categoryId: input.categoryId ?? null,
        bundleId: input.bundleId ?? null,
        discountCodeId: input.discountCodeId ?? null,
      },
      select: { id: true },
    });
    return { ok: true, id: row.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create promotion";
    return { ok: false, error: message };
  }
}

/**
 * Update an existing promotion, strictly scoped to vendorId.
 */
export async function updatePromotion(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  id: string,
  input: PromotionWriteInput,
): Promise<PromotionWriteResult> {
  try {
    const existing = await prisma.promotion.findFirst({
      where: { id, vendorId },
      select: { id: true },
    });
    if (!existing) {
      return { ok: false, error: "Promotion not found" };
    }

    const row = await prisma.promotion.update({
      where: { id },
      data: {
        headline: input.headline,
        subtitle: input.subtitle !== undefined ? input.subtitle : undefined,
        badgeText: input.badgeText !== undefined ? input.badgeText : undefined,
        callToActionText: input.callToActionText !== undefined ? input.callToActionText : undefined,
        imageKey: input.imageKey !== undefined ? input.imageKey : undefined,
        altText: input.altText !== undefined ? input.altText : undefined,
        linkUrl: input.linkUrl !== undefined ? input.linkUrl : undefined,
        priority: input.priority !== undefined ? input.priority : undefined,
        isActive: input.isActive !== undefined ? input.isActive : undefined,
        startsAt: input.startsAt !== undefined ? input.startsAt : undefined,
        endsAt: input.endsAt !== undefined ? input.endsAt : undefined,
        audienceSegment: input.audienceSegment !== undefined ? input.audienceSegment : undefined,
        categoryId: input.categoryId !== undefined ? input.categoryId : undefined,
        bundleId: input.bundleId !== undefined ? input.bundleId : undefined,
        discountCodeId: input.discountCodeId !== undefined ? input.discountCodeId : undefined,
      },
      select: { id: true },
    });
    return { ok: true, id: row.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update promotion";
    return { ok: false, error: message };
  }
}

/**
 * Delete a promotion, strictly scoped to vendorId.
 */
export async function deletePromotion(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const existing = await prisma.promotion.findFirst({
      where: { id, vendorId },
      select: { id: true },
    });
    if (!existing) {
      return { ok: false, error: "Promotion not found" };
    }

    await prisma.promotion.delete({
      where: { id },
    });
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete promotion";
    return { ok: false, error: message };
  }
}
