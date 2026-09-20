import type { getPrisma } from "@/lib/db";

/**
 * Write throttle for customer feedback (P9.2, #818).
 *
 * Deliberately the same shape as `lib/repositories/order-lookup-rate-limit.ts` (#409, #468):
 * a Postgres-backed fixed window over hashed IPs, with a probabilistic sweep so the table
 * cannot grow without bound. No Cloudflare rate-limiting binding is provisioned (checked
 * `wrangler.toml`), and inventing one for this would be new infrastructure nobody asked for.
 *
 * TWO RULES, NOT ONE, and the second is the one that is easy to leave out:
 *
 * 1. At most `MAX_WRITES_PER_WINDOW` write attempts per (vendor, hashed IP) per
 *    `WINDOW_MS`. Submits and edits count identically.
 * 2. At least `MIN_EDIT_INTERVAL_MS` between successive writes to the SAME row.
 *
 * Without rule 2, `@@unique([vendorId, userId])` quietly converts flooding into churn:
 * one account cannot accumulate rows, but it can rewrite its single row endlessly, and each
 * rewrite resets the row to PENDING and puts it back in front of a human. The cost being
 * protected here is a moderator's attention, not disk.
 *
 * Best-effort, not compare-and-set, for the same reason the order-lookup throttle is: two
 * concurrent requests could both read an under-threshold count and both be admitted. One
 * extra write in a window is an acceptable trade against a `$transaction` on every
 * submission.
 *
 * `prisma` is explicit so this can be exercised against a real database from a plain `tsx`
 * script — it is a security control, and a rate limiter nobody can run is a rate limiter
 * nobody can prove.
 */

const WINDOW_MS = 10 * 60_000;
const MAX_WRITES_PER_WINDOW = 5;
const MIN_EDIT_INTERVAL_MS = 60_000;

// Retention only has to exceed WINDOW_MS. The probability is low so the extra deleteMany
// does not add latency to every submission. `deleteMany` is safe on the HTTP adapter —
// unlike updateMany/createMany — so no websocket client is needed here.
const RETENTION_MS = 60 * 60 * 1000;
const SWEEP_PROBABILITY = 0.01;

export const FEEDBACK_RATE_LIMIT = {
  windowMs: WINDOW_MS,
  maxWritesPerWindow: MAX_WRITES_PER_WINDOW,
  minEditIntervalMs: MIN_EDIT_INTERVAL_MS,
} as const;

/** SHA-256 of the caller's IP — see CustomerFeedbackAttempt's schema comment for why hashed. */
export async function hashIp(ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type FeedbackRateLimitResult =
  | { allowed: true; ipHash: string }
  | { allowed: false; reason: "too-many-writes" | "too-soon-after-last-edit" };

/**
 * Check both rules and, when allowed, record the attempt.
 *
 * `lastSubmittedAt` is the existing row's `submittedAt`, or null when this customer has no
 * feedback yet. It is passed in rather than read here so this function stays a pure counter
 * over its own table and the caller keeps a single read of the feedback row.
 */
export async function checkFeedbackWriteRateLimit(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  ip: string,
  lastSubmittedAt: Date | null,
): Promise<FeedbackRateLimitResult> {
  const now = Date.now();

  if (lastSubmittedAt && now - lastSubmittedAt.getTime() < MIN_EDIT_INTERVAL_MS) {
    return { allowed: false, reason: "too-soon-after-last-edit" };
  }

  const ipHash = await hashIp(ip);
  const since = new Date(now - WINDOW_MS);

  const count = await prisma.customerFeedbackAttempt.count({
    where: { vendorId, ipHash, createdAt: { gte: since } },
  });

  if (count >= MAX_WRITES_PER_WINDOW) {
    return { allowed: false, reason: "too-many-writes" };
  }

  await prisma.customerFeedbackAttempt.create({ data: { vendorId, ipHash } });

  if (Math.random() < SWEEP_PROBABILITY) {
    await prisma.customerFeedbackAttempt.deleteMany({
      where: { createdAt: { lt: new Date(now - RETENTION_MS) } },
    });
  }

  return { allowed: true, ipHash };
}
