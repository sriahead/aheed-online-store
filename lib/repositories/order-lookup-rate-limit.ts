import type { getPrisma } from "@/lib/db";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

/** SHA-256 of the caller's IP — see OrderLookupAttempt's schema comment for why hashed, not raw. */
async function hashIp(ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Fixed-window rate limit for the guest order lookup form (P7a fix, #123/#192;
 * validation.md §4: "Rate-limiting refuses >5 lookup attempts per minute per
 * IP/host"). Backed by Postgres, not a Cloudflare rate-limiting binding — none
 * is provisioned (checked wrangler.toml), and adding one is new infrastructure
 * a Fix-stage correction shouldn't invent unasked (CLAUDE.md's hard stop).
 *
 * Best-effort, not compare-and-set: two concurrent requests could both read the
 * same under-threshold count and both be admitted, unlike the stock/points/
 * discount counters elsewhere in this codebase. That is an acceptable trade for
 * a lookup throttle (worst case, one caller gets one extra try in a window) —
 * a $transaction on getPrismaWs() for every single public lookup would be
 * disproportionate to what is actually being protected.
 *
 * `prisma` is an explicit parameter (#409) so this throttle can be exercised
 * against a real database from a plain `tsx` script. It is a security control,
 * and while it resolved its own client it could not be tested outside a live
 * Workers request at all — `lib/db`'s client is built from `@prisma/client/wasm`,
 * whose query compiler Node cannot load. `lib/order-lookup-rate-limit-service.ts`
 * is the request-scoped entry point.
 */
export async function checkOrderLookupRateLimit(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  ip: string,
): Promise<{ allowed: boolean }> {
  const ipHash = await hashIp(ip);
  const since = new Date(Date.now() - WINDOW_MS);

  const count = await prisma.orderLookupAttempt.count({
    where: { vendorId, ipHash, createdAt: { gte: since } },
  });

  if (count >= MAX_ATTEMPTS) {
    return { allowed: false };
  }

  await prisma.orderLookupAttempt.create({ data: { vendorId, ipHash } });
  return { allowed: true };
}
