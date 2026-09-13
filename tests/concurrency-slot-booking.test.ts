import "dotenv/config";
import { describe, expect, it, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import { placeOrder } from "@/lib/repositories/orders";
import { randomUUID } from "node:crypto";
import { CheckoutError } from "@/lib/repositories/orders";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaNeon(pool);
const prisma = new PrismaClient({ adapter });

describe("Concurrency Slot Booking (R8)", () => {

  beforeEach(async () => {
  });

  it("prevents overbooking a slot with capacity=1 under concurrent load", async () => {
    const vendorId = randomUUID();
    await prisma.vendor.create({
      data: {
        id: vendorId,
        slug: "concurrency-test-" + vendorId.substring(0, 8),
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
            id: "test-slot-1",
            method: "DELIVERY",
            dayOfWeek: 1, // Monday
            startTime: "10:00",
            endTime: "11:00",
            capacity: 1 // Crucial: capacity is exactly 1
          }
        }
      }
    });

    const fulfilmentDate = new Date("2026-09-14T00:00:00.000Z");

    const category = await prisma.category.create({
      data: { vendorId, slug: "test-cat", name: "Test Cat" }
    });

    const productId = randomUUID();
    await prisma.product.create({
      data: {
        id: productId,
        vendorId,
        categoryId: category.id,
        slug: "test-prod",
        description: "Desc",
        unitLabel: "item",
        name: "Test Product",
        basePrice: 1000,
        isActive: true,
        inventory: { create: { vendorId, quantity: 100 } }
      }
    });

    const users = Array.from({ length: 5 }, (_, i) => `user${i}@example.com`);
    const requests = [];

    for (const email of users) {
      const cartId = randomUUID();
      await prisma.cart.create({
        data: {
          id: cartId,
          vendorId,
          guestToken: randomUUID(),
          items: {
            create: { vendorId, productId, quantity: 1 }
          }
        }
      });

      requests.push(
        placeOrder(prisma as any, vendorId, {
          cartId,
          userId: null,
          guestEmail: email,
          vendorSlug: "concurrency-test-" + vendorId.substring(0, 8),
          address: {
            recipientName: "Test",
            phone: "01234567890",
            line1: "123 Test St",
            line2: null,
            city: "Test City",
            county: null,
            postcode: "AB1 2CD",
            notes: null
          },
          fulfilmentMethod: "DELIVERY",
          fulfilmentSlotId: "test-slot-1",
          fulfilmentDate,
          rules: { deliveryFeePence: 0, freeDeliveryThresholdPence: null, minimumOrderPence: 0 },
          returnOrigin: "http://localhost:3000"
        })
      );
    }

    // 3. Execute all 5 requests concurrently!
    const results = await Promise.allSettled(requests);

    // 4. Assert Exactly 1 success
    const successes = results.filter((r) => r.status === "fulfilled");
    const rejections = results.filter((r) => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(4);

    // 5. Assert the rejections are SLOT_FULL or transaction conflict (Serializable failure)
    for (const rejection of rejections) {
      // It should either be a SLOT_FULL error OR a Prisma transaction conflict error (P2034)
      const err = (rejection as PromiseRejectedResult).reason;
      if (err instanceof CheckoutError) {
        expect(err.code).toBe("SLOT_FULL");
      } else {
        // Prisma transaction serialization failure
        expect(err.code).toBe("P2034");
      }
    }
  });
});
