import type { getPrisma } from "@/lib/db";
import type { FulfilmentMethod } from "@prisma/client";
import type { CatalogueWriteResult } from "@/lib/repositories/products";
import type { ExpressWindowInput, FulfilmentSettingsInput, SlotInput } from "@/lib/fulfilment-form";
import { STORE_TIMEZONE, calendarDayToUtcMidnight } from "@/lib/local-datetime";

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
  day: string,
): Promise<AvailableSlot[]> {
  /*
   * #811. `day` is a bare `YYYY-MM-DD` CALENDAR DAY, never an instant, and this is the whole fix.
   *
   * This used to be `new Date(dateStr).getDay()` against an ISO instant the browser had built from
   * its OWN local midnight. A Worker's `getDay()` is UTC, so during BST a customer picking
   * Saturday sent `2026-09-18T23:00:00Z` and got Friday's slots — every hour of every day from
   * late March to late October. Under `next dev` on a UK laptop both sides are BST and the errors
   * cancel, which is why the suite stayed green.
   *
   * A calendar day has exactly one weekday and needs no zone to find it, so the zone question is
   * gone from this path rather than answered. An unparsable day yields no slots rather than a
   * query on `NaN`, which Prisma would reject at the driver with a much less obvious message.
   */
  const date = calendarDayToUtcMidnight(day);
  if (date === null) return [];
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday

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

/* -------------------------------------------------------------------------------------------- *
 * Administration (P10, #750)
 *
 * `#401`/`#402` shipped the models, the checkout UI and the capacity logic above with NO writer
 * anywhere in the repository — not a staff page, not `prisma/seed.ts`. Live staging carried both
 * flags `false`, zero `VendorFulfilmentSlot` rows and zero `VendorExpressSchedule` rows, so neither
 * feature could ever render. These are the functions `/staff/fulfilment` writes through.
 *
 * Same contract as everything above: `prisma` and `vendorId` are explicit parameters and no request
 * context is read here, so a plain `tsx` script can exercise every one of them in real Node.
 *
 * WHY NO `getPrismaWs()` ANYWHERE IN THIS FILE. `updateMany`/`createMany` crash unconditionally
 * through the HTTP adapter (#382) and an interactive `$transaction` cannot run on it either — but
 * nothing here needs either. The settings write is a singular `update` (`VendorConfig.vendorId` is
 * `@unique`), the creates are singular `create`s, and the removals are `deleteMany`, which CLAUDE.md
 * records as working on both adapters. There is deliberately no last-row guard of the kind
 * `lib/repositories/delivery-areas.ts` needs: removing a vendor's final slot disables a feature
 * they opted into, it does not silently break checkout for every shopper the way an empty delivery
 * footprint does.
 * -------------------------------------------------------------------------------------------- */

const SLOT_NOT_FOUND: CatalogueWriteResult = {
  ok: false,
  error: "That slot no longer exists.",
  field: "slotId",
};

const WINDOW_NOT_FOUND: CatalogueWriteResult = {
  ok: false,
  error: "That express window no longer exists.",
  field: "windowId",
};

export interface FulfilmentSlotRow {
  id: string;
  method: FulfilmentMethod;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
}

export interface ExpressWindowRow {
  id: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
}

/**
 * What `/staff/fulfilment` can do, as one request-scoped surface.
 *
 * Declared here beside the pure functions it mirrors (matching `DeliveryAreaRepository`), and
 * implemented in `lib/fulfilment-slots-service.ts` where the vendor and client are resolved.
 */
export interface FulfilmentAdminRepository {
  settings(): Promise<FulfilmentSettings>;
  saveSettings(input: FulfilmentSettingsInput): Promise<CatalogueWriteResult>;
  listSlots(): Promise<FulfilmentSlotRow[]>;
  createSlot(input: SlotInput): Promise<CatalogueWriteResult>;
  removeSlot(id: string): Promise<CatalogueWriteResult>;
  listExpressWindows(): Promise<ExpressWindowRow[]>;
  createExpressWindow(input: ExpressWindowInput): Promise<CatalogueWriteResult>;
  removeExpressWindow(id: string): Promise<CatalogueWriteResult>;
}

export interface FulfilmentSettings {
  offerDeliverySlots: boolean;
  expressCollectionEnabled: boolean;
  bookingWindowDays: number;
  slotHoldDurationMinutes: number;
  /** #363 — the vendor's IANA zone. Editable here because it governs when the slots below fall. */
  timezone: string;
  /** Not editable here — it belongs to /staff/storefront's delivery rules — but the page needs it
   *  to decide whether collection-only controls can take effect at all (#750 R15a). */
  offerCollection: boolean;
}

/**
 * The four schedulable settings plus `offerCollection`, with the same defaults
 * `fetchVendorProfile` applies so a vendor with no `VendorConfig` row still renders a usable form.
 */
export async function getFulfilmentSettingsForVendor(
  prisma: Db,
  vendorId: string,
): Promise<FulfilmentSettings> {
  const config = await prisma.vendorConfig.findUnique({
    where: { vendorId },
    select: {
      offerDeliverySlots: true,
      expressCollectionEnabled: true,
      bookingWindowDays: true,
      slotHoldDurationMinutes: true,
      timezone: true,
      offerCollection: true,
    },
  });

  return {
    offerDeliverySlots: config?.offerDeliverySlots ?? false,
    expressCollectionEnabled: config?.expressCollectionEnabled ?? false,
    bookingWindowDays: config?.bookingWindowDays ?? 14,
    slotHoldDurationMinutes: config?.slotHoldDurationMinutes ?? 15,
    timezone: config?.timezone ?? STORE_TIMEZONE,
    offerCollection: config?.offerCollection ?? false,
  };
}

/**
 * Persist the four schedulable settings.
 *
 * Only those four columns are passed. Every other `VendorConfig` field — the delivery rules, the
 * storefront copy, the social links — is omitted entirely rather than sent as null, so this action
 * cannot rewrite settings that belong to another page. Same posture as `updateDeliveryRules`.
 */
export async function updateFulfilmentSettingsForVendor(
  prisma: Db,
  vendorId: string,
  input: FulfilmentSettingsInput,
): Promise<CatalogueWriteResult> {
  const updated = await prisma.vendorConfig.update({
    where: { vendorId },
    data: {
      offerDeliverySlots: input.offerDeliverySlots,
      expressCollectionEnabled: input.expressCollectionEnabled,
      bookingWindowDays: input.bookingWindowDays,
      slotHoldDurationMinutes: input.slotHoldDurationMinutes,
      timezone: input.timezone,
    },
    select: { id: true },
  });

  return { ok: true, id: updated.id };
}

/** Every weekly slot, ordered as the staff page lists them: day, then time of day. */
export async function listFulfilmentSlotsForVendor(
  prisma: Db,
  vendorId: string,
): Promise<FulfilmentSlotRow[]> {
  return prisma.vendorFulfilmentSlot.findMany({
    where: { vendorId },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      method: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      capacity: true,
    },
  });
}

