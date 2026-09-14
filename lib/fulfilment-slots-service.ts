import { getPrisma } from "@/lib/db";
import {
  getAvailableSlotsForDate,
  type AvailableSlot,
  type FulfilmentMethod,
} from "@/lib/repositories/fulfilment-slots";

/**
 * Request-scoped wrapper around `lib/repositories/fulfilment-slots.ts` (P401, #401) — resolves a
 * live Prisma client fresh per call so `features/checkout/slots.ts` never imports `@/lib/db` or
 * `@prisma/client` itself (ADR-004 slice 2). Lives beside, not inside, `lib/repositories/`, matching
 * `lib/delivery-areas-service.ts`'s existing pattern.
 *
 * `vendorId` is taken as a plain argument rather than resolved from `getCurrentVendorId()` — it
 * arrives from `SlotPicker`'s already-server-resolved `vendor.id` prop via the server action below,
 * unchanged from how this worked before the split. Not a new trust boundary introduced here.
 */
export async function getAvailableSlotsForVendor(
  vendorId: string,
  method: FulfilmentMethod,
  dateStr: string,
): Promise<AvailableSlot[]> {
  return getAvailableSlotsForDate(getPrisma(), vendorId, method, dateStr);
}
