import type { getPrisma } from "@/lib/db";

/**
 * Per-caller throttle for the AI normalisation pre-pass on /shop-your-list (P2.6 slice 4, #567).
 *
 * Deliberately the same shape as lib/repositories/order-lookup-rate-limit.ts rather than something
 * cleverer: a fixed window, a hashed IP, a low-probability retention sweep, and Postgres as the
 * store because no KV, D1 or rate-limiting binding is provisioned in wrangler.toml and CLAUDE.md
 * records that no proxy.ts can ship on this stack to hold a central limit. Two existing precedents
 * beat inventing a third mechanism.
 *
 * WHAT BEING REFUSED MEANS HERE, AND WHY IT IS UNUSUALLY CHEAP.
 * Refusal does not fail the request. The caller skips the AI pre-pass and runs the deterministic
 * matcher this feature shipped with in P3d, so a throttled shopper still gets their list matched —
 * they just lose the interpretation. That is what makes a limit affordable on a public endpoint at
 * all: unlike most rate-limited routes, this one has a real non-AI path, so the limit never
 * produces an error page and a false positive (a household behind one NAT) costs nothing but
 * enrichment.
 *
 * Best-effort, not compare-and-set: two concurrent submissions could both read the same
 * under-threshold count and both be admitted. Same trade as the order-lookup throttle — the worst
 * case is one extra AI call in a window, and a $transaction on getPrismaWs() for every public list
 * submission would cost more than what it protects.
 *
 * `prisma` and `vendorId` are explicit parameters (#409/#411) so this can be exercised against a
 * real database from a plain tsx script. It is a cost control, and a cost control that can only run
 * inside a live Workers request cannot be tested before it matters.
 * lib/list-normalisation-service.ts is the request-scoped entry point.
 */

/** Fixed window. Five submissions a minute is generous for a person, useless for a script. */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

// Retention only has to exceed WINDOW_MS; the sweep probability is deliberately low so the extra
// deleteMany doesn't add latency to every submission. deleteMany is confirmed safe on the HTTP
// adapter (getPrisma()) per CLAUDE.md — unlike updateMany/createMany — so no getPrismaWs() here.
const RETENTION_MS = 60 * 60 * 1000;
const SWEEP_PROBABILITY = 0.01;

/** SHA-256 of the caller's IP — this table is only ever a counter, so no raw address is stored. */
async function hashIp(ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function checkListNormalisationRateLimit(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  ip: string,
): Promise<{ allowed: boolean }> {
  const ipHash = await hashIp(ip);
  const since = new Date(Date.now() - WINDOW_MS);

  const count = await prisma.listNormalisationAttempt.count({
    where: { vendorId, ipHash, createdAt: { gte: since } },
  });

  if (count >= MAX_ATTEMPTS) {
    return { allowed: false };
  }

  await prisma.listNormalisationAttempt.create({ data: { vendorId, ipHash } });

  if (Math.random() < SWEEP_PROBABILITY) {
    await prisma.listNormalisationAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });
  }

  return { allowed: true };
}

/** Exported for tests and for the service facade's own documentation. */
export const LIST_NORMALISATION_WINDOW_MS = WINDOW_MS;
export const LIST_NORMALISATION_MAX_ATTEMPTS = MAX_ATTEMPTS;