/**
 * Add one weekly slot.
 *
 * The caller is responsible for having run `parseSlotInput` first — see `lib/fulfilment-form.ts`
 * for why an unvalidated time or capacity reaching these columns produces a slot that renders and
 * can never be booked, rather than a visible error.
 */
export async function createFulfilmentSlotForVendor(
  prisma: Db,
  vendorId: string,
  input: SlotInput,
): Promise<CatalogueWriteResult> {
  const created = await prisma.vendorFulfilmentSlot.create({
    data: {
      vendorId,
      method: input.method,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      capacity: input.capacity,
    },
    select: { id: true },
  });

  return { ok: true, id: created.id };
}

/**
 * Remove one weekly slot.
 *
 * Scoped by `vendorId` in the delete itself, so a valid id belonging to another vendor removes
 * nothing rather than succeeding — the guard lives in the query, not in which host served the page.
 */
export async function removeFulfilmentSlotForVendor(
  prisma: Db,
  vendorId: string,
  id: string,
): Promise<CatalogueWriteResult> {
  const deleted = await prisma.vendorFulfilmentSlot.deleteMany({ where: { id, vendorId } });
  if (deleted.count === 0) return SLOT_NOT_FOUND;
  return { ok: true, id };
}

/** Every express window, ordered by day then opening time. */
export async function listExpressWindowsForVendor(
  prisma: Db,
  vendorId: string,
): Promise<ExpressWindowRow[]> {
  return prisma.vendorExpressSchedule.findMany({
    where: { vendorId },
    orderBy: [{ dayOfWeek: "asc" }, { openTime: "asc" }],
    select: { id: true, dayOfWeek: true, openTime: true, closeTime: true },
  });
}

/** Add one express-collection window. Validated by `parseExpressWindowInput` before it gets here. */
export async function createExpressWindowForVendor(
  prisma: Db,
  vendorId: string,
  input: ExpressWindowInput,
): Promise<CatalogueWriteResult> {
  const created = await prisma.vendorExpressSchedule.create({
    data: {
      vendorId,
      dayOfWeek: input.dayOfWeek,
      openTime: input.openTime,
      closeTime: input.closeTime,
    },
    select: { id: true },
  });

  return { ok: true, id: created.id };
}

/** Remove one express window. Vendor-scoped in the delete, same as `removeFulfilmentSlotForVendor`. */
export async function removeExpressWindowForVendor(
  prisma: Db,
  vendorId: string,
  id: string,
): Promise<CatalogueWriteResult> {
  const deleted = await prisma.vendorExpressSchedule.deleteMany({ where: { id, vendorId } });
  if (deleted.count === 0) return WINDOW_NOT_FOUND;
  return { ok: true, id };
}
