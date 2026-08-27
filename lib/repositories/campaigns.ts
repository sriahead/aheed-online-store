import type { getPrisma } from "@/lib/db";

/**
 * Department hero campaigns (P8.5e, #356) — one row per top-level Category.
 *
 * EVERY EXPORTED FUNCTION takes `prisma` and `vendorId` as EXPLICIT arguments
 * and reads no request context — no `getCurrentVendorId()`, no `headers()`, no
 * `getAuth()`. The request-scoped facade lives in `lib/campaigns-service.ts`
 * instead, matching every repository since #252/P8.1b.
 * `tests/repository-purity.test.ts` enforces the location.
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

// Liveness (`isCampaignLive`) lives in lib/campaign-liveness.ts, not here — a
// re-export here would still pull in this file's `getPrisma` import for any
// caller that only wants the pure check, which is exactly what that file
// exists to avoid. Import it from lib/campaign-liveness directly.

/**
 * Every campaign row for the given categories, keyed by categoryId — active or
 * not, live or not. Callers that only care about the storefront-visible set
 * filter with `isCampaignLive`; the staff list needs the inactive/scheduled/
 * expired rows too, so filtering happens above this function, not in the query.
 */
export async function listCampaignsByCategory(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  categoryIds: readonly string[],
): Promise<Map<string, CampaignRow>> {
  if (categoryIds.length === 0) return new Map();

  const rows = await prisma.departmentCampaign.findMany({
    where: { vendorId, categoryId: { in: [...categoryIds] } },
    select: CAMPAIGN_SELECT,
  });

  return new Map(rows.map((row) => [row.categoryId, row]));
}

export async function getCampaignForCategory(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  categoryId: string,
): Promise<CampaignRow | null> {
  return prisma.departmentCampaign.findFirst({
    where: { vendorId, categoryId },
    select: CAMPAIGN_SELECT,
  });
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

/**
 * Create or update the one campaign row a category may have.
 *
 * The category is re-checked against `vendorId` here rather than trusted from
 * the caller, same posture as `checkParent` in `lib/repositories/categories.ts`
 * — another vendor's category id must be indistinguishable from one that
 * doesn't exist. `categoryId` being `@unique` on the model is what makes this a
 * genuine upsert rather than a create-then-find-then-update race.
 */
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

  const row = await prisma.departmentCampaign.upsert({
    where: { categoryId },
    create: {
      vendorId,
      categoryId,
      headline: input.headline,
      subtitle: input.subtitle,
      linkUrl: input.linkUrl,
      isActive: input.isActive,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    },
    update: {
      headline: input.headline,
      subtitle: input.subtitle,
      linkUrl: input.linkUrl,
      isActive: input.isActive,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    },
    select: { id: true },
  });

  return { ok: true, id: row.id };
}

/**
 * Attach an uploaded banner image to an EXISTING campaign row.
 *
 * Deliberately does not create a row — mirrors `attachProductImage`'s posture
 * of operating on an entity that already exists. A department's campaign is
 * created by saving its headline first (`upsertCampaign`); the image is a
 * property of that row, not a second way to bring one into existence, so a
 * category with no campaign yet returns a named refusal instead of silently
 * upserting a headline-less row.
 */
export async function setCampaignImage(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  categoryId: string,
  imageKey: string,
  altText: string,
): Promise<CampaignWriteResult> {
  const existing = await prisma.departmentCampaign.findFirst({
    where: { vendorId, categoryId },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false, error: "Save the campaign's headline before adding a photo." };
  }

  const row = await prisma.departmentCampaign.update({
    where: { categoryId },
    data: { imageKey, altText },
    select: { id: true },
  });

  return { ok: true, id: row.id };
}
