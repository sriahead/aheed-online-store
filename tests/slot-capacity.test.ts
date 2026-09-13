import "dotenv/config";
import { describe, expect, it, beforeEach } from "vitest";
import { PrismaClient, OrderStatus } from "@prisma/client";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import { getAvailableSlotsForDate } from "@/features/checkout/slots";
import { randomUUID } from "node:crypto";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaNeon(pool);
const prisma = new PrismaClient({ adapter });

describe("Slot Capacity Calculation", () => {
  
  beforeEach(async () => {
  });

  it("calculates available capacity by subtracting valid orders", async () => {
    // Setup vendor and slot
    const vendorId = randomUUID();
    await prisma.vendor.create({
      data: {
        id: vendorId,
        slug: "test-vendor",
        name: "Test Vendor",
        deliveryAreas: { create: { prefix: "AB" } },
        branding: { create: { name: "Test Vendor", brandGreenDark: "", brandGreen: "", brandOrange: "", brandRed: "", brandCream: "", brandGreenTint: "", brandOrangeTint: "", brandRedTint: "" } },
        config: {
          create: {
            localityName: "Test",
            senderName: "Test",
            senderEmail: "test@example.com",
            searchPlaceholder: "",
            offerDeliverySlots: true,
            slotHoldDurationMinutes: 15,
            bookingWindowDays: 14,
          }
        },
        fulfilmentSlots: {
          create: {
            id: "slot-1",
            method: "DELIVERY",
            dayOfWeek: 1, // Monday
            startTime: "10:00",
            endTime: "12:00",
            capacity: 5
          }
        }
      }
    });

    const mondayDate = new Date("2026-09-14T00:00:00.000Z"); // Monday
    const mondayStr = mondayDate.toISOString(); await prisma.address.create({ data: { id: 'test-address', vendorId, recipientName: 'x', phone: '1', line1: '1', city: 'c', postcode: 'p' } });

    // 1. Initial capacity is full (5)
    let slots = await getAvailableSlotsForDate(vendorId, "DELIVERY", mondayStr);
    expect(slots).toHaveLength(1);
    expect(slots[0].capacity).toBe(5);
    expect(slots[0].available).toBe(5);

    // 2. CONFIRMED order consumes capacity (1 used)
    await prisma.order.create({
      data: {
        vendorId,
        orderNumber: "ORD-1",
        status: "CONFIRMED",
        fulfilmentMethod: "DELIVERY",
        fulfilmentSlotId: "slot-1",
        fulfilmentDate: mondayDate,
        subtotalPence: 1000,
        discountPence: 0,
        deliveryFeePence: 0,
        totalPence: 1000,
        guestEmail: "test@example.com",
        confirmationToken: "token1",
        address: {
          create: { vendorId, recipientName: "x", phone: "1", line1: "1", city: "c", postcode: "p" }
        }
      }
    });

    slots = await getAvailableSlotsForDate(vendorId, "DELIVERY", mondayStr);
    expect(slots[0].available).toBe(4);

    // 3. CANCELLED order does NOT consume capacity (still 1 used)
    await prisma.order.create({
      data: {
        vendorId,
        orderNumber: "ORD-2",
        status: "CANCELLED",
        fulfilmentMethod: "DELIVERY",
        fulfilmentSlotId: "slot-1",
        fulfilmentDate: mondayDate,
        subtotalPence: 1000,
        discountPence: 0,
        deliveryFeePence: 0,
        totalPence: 1000,
        guestEmail: "test@example.com",
        confirmationToken: "token2",
        address: {
          create: { vendorId, recipientName: "x", phone: "1", line1: "1", city: "c", postcode: "p" }
        }
      }
    });

    slots = await getAvailableSlotsForDate(vendorId, "DELIVERY", mondayStr);
    expect(slots[0].available).toBe(4);

    // 4. Fresh PENDING_PAYMENT order DOES consume capacity (2 used)
    await prisma.order.create({
      data: {
        vendorId,
        orderNumber: "ORD-3",
        status: "PENDING_PAYMENT",
        createdAt: new Date(), // Just now
        fulfilmentMethod: "DELIVERY",
        fulfilmentSlotId: "slot-1",
        fulfilmentDate: mondayDate,
        subtotalPence: 1000,
        discountPence: 0,
        deliveryFeePence: 0,
        totalPence: 1000,
        guestEmail: "test@example.com",
        confirmationToken: "token3",
        address: {
          create: { vendorId, recipientName: "x", phone: "1", line1: "1", city: "c", postcode: "p" }
        }
      }
    });

    slots = await getAvailableSlotsForDate(vendorId, "DELIVERY", mondayStr);
    expect(slots[0].available).toBe(3);

    // 5. Stale PENDING_PAYMENT order (older than hold duration) does NOT consume capacity (still 2 used)
    await prisma.order.create({
      data: {
        vendorId,
        orderNumber: "ORD-4",
        status: "PENDING_PAYMENT",
        createdAt: new Date(Date.now() - 20 * 60000), // 20 mins ago (hold is 15 mins)
        fulfilmentMethod: "DELIVERY",
        fulfilmentSlotId: "slot-1",
        fulfilmentDate: mondayDate,
        subtotalPence: 1000,
        discountPence: 0,
        deliveryFeePence: 0,
        totalPence: 1000,
        guestEmail: "test@example.com",
        confirmationToken: "token" + Math.random(),
        addressId: "test-address"
      }
    });

    slots = await getAvailableSlotsForDate(vendorId, "DELIVERY", mondayStr);
    expect(slots[0].available).toBe(3);
  });
});
