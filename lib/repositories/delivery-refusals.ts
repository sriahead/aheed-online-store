import type { getPrisma } from "@/lib/db";

/**
 * Out-of-area refusal counts (#889) — the ONLY DB access for `DeliveryRefusalCount`.
 *
 * One row per vendor, postcode DISTRICT (outward code, e.g. `MK17`), vendor-local calendar day and
 * surface (`HEADER` or `CHECKOUT`), holding a count. It exists so a store can see which districts
 * shoppers actually try before deciding where to deliver next — the input `#613` said had to come
 * from Aheed and that the platform had nowhere to get.
 *
 * NOT PERSONAL DATA, deliberately. No user, session, full postcode, cookie or IP ever reaches this
 * table, so it is outside data-rights export and erasure. Keep it that way: a column identifying a
 * shopper would pull it into `lib/repositories/data-rights.ts` and PECR consent.
 *
 * Every export takes `prisma` and `vendorId` explicitly and reads no request context (#252), so a
 * plain `tsx` script can exercise it. `upsert` is safe on the HTTP client (`CLAUDE.md`): it is one
 * statement, not an implicit transaction.
 */

type Db = ReturnType<typeof getPrisma>;

export type DeliveryRefusalSource = "HEADER" | "CHECKOUT";

export interface DeliveryRefusalSummary {
  district: string;
  header: number;
  checkout: number;
  total: number;
}

/**
 * Count one refusal. `day` is the vendor-local calendar day as a UTC-midnight `Date` (the
 * `@db.Date` column stores the date part only) — the caller resolves it in the vendor's timezone.
 */
export async function recordDeliveryRefusal(
  prisma: Db,
  vendorId: string,
  district: string,
  day: Date,
  source: DeliveryRefusalSource,
): Promise<void> {
  await prisma.deliveryRefusalCount.upsert({
    where: { vendorId_district_day_source: { vendorId, district, day, source } },
    create: { vendorId, district, day, source, count: 1 },
    update: { count: { increment: 1 } },
  });
}

/**
 * Districts refused on or after `sinceDay`, one entry per district with both surfaces folded in,
 * highest total first (ties by district), at most `limit`.
 */
export async function listRecentDeliveryRefusals(
  prisma: Db,
  vendorId: string,
  sinceDay: Date,
  limit: number,
): Promise<DeliveryRefusalSummary[]> {
  const rows = await prisma.deliveryRefusalCount.findMany({
    where: { vendorId, day: { gte: sinceDay } },
    select: { district: true, source: true, count: true },
  });

  const byDistrict = new Map<string, DeliveryRefusalSummary>();
  for (const row of rows) {
    const entry = byDistrict.get(row.district) ?? {
      district: row.district,
      header: 0,
      checkout: 0,
      total: 0,
    };
    if (row.source === "HEADER") entry.header += row.count;
    else entry.checkout += row.count;
    entry.total += row.count;
    byDistrict.set(row.district, entry);
  }

  return [...byDistrict.values()]
    .sort((a, b) => b.total - a.total || a.district.localeCompare(b.district))
    .slice(0, limit);
}
