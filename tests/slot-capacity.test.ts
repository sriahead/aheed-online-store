import "dotenv/config";
import { describe, expect, it, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { getAvailableSlotsForDate } from "@/features/checkout/slots";
import { randomUUID } from "node:crypto";

// neonConfig.webSocketConstructor is set in tests/setup.ts (vitest setupFiles).
// A plain connection-string config, matching lib/db.ts's getPrismaWs() — see
// tests/express-sla.test.ts for why a live `Pool` instance doesn't work here.
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

describe("Slot Capacity Calculation", () => {
  beforeEach(async () => {});

  // Requires a live Postgres connection (Neon) — CI's quality/quality job carries no
  // DATABASE_URL, so this skips there rather than crashing the whole run.
  it.skipIf(!process.env.DATABASE_URL)(
    "calculates available capacity by subtracting valid orders",
    async () => {
      // Setup vendor and slot. Every identifier below is suffixed with a slice of a fresh
      // randomUUID() — this test creates real rows against the shared dev Neon database and
      // never deletes them, so a hardcoded literal (previously: slug "test-vendor", slot id
      // "slot-1", address id "test-address", order numbers "ORD-1".."ORD-4", confirmation
      // tokens "token1".."token3") collides with the previous run's own leftover row on every
      // re-run, including in CI. This doesn't fix the missing cleanup, only the guaranteed
      // second-run collision.
      const vendorId = randomUUID();
      const suffix = vendorId.substring(0, 8);
      const slotId = "slot-" + suffix;
      const addressId = "addr-" + suffix;

      await prisma.vendor.create({
        data: {
          id: vendorId,
          slug: "test-vendor-" + suffix,
          name: "Test Vendor",
          deliveryAreas: { create: { prefix: "AB" } },
          branding: {
            create: {
              name: "Test Vendor",
              brandGreenDark: "",
              brandGreen: "",
              brandOrange: "",
              brandRed: "",
              brandCream: "",
              brandGreenTint: "",
              brandOrangeTint: "",
              brandRedTint: "",
            },
          },
          config: {
            create: {
              localityName: "Test",
              senderName: "Test",
              senderEmail: "test@example.com",
              searchPlaceholder: "",
              offerDeliverySlots: true,
              slotHoldDurationMinutes: 15,
              bookingWindowDays: 14,
            },
          },
          fulfilmentSlots: {
            create: {
              id: slotId,
              method: "DELIVERY",
              dayOfWeek: 1, // Monday
              startTime: "10:00",
              endTime: "12:00",
              capacity: 5,
            },
          },
        },
      });

      const mondayDate = new Date("2026-09-14T00:00:00.000Z"); // Monday
      const mondayStr = mondayDate.toISOString();
      await prisma.address.create({
        data: {
          id: addressId,
          vendorId,
          recipientName: "x",
          phone: "1",
          line1: "1",
          city: "c",
          postcode: "p",
        },
      });

      // 1. Initial capacity is full (5)
      let slots = await getAvailableSlotsForDate(vendorId, "DELIVERY", mondayStr);
      expect(slots).toHaveLength(1);
      expect(slots[0].capacity).toBe(5);
      expect(slots[0].available).toBe(5);

      // 2. CONFIRMED order consumes capacity (1 used)
      await prisma.order.create({
        data: {
          vendorId,
          orderNumber: "ORD-1-" + suffix,
          status: "CONFIRMED",
          fulfilmentMethod: "DELIVERY",
          fulfilmentSlotId: slotId,
          fulfilmentDate: mondayDate,
          subtotalPence: 1000,
          discountPence: 0,
          deliveryFeePence: 0,
          totalPence: 1000,
          guestEmail: "test@example.com",
          confirmationToken: "token1-" + suffix,
          addressId,
        },
      });

      slots = await getAvailableSlotsForDate(vendorId, "DELIVERY", mondayStr);
      expect(slots[0].available).toBe(4);

      // 3. CANCELLED order does NOT consume capacity (still 1 used)
      await prisma.order.create({
        data: {
          vendorId,
          orderNumber: "ORD-2-" + suffix,
          status: "CANCELLED",
          fulfilmentMethod: "DELIVERY",
          fulfilmentSlotId: slotId,
          fulfilmentDate: mondayDate,
          subtotalPence: 1000,
          discountPence: 0,
          deliveryFeePence: 0,
          totalPence: 1000,
          guestEmail: "test@example.com",
          confirmationToken: "token2-" + suffix,
          addressId,
        },
      });

      slots = await getAvailableSlotsForDate(vendorId, "DELIVERY", mondayStr);
      expect(slots[0].available).toBe(4);

      // 4. Fresh PENDING_PAYMENT order DOES consume capacity (2 used)
      await prisma.order.create({
        data: {
          vendorId,
          orderNumber: "ORD-3-" + suffix,
          status: "PENDING_PAYMENT",
          createdAt: new Date(), // Just now
          fulfilmentMethod: "DELIVERY",
          fulfilmentSlotId: slotId,
          fulfilmentDate: mondayDate,
          subtotalPence: 1000,
          discountPence: 0,
          deliveryFeePence: 0,
          totalPence: 1000,
          guestEmail: "test@example.com",
          confirmationToken: "token3-" + suffix,
          addressId,
        },
      });

      slots = await getAvailableSlotsForDate(vendorId, "DELIVERY", mondayStr);
      expect(slots[0].available).toBe(3);

      // 5. Stale PENDING_PAYMENT order (older than hold duration) does NOT consume capacity
      // (still 2 used)
      await prisma.order.create({
        data: {
          vendorId,
          orderNumber: "ORD-4-" + suffix,
          status: "PENDING_PAYMENT",
          createdAt: new Date(Date.now() - 20 * 60000), // 20 mins ago (hold is 15 mins)
          fulfilmentMethod: "DELIVERY",
          fulfilmentSlotId: slotId,
          fulfilmentDate: mondayDate,
          subtotalPence: 1000,
          discountPence: 0,
          deliveryFeePence: 0,
          totalPence: 1000,
          guestEmail: "test@example.com",
          confirmationToken: "token4-" + suffix + Math.random(),
          addressId,
        },
      });

      slots = await getAvailableSlotsForDate(vendorId, "DELIVERY", mondayStr);
      expect(slots[0].available).toBe(3);
    },
  );
});
