import type { getPrisma } from "@/lib/db";

// #565 (P2.6 slice 2) — every storefront search submission's outcome, vendor-scoped, no user
// link (#570 — see prisma/schema.prisma's SearchQueryLog docstring for why). Retention only has
// to outlast a staff monthly review; SWEEP_PROBABILITY is deliberately low so the sweep's extra
// deleteMany doesn't add latency to every request — same shape as
// lib/repositories/error-events.ts and lib/repositories/order-lookup-rate-limit.ts.
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const SWEEP_PROBABILITY = 0.01;
const QUERY_MAX = 200;

/** SHA-256 of the caller's IP — see OrderLookupAttempt's schema comment for why hashed, not raw. */
async function hashIp(ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Records one search submission's outcome. `directResultCount` is the DIRECT (#564) search's own
 * candidate count, before any zero-result-ladder rung; `recoveryRung` is `null` when the direct
 * search already succeeded, or which rung (if any) rescued a zero-result query, including
 * `"none"` for one the whole ladder couldn't rescue — see `ProductPage.recovery`.
 *
 * `directNameMatch` (P2.6 slice 3, #580) is what makes a THIN result visible here. Without it a
 * query returning one tangential description hit logs `directResultCount: 1, recoveryRung: null`,
 * byte-identical to a query that worked — and those rows are exactly the ones #566's synonym
 * proposal step most needs to read.
 *
 * Takes `prisma` and `vendorId` as explicit parameters and reads no request context (#252); the
 * request-scoped caller (`lib/products-service.ts`) resolves the raw IP and passes it straight
 * through — hashing happens here, not there, matching
 * `lib/repositories/order-lookup-rate-limit.ts`'s own `hashIp` rather than a shared helper.
 */
export async function recordSearchQuery(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  ip: string,
  query: string,
  directResultCount: number,
  recoveryRung: string | null,
  directNameMatch: boolean,
): Promise<void> {
  const ipHash = await hashIp(ip);

  await prisma.searchQueryLog.create({
    data: {
      vendorId,
      query: query.trim().toLowerCase().slice(0, QUERY_MAX),
      directResultCount,
      recoveryRung,
      directNameMatch,
      ipHash,
    },
  });

  if (Math.random() < SWEEP_PROBABILITY) {
    await prisma.searchQueryLog.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });
  }
}

/**
 * The queries worth proposing synonyms for (P2.6 slice 3, #566) — the ones that found NOTHING, and
 * the ones that found only description-prose matches (#580's thin results).
 *
 * Thin rows matter as much as empty ones here: a shopper searching `haldi` who gets one tangential
 * product has told us just as clearly that a word is missing from the dictionary as one who got
 * zero results. Before `directNameMatch` existed those two outcomes were indistinguishable in this
 * table. `directNameMatch: false` is matched explicitly rather than "not true", so rows written
 * before that column existed (`null` — genuinely unknown) are excluded rather than assumed thin.
 *
 * Deduplicated by query text in the caller's language rather than SQL's: `distinct` on a Prisma
 * `findMany` is expressible, and keeps the AI prompt free of the same term repeated fifty times.
 */
export async function listCurationCandidateQueries(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  limit: number,
): Promise<string[]> {
  const rows = await prisma.searchQueryLog.findMany({
    where: {
      vendorId,
      OR: [{ directResultCount: 0 }, { directNameMatch: false }],
    },
    select: { query: true },
    distinct: ["query"],
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => row.query);
}
