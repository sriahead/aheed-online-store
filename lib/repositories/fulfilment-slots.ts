import type { getPrisma } from "@/lib/db";
import type { FulfilmentMethod } from "@prisma/client";

export type { FulfilmentMethod };

type Db = ReturnType<typeof getPrisma>;

export interface AvailableSlot {
  id: string;
  startTime: string;
  endTime: string;
  capacity: number;
  available: number;
}

/**
 * Available `VendorFulfilmentSlot` rows for a vendor/method/date, with remaining capacity (P401,
 * #401) — the only DB access for slot availability.
 *
 * Takes `prisma` and `vendorId` explicitly per the repository-layer contract (CLAUDE.md, #252/#409)
 * — no request context is read here. The request-scoped wrapper lives in
 * `lib/fulfilment-slots-service.ts`, beside this file rather than inside it.
 */
export async function getAvailableSlotsForDate(
  prisma: Db,
  vendorId: string,
  method: FulfilmentMethod,
  dateStr: string,
): Promise<AvailableSlot[]> {
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay(); // 0 = Sunday

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: { config: true, fulfilmentSlots: { where: { method, dayOfWeek } } },
  });

  if (!vendor || !vendor.config || vendor.fulfilmentSlots.length === 0) return [];

  const holdMinutes = vendor.config.slotHoldDurationMinutes;
  const cutoff = new Date(Date.now() - holdMinutes * 60000);

  // To avoid N+1 queries, we group by slotId
  const usedCounts = await prisma.order.groupBy({
    by: ["fulfilmentSlotId"],
    where: {
      vendorId,
      fulfilmentDate: date,
      fulfilmentSlotId: { in: vendor.fulfilmentSlots.map((s) => s.id) },
      OR: [
        {
          status: {
            in: ["CONFIRMED", "READY_FOR_COLLECTION", "OUT_FOR_DELIVERY", "DELIVERED", "COLLECTED"],
          },
        },
        { status: "PENDING_PAYMENT", createdAt: { gte: cutoff } },
      ],
    },
    _count: {
      id: true,
    },
  });

  const usedMap = new Map(usedCounts.map((u) => [u.fulfilmentSlotId, u._count.id]));

  return vendor.fulfilmentSlots
    .map((slot) => {
      const used = usedMap.get(slot.id) || 0;
      return {
        id: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        capacity: slot.capacity,
        available: Math.max(0, slot.capacity - used),
      };
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}
