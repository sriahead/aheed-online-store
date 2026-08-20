import { cache } from "react";
import { getPrisma } from "@/lib/db";
import { getCurrentVendorIdOrNull } from "@/lib/tenant";
import { listActivePromotions, type Promotion } from "@/lib/repositories/promotions";

/**
 * Request-scoped wrapper around `lib/repositories/promotions.ts`'s pure
 * functions (P7.5c+f, #233) — resolves a live Prisma client and the current
 * vendor, which needs a real Workers request.
 *
 * Lives beside, not inside, `lib/repositories/` for the same reason
 * `lib/data-rights-service.ts` and `lib/auth-rbac.ts` do: the repository
 * module's whole point is that every export there takes `prisma` and `vendorId`
 * explicitly and reads no request context, so a plain `tsx` script can exercise
 * it. A request-context resolver added to that file would be a second entry
 * point into the same exports, making the property true of some and not others
 * (#252).
 *
 * `app/` and `components/` cannot import `@/lib/db` directly (ADR-004 slice-2
 * lint guard), so this file is the one place that does, on their behalf.
 *
 * Prisma is constructed fresh per call — never cached across requests, per
 * `lib/db.ts`'s contract on Workers. The RESULT is memoized per request with
 * React `cache()`, the same way `getCurrentVendorProfile` is, so the hero and
 * anything else on the page share a single query without pinning a client
 * across request boundaries.
 */
export const getCurrentVendorPromotions = cache(async (): Promise<readonly Promotion[]> => {
  const vendorId = await getCurrentVendorIdOrNull();
  // An unresolved host renders no promotions rather than another vendor's. The
  // storefront layout redirects these to /coming-soon anyway.
  if (!vendorId) return [];
  return listActivePromotions(getPrisma(), vendorId);
});

export type { Promotion };
