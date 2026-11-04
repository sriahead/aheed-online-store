import type { getPrisma } from "@/lib/db";

/**
 * Department hero campaigns (P8.5e, #356) — backward-compatible facade over
 * the Promotion model (#1412).
 *
 * EVERY EXPORTED FUNCTION takes `prisma` and `vendorId` as EXPLICIT arguments
 * and reads no request context — no `getCurrentVendorId()`, no `headers()`, no
 * `getAuth()`. The request-scoped facade lives in `lib/campaigns-service.ts`
 * instead. `tests/repository-purity.test.ts` enforces the location.
 */

export interface CampaignRow {
  id: string;
  categoryId: string;
  headline: string;
  subtitle: string | null;
  imageKey: string | null;
  altText: string | null;
  linkUrl: string | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

const CAMPAIGN_SELECT = {
  id: true,
  categoryId: true,
  headline: true,
  subtitle: true,
  imageKey: true,
  altText: true,
  linkUrl: true,
  isActive: true,
  startsAt: true,
  endsAt: true,
} as const;

export async function listCampaignsByCategory(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  categoryIds: readonly string[],
): Promise<Map<string, CampaignRow>> {
  if (categoryIds.length === 0) return new Map();

  const rows = await prisma.promotion.findMany({
    where: { vendorId, categoryId: { in: [...categoryIds] } },
    select: CAMPAIGN_SELECT,
  });

  const map = new Map<string, CampaignRow>();
  for (const row of rows) {
    if (row.categoryId) {
      map.set(row.categoryId, row as CampaignRow);
    }
  }
  return map;
}

export async function getCampaignForCategory(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  categoryId: string,
): Promise<CampaignRow | null> {
  const row = await prisma.promotion.findFirst({
    where: { vendorId, categoryId },
    select: CAMPAIGN_SELECT,
  });
  return (row as CampaignRow) ?? null;
}

export interface CampaignWriteInput {
  headline: string;
  subtitle: string | null;
  linkUrl: string | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

export type CampaignWriteResult =
  { ok: true; id: string } | { ok: false; error: string; field?: string };

export async function upsertCampaign(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  categoryId: string,
  input: CampaignWriteInput,
): Promise<CampaignWriteResult> {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, vendorId },
    select: { id: true },
  });
  if (!category) return { ok: false, error: "That department no longer exists." };

  const existing = await prisma.promotion.findFirst({
    where: { vendorId, categoryId },
    select: { id: true },
  });

  if (existing) {
    const updated = await prisma.promotion.update({
      where: { id: existing.id },
      data: {
        headline: input.headline,
        subtitle: input.subtitle,
        linkUrl: input.linkUrl,
        isActive: input.isActive,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      },
      select: { id: true },
    });
    return { ok: true, id: updated.id };
  }

  const created = await prisma.promotion.create({
    data: {
      vendorId,
      categoryId,
      headline: input.headline,
      subtitle: input.subtitle,
      linkUrl: input.linkUrl,
      isActive: input.isActive,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    },
    select: { id: true },
  });

  return { ok: true, id: created.id };
}

export async function setCampaignImage(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  categoryId: string,
  imageKey: string,
  altText: string,
): Promise<CampaignWriteResult> {
  const existing = await prisma.promotion.findFirst({
    where: { vendorId, categoryId },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false, error: "Save the campaign's headline before adding a photo." };
  }

  const row = await prisma.promotion.update({
    where: { id: existing.id },
    data: { imageKey, altText },
    select: { id: true },
  });

  return { ok: true, id: row.id };
}
