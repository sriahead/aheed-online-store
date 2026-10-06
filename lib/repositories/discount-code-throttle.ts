import type { getPrisma } from "@/lib/db";

/**
 * Discount-code throttle (#988). The checkout's code checks answer "isn't recognised" for a code
 * that does not exist and something else for one that does, so without a limit they are an oracle
 * for guessing an unadvertised (staff, partner) code at the speed of a server action.
 *
 * Same shape as `checkOrderLookupRateLimit` (`order-lookup-rate-limit.ts`), on purpose:
 *   - backed by Postgres, because no Cloudflare rate-limiting binding is provisioned and adding one
 *     is new infrastructure;
 *   - keyed on vendor and a SHA-256 of the IP, never the raw IP;
 *   - best-effort, not compare-and-set — concurrent requests can each get one extra try in a window,
 *     an accepted trade for a throttle;
 *   - a one-hour retention sweep run with low probability so it adds no latency to most requests.
 *     `deleteMany` is safe on the HTTP client (CLAUDE.md), unlike `updateMany`/`createMany`.
 *
 * Unlike that throttle it counts only FAILED guesses: `recordUnknownDiscountCode` is called only for
 * an UNKNOWN result, so a shopper typing real codes — expired or below minimum included — is never
 * throttled. Takes `prisma` explicitly so it can be proven against a real database from a script.
 */

type Db = ReturnType<typeof getPrisma>;

export const DISCOUNT_CODE_WINDOW_MS = 60_000;
export const MAX_UNKNOWN_DISCOUNT_CODES = 10;
const RETENTION_MS = 60 * 60 * 1000;
const SWEEP_PROBABILITY = 0.01;

/** Lowercase hex SHA-256 of the caller's IP. */
export async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** True once this IP has tried `MAX_UNKNOWN_DISCOUNT_CODES` unknown codes on this vendor in the window. */
export async function isDiscountCodeCheckThrottled(
  prisma: Db,
  vendorId: string,
  ip: string,
): Promise<boolean> {
  const count = await prisma.discountCodeAttempt.count({
    where: {
      vendorId,
      ipHash: await hashIp(ip),
      createdAt: { gte: new Date(Date.now() - DISCOUNT_CODE_WINDOW_MS) },
    },
  });
  return count >= MAX_UNKNOWN_DISCOUNT_CODES;
}

/** Counts one unknown code against this IP on this vendor. */
export async function recordUnknownDiscountCode(
  prisma: Db,
  vendorId: string,
  ip: string,
): Promise<void> {
  await prisma.discountCodeAttempt.create({ data: { vendorId, ipHash: await hashIp(ip) } });

  if (Math.random() < SWEEP_PROBABILITY) {
    await prisma.discountCodeAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });
  }
}
