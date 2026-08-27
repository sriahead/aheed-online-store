import { getPrisma } from "@/lib/db";
import {
  getCatalogueHealth,
  getLoyaltyLiability,
  type CatalogueHealth,
  type LoyaltyLiability,
} from "@/lib/repositories/reports";

/**
 * Request-scoped entry points for the non-sales report tiles on /staff/reports
 * (#409).
 *
 * Lives beside, not inside, `lib/repositories/reports.ts` so both exports there
 * keep taking `prisma` and `vendorId` explicitly and stay runnable from a plain
 * `tsx` script. See `lib/customers-service.ts` for the full rationale — including
 * why `vendorId` is a parameter here rather than resolved from request context.
 *
 * Each function resolves its own client per call; nothing is cached across
 * requests (CLAUDE.md).
 */
export async function getCatalogueHealthForVendor(vendorId: string): Promise<CatalogueHealth> {
  return getCatalogueHealth(getPrisma(), vendorId);
}

export async function getLoyaltyLiabilityForVendor(vendorId: string): Promise<LoyaltyLiability> {
  return getLoyaltyLiability(getPrisma(), vendorId);
}
