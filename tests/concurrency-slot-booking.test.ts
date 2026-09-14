import "dotenv/config";
import { describe, expect, it, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { placeOrder } from "@/lib/repositories/orders";
import { randomUUID } from "node:crypto";
import { CheckoutError } from "@/lib/repositories/orders";

// A plain connection-string config, matching lib/db.ts's getPrismaWs() — a live `Pool`
// instance is a valid overload by its type signature but fails at $transaction time
// with "No database host or connection string was set" (see CLAUDE.md, #382-adjacent).
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

describe("Concurrency Slot Booking (R8)", () => {
  beforeEach(async () => {});

  // Requires a live Postgres connection (Neon) — CI's quality/quality job carries no
  // DATABASE_URL, so this skips there rather than crashing the whole run.
  it.skipIf(!process.env.DATABASE_URL)(
    "prevents overbooking a slot with capacity=1 under concurrent load",
    async () => {
      const vendorId = randomUUID();
      // Suffixed with a slice of a fresh randomUUID() — this test creates real rows against
      // the shared dev Neon database and never deletes them, so a hardcoded slot id (was:
      // "test-slot-1") collides with the previous run's own leftover row on every re-run.
      const slotId = "cslot-" + vendorId.substring(0, 8);
      await prisma.vendor.create({
        data: {
          id: vendorId,
          slug: "concurrency-test-" + vendorId.substring(0, 8),
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
              endTime: "11:00",
              capacity: 1, // Crucial: capacity is exactly 1
            },
          },
        },
      });

      const fulfilmentDate = new Date("2026-09-14T00:00:00.000Z");

      const category = await prisma.category.create({
        data: { vendorId, slug: "test-cat", name: "Test Cat" },
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
          inventory: { create: { vendorId, quantity: 100 } },
        },
      });

      const users = Array.from({ length: 5 }, (_, i) => `user${i}@example.com`);

      // Carts are created one at a time (real network round-trips) BEFORE any placeOrder
      // call fires, and every placeOrder call is then fired in the same synchronous pass
      // immediately followed by Promise.allSettled. Interleaving cart creation with the
      // placeOrder calls (pushing each promise right after its own await, as this loop
      // used to) gives the earliest calls a head start — long enough on a real DB that one
      // can reject before the last cart even exists, i.e. before Promise.allSettled ever
      // attaches a handler to it. Node reports that gap as an unhandled rejection.
      const cartIds: string[] = [];
      for (let i = 0; i < users.length; i++) {
        const cartId = randomUUID();
        await prisma.cart.create({
          data: {
            id: cartId,
            vendorId,
            guestToken: randomUUID(),
            items: {
              create: { vendorId, productId, quantity: 1 },
            },
          },
        });
        cartIds.push(cartId);
      }

      const requests = users.map((email, i) =>
        placeOrder(prisma as any, vendorId, {
          cartId: cartIds[i],
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
            notes: null,
          },
          fulfilmentMethod: "DELIVERY",
          fulfilmentSlotId: slotId,
          fulfilmentDate,
          rules: { deliveryFeePence: 0, freeDeliveryThresholdPence: null, minimumOrderPence: 0 },
          returnOrigin: "http://localhost:3000",
        }),
      );

      // Execute all 5 requests concurrently
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
    },
    30_000, // 5 genuinely concurrent DB round-trips against a real Neon database
  );
});
