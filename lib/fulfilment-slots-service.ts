import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  createExpressWindowForVendor,
  createFulfilmentSlotForVendor,
  getAvailableSlotsForDate,
  getFulfilmentSettingsForVendor,
  listExpressWindowsForVendor,
  listFulfilmentSlotsForVendor,
  removeExpressWindowForVendor,
  removeFulfilmentSlotForVendor,
  updateFulfilmentSettingsForVendor,
  type AvailableSlot,
  type FulfilmentAdminRepository,
  type FulfilmentMethod,
} from "@/lib/repositories/fulfilment-slots";
import type { ExpressWindowInput, FulfilmentSettingsInput, SlotInput } from "@/lib/fulfilment-form";

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
  /** #811 — a `YYYY-MM-DD` calendar day, never an instant. See the repository for why. */
  day: string,
): Promise<AvailableSlot[]> {
  return getAvailableSlotsForDate(getPrisma(), vendorId, method, day);
}

/* -------------------------------------------------------------------------------------------- *
 * Administration facade (P10, #750)
 * -------------------------------------------------------------------------------------------- */

/**
 * Request-scoped repository for `/staff/fulfilment`, matching `getDeliveryAreaRepository()`'s shape.
 *
 * Lives here rather than in `lib/repositories/fulfilment-slots.ts` because it resolves the current
 * vendor from the request host: that file's defining property is that every export takes `prisma`
 * and `vendorId` explicitly and reads no request context, and a context-resolving factory inside it
 * would make the property true of some exports and not others — `tests/repository-purity.test.ts`
 * would fail on the `@/lib/tenant` import below.
 *
 * The client is constructed fresh per call and never cached across requests: a cached client throws
 * "Cannot perform I/O on behalf of a different request" on Workers, and caching this factory would
 * pin the first request's client inside it just the same. `getPrismaWs()` is deliberately not used —
 * see the repository's own header for why nothing in this area needs it.
 *
 * The vendor id is resolved lazily and memoised for the lifetime of ONE factory call, so a page
 * rendering three lists issues one host lookup rather than three.
 */
export function getFulfilmentAdminRepository(): FulfilmentAdminRepository {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async settings() {
      return getFulfilmentSettingsForVendor(prisma, await vendorId());
    },
    async saveSettings(input: FulfilmentSettingsInput) {
      return updateFulfilmentSettingsForVendor(prisma, await vendorId(), input);
    },
    async listSlots() {
      return listFulfilmentSlotsForVendor(prisma, await vendorId());
    },
    async createSlot(input: SlotInput) {
      return createFulfilmentSlotForVendor(prisma, await vendorId(), input);
    },
    async removeSlot(id: string) {
      return removeFulfilmentSlotForVendor(prisma, await vendorId(), id);
    },
    async listExpressWindows() {
      return listExpressWindowsForVendor(prisma, await vendorId());
    },
    async createExpressWindow(input: ExpressWindowInput) {
      return createExpressWindowForVendor(prisma, await vendorId(), input);
    },
    async removeExpressWindow(id: string) {
      return removeExpressWindowForVendor(prisma, await vendorId(), id);
    },
  };
}
