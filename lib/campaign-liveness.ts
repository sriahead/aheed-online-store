/**
 * Department campaign liveness (P8.5e, #356) — pure, no imports, deliberately.
 *
 * Same posture as lib/product-image.ts: this is imported by both
 * `app/(storefront)/page.tsx` (to decide what `DepartmentHero` sees) and the
 * `/staff/promotions` list (to show Live/Scheduled/Expired), so it must not
 * drag `lib/db.ts`'s `@prisma/client/wasm` import along — that import fails
 * under plain Node/vitest, only workerd's loader resolves it (CLAUDE.md).
 * Keeping this out of `lib/repositories/campaigns.ts` (which DOES import
 * `getPrisma`) is what lets a unit test reach it directly.
 */

import { isPromotionLive, type PromotionLivenessFields } from "@/lib/promotion-liveness";

export type CampaignLivenessFields = PromotionLivenessFields;

/**
 * Backward-compatible alias for isPromotionLive.
 */
export const isCampaignLive = isPromotionLive;
