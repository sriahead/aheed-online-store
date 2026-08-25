import { cache } from "react";
import { getPrisma } from "@/lib/db";
import { getCurrentVendorIdOrNull } from "@/lib/tenant";
import {
  listCampaignsByCategory,
  getCampaignForCategory,
  upsertCampaign,
  setCampaignImage,
  type CampaignRow,
  type CampaignWriteInput,
  type CampaignWriteResult,
} from "@/lib/repositories/campaigns";

/**
 * Request-scoped wrapper around `lib/repositories/campaigns.ts`'s pure
 * functions (P8.5e, #356) — resolves a live Prisma client, and for the
 * storefront read, the current vendor too.
 *
 * Lives beside, not inside, `lib/repositories/` for the same reason
 * `lib/categories-service.ts` and `lib/promotions-service.ts` (deleted, P8.5b)
 * did: the repository module's exports take `prisma`/`vendorId` explicitly and
 * read no request context, so a plain `tsx` script can exercise them.
 *
 * **Every export here exists because `app/**`, `features/**` and
 * `components/**` are ESLint-forbidden from importing `@/lib/db` at all**
 * (`no-restricted-imports`, ADR-004 slice 2 — checked at Build, not caught
 * when this slice's spec was written). `getCategoryRepository()`-style admin
 * reads (`listCategoriesForAdmin`, `createCategoryForVendor`, ...) sidestep
 * this by calling `getPrisma()` INSIDE `lib/repositories/categories.ts`
 * itself; this slice's repository functions deliberately don't (R3 asks for
 * `prisma` as an explicit parameter on all three, so a plain script can drive
 * them without a live request), so the thin `getPrisma()`-constructing wrap
 * has to live somewhere the app layer is allowed to import — here, not in
 * `features/admin/campaigns.ts` or the `/staff/promotions` pages.
 *
 * Prisma is constructed fresh per call — never cached across requests.
 */

/** Storefront hero read — the one caller with no `vendorId` of its own. Result
 *  memoised per request with React `cache()`. */
export const getCampaignsForHero = cache(
  async (categoryIds: readonly string[]): Promise<Map<string, CampaignRow>> => {
    const vendorId = await getCurrentVendorIdOrNull();
    // An unresolved host gets no campaigns, same as no promotions — the
    // storefront layout redirects these to /coming-soon anyway.
    if (!vendorId) return new Map();
    return listCampaignsByCategory(getPrisma(), vendorId, categoryIds);
  },
);

/** `/staff/promotions`'s list — `vendorId` already in hand from `requireVendorRole`. */
export function listCampaignsForVendor(
  vendorId: string,
  categoryIds: readonly string[],
): Promise<Map<string, CampaignRow>> {
  return listCampaignsByCategory(getPrisma(), vendorId, categoryIds);
}

/** `/staff/promotions/[categoryId]`'s edit page. */
export function getCampaignForVendorCategory(
  vendorId: string,
  categoryId: string,
): Promise<CampaignRow | null> {
  return getCampaignForCategory(getPrisma(), vendorId, categoryId);
}

/** `features/admin/campaigns.ts`'s `saveCampaign` action. */
export function saveCampaignForVendor(
  vendorId: string,
  categoryId: string,
  input: CampaignWriteInput,
): Promise<CampaignWriteResult> {
  return upsertCampaign(getPrisma(), vendorId, categoryId, input);
}

/** `features/admin/campaign-image.ts`'s `attachCampaignImage` action. */
export function saveCampaignImageForVendor(
  vendorId: string,
  categoryId: string,
  imageKey: string,
  altText: string,
): Promise<CampaignWriteResult> {
  return setCampaignImage(getPrisma(), vendorId, categoryId, imageKey, altText);
}
