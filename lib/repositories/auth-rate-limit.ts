import type { getPrisma } from "@/lib/db";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

/** SHA-256 of the caller's IP — see AuthenticationAttempt's schema comment for why hashed, not raw. */
async function hashIp(ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Fixed-window rate limit for authentication (P9.1, #431).
 * Mirrors order lookup throttle: backed by Postgres, best-effort.
 * Disabling Better Auth's default memory limiter in favor of this Workers-compatible logic.
 *
 * `prisma` is an explicit parameter (#409) so this throttle can be exercised
 * against a real database from a plain `tsx` script.
 */
export async function checkAuthRateLimit(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  ip: string,
): Promise<{ allowed: boolean }> {
  const ipHash = await hashIp(ip);
  const since = new Date(Date.now() - WINDOW_MS);

  const count = await prisma.authenticationAttempt.count({
    where: { vendorId, ipHash, createdAt: { gte: since } },
  });

  if (count >= MAX_ATTEMPTS) {
    return { allowed: false };
  }

  await prisma.authenticationAttempt.create({ data: { vendorId, ipHash } });
  return { allowed: true };
}
