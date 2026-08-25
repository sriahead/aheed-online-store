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

export interface CampaignLivenessFields {
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

/**
 * Is this campaign LIVE right now? `isActive` is the on/off switch;
 * `startsAt`/`endsAt` are an optional window on top of it — a null bound
 * doesn't constrain that side, so "no dates" and "always live once active"
 * are the same case.
 */
export function isCampaignLive(campaign: CampaignLivenessFields, now: Date): boolean {
  if (!campaign.isActive) return false;
  if (campaign.startsAt !== null && campaign.startsAt > now) return false;
  if (campaign.endsAt !== null && campaign.endsAt < now) return false;
  return true;
}
