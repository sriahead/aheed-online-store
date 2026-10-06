import type { getPrisma } from "@/lib/db";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";
import {
  generateRandomReferralCode,
  MIN_REFERRAL_ORDER_PENCE,
  REFERRAL_DISCOUNT_PENCE,
} from "@/lib/referrals";

/**
 * A shopper's referral code (#991, #987) — the ONLY DB access for it.
 *
 * Like every repository, each export takes its client, `vendorId` and `userId` as explicit
 * arguments and reads no request context (`tests/repository-purity.test.ts`), so the get-or-create
 * race below can be proven against a real database from a plain script
 * (`scripts/verify-referral-code-integrity.ts`). `lib/referrals-service.ts` is the request-scoped
 * facade.
 */

type Db = ReturnType<typeof getPrisma>;

/** At most this many creates per call: the first plus four retries on a code collision. */
export const MAX_REFERRAL_CODE_CREATE_ATTEMPTS = 5;

export const REFERRAL_CODE_DESCRIPTION = "Customer referral code";

/**
 * The shopper's referral code for this vendor, created if they have none.
 *
 * #991 — this replaces `ensureReferralDiscountCode`, which ran un-awaited after the response with
 * every error discarded, so the code a page displayed and shared could be one that did not exist.
 * Now the code is only ever returned once its row exists. Steady state is one read; the create
 * happens once per shopper per vendor.
 *
 * #987 — the code is found by its OWNER (`referrerUserId`), never re-derived from the user id, and a
 * new one is random. Two kinds of unique violation can happen on create, and they mean different
 * things, so the owner is re-read to tell them apart:
 *   - `@@unique([vendorId, referrerUserId])`: a concurrent request just created THIS shopper's code
 *     — the re-read finds it, and it is returned.
 *   - `@@unique([vendorId, code])`: the random code is already someone else's — the re-read finds
 *     nothing, so try again with a fresh code.
 * `isUniqueViolation` accepts both adapters' codes (`P2002` WebSocket, `23505` HTTP). Any other
 * error is rethrown immediately, not retried.
 *
 * A singular `create` with no nested writes, so it is safe on `getPrisma()`'s HTTP client.
 */
export async function getOrCreateReferralCode(
  prisma: Db,
  vendorId: string,
  userId: string,
): Promise<string> {
  const existing = await findOwnedCode(prisma, vendorId, userId);
  if (existing) return existing;

  for (let attempt = 1; attempt <= MAX_REFERRAL_CODE_CREATE_ATTEMPTS; attempt++) {
    try {
      const created = await prisma.discountCode.create({
        data: {
          vendorId,
          code: generateRandomReferralCode(),
          referrerUserId: userId,
          description: REFERRAL_CODE_DESCRIPTION,
          kind: "FIXED_AMOUNT",
          value: REFERRAL_DISCOUNT_PENCE,
          minSubtotalPence: MIN_REFERRAL_ORDER_PENCE,
          maxPerCustomer: 1,
          remainingRedemptions: null,
          isActive: true,
        },
        select: { code: true },
      });
      return created.code;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await findOwnedCode(prisma, vendorId, userId);
      if (raced) return raced;
    }
  }
  throw new Error(
    `Referral code: ${MAX_REFERRAL_CODE_CREATE_ATTEMPTS} generated codes all collided for vendor ${vendorId}`,
  );
}

/**
 * How many times the shopper's referral code has been redeemed (every redemption row, as the
 * loyalty page has always counted them). Zero when they have no code.
 */
export async function countReferralRedemptions(
  prisma: Db,
  vendorId: string,
  userId: string,
): Promise<number> {
  return prisma.discountRedemption.count({
    where: { vendorId, code: { vendorId, referrerUserId: userId } },
  });
}

async function findOwnedCode(prisma: Db, vendorId: string, userId: string): Promise<string | null> {
  const row = await prisma.discountCode.findFirst({
    where: { vendorId, referrerUserId: userId },
    select: { code: true },
  });
  return row?.code ?? null;
}
