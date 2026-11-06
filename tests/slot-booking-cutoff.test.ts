import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib/repositories/orders.ts imports lib/db (→ @prisma/client/wasm, unresolvable under vitest) and
// lib/tenant; mock both so the module loads. Same posture as tests/orders.test.ts.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn() }));
vi.mock("@/lib/payments", () => ({
  CHECKOUT_SESSION_TTL_MS: 35 * 60 * 1000,
  getPaymentService: () => ({ createPayment: vi.fn() }),
}));

const { getAvailableSlotsForDate } = await import("@/lib/repositories/fulfilment-slots");
const { placeOrder } = await import("@/lib/repositories/orders");

/**
 * #1441 R6/R9 — the booking cut-off in the slot list and in placeOrder. Europe/London is GMT on
 * 2026-11-06, so local time equals UTC in every instant below.
 */
const VENDOR = "vendor-1";
const TODAY = "2026-11-06"; // a Friday
const NOW = new Date("2026-11-06T11:30:00Z");

const SLOTS = [
  { id: "s-09", startTime: "09:00", endTime: "11:00", capacity: 5 }, // started
  { id: "s-12", startTime: "12:00", endTime: "14:00", capacity: 5 }, // inside the 60-minute cut-off
  { id: "s-15", startTime: "15:00", endTime: "17:00", capacity: 5 }, // bookable
];

function listPrisma(cutoff: number, slots = SLOTS) {
  const groupBy = vi.fn(async () => [{ fulfilmentSlotId: "s-15", _count: { id: 2 } }]);
  const prisma = {
    vendor: {
      findUnique: async () => ({
        id: VENDOR,
        config: {
          timezone: "Europe/London",
          slotHoldDurationMinutes: 15,
          slotBookingCutoffMinutes: cutoff,
        },
        fulfilmentSlots: slots,
      }),
    },
    order: { groupBy },
  };
  return { prisma: prisma as never, groupBy };
}

describe("getAvailableSlotsForDate — booking cut-off (R5, R6)", () => {
  it("omits today's started slot and the one inside the cut-off, and keeps the later one", async () => {
    const { prisma, groupBy } = listPrisma(60);
    const slots = await getAvailableSlotsForDate(prisma, VENDOR, "DELIVERY", TODAY, NOW);
    expect(slots).toEqual([
      { id: "s-15", startTime: "15:00", endTime: "17:00", capacity: 5, available: 3 },
    ]);
    // Capacity is counted only for what can still be booked.
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ fulfilmentSlotId: { in: ["s-15"] } }),
      }),
    );
  });

  it("returns every slot on a later date", async () => {
    const { prisma } = listPrisma(60);
    const slots = await getAvailableSlotsForDate(prisma, VENDOR, "DELIVERY", "2026-11-13", NOW);
    expect(slots.map((s) => s.id)).toEqual(["s-09", "s-12", "s-15"]);
  });

  it("offers a slot one minute away when the cut-off is 0", async () => {
    const { prisma } = listPrisma(0, [
      { id: "s-1131", startTime: "11:31", endTime: "12:30", capacity: 5 },
    ]);
    const slots = await getAvailableSlotsForDate(prisma, VENDOR, "DELIVERY", TODAY, NOW);
    expect(slots.map((s) => s.id)).toEqual(["s-1131"]);
  });

  it("skips the capacity query when nothing is bookable", async () => {
    const { prisma, groupBy } = listPrisma(60, SLOTS.slice(0, 2));
    await expect(getAvailableSlotsForDate(prisma, VENDOR, "DELIVERY", TODAY, NOW)).resolves.toEqual(
      [],
    );
    expect(groupBy).not.toHaveBeenCalled();
  });
});

describe("placeOrder — booking cut-off (R8, R9)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function orderPrisma(slot: (typeof SLOTS)[number], used = 0) {
    const count = vi.fn(async () => used);
    const create = vi.fn();
    const tx = {
      vendorFulfilmentSlot: { findUnique: async () => ({ ...slot, method: "DELIVERY" }) },
      vendorConfig: {
        findUnique: async () => ({
          timezone: "Europe/London",
          slotHoldDurationMinutes: 15,
          slotBookingCutoffMinutes: 60,
        }),
      },
      order: { count, create },
    };
    const prisma = { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) };
    return { prisma: prisma as never, count, create };
  }

  const input = (slotId: string) =>
    ({
      cartId: "cart-1",
      userId: null,
      guestEmail: "shopper@example.com",
      fulfilmentSlotId: slotId,
      fulfilmentDate: new Date(`${TODAY}T00:00:00.000Z`),
    }) as never;

  it.each([
    ["has started", SLOTS[0]],
    ["starts within the cut-off", SLOTS[1]],
  ])("refuses a slot that %s, before counting or creating anything", async (_label, slot) => {
    const { prisma, count, create } = orderPrisma(slot);
    await expect(placeOrder(prisma, VENDOR, input(slot.id))).rejects.toMatchObject({
      code: "SLOT_CLOSED",
      message: "That time slot can no longer be booked. Please choose another.",
    });
    expect(count).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("lets a bookable slot through to the existing capacity check", async () => {
    const { prisma, count } = orderPrisma(SLOTS[2], 5);
    await expect(placeOrder(prisma, VENDOR, input(SLOTS[2].id))).rejects.toMatchObject({
      code: "SLOT_FULL",
    });
    expect(count).toHaveBeenCalledTimes(1);
  });
});
