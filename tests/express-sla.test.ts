/**
 * R5 — Express targetFulfilmentTime stamped on payment confirmation (P4/#402).
 *
 * Validates that when an Express Collection order's payment is confirmed, the
 * `targetFulfilmentTime` is set to approximately now + 60 minutes.
 *
 * Requires a live Postgres connection (Neon) — set via DATABASE_URL in .env.
 */
import { expect, test } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { confirmPayment } from "../lib/repositories/orders";
import { randomUUID } from "node:crypto";

// neonConfig.webSocketConstructor is set in tests/setup.ts (vitest setupFiles).
// Constructed from a plain connection-string config, matching lib/db.ts's
// getPrismaWs() — passing a live `Pool` instance instead resolves with none of
// the pool's config at $transaction time (adapter-neon opens its own internal
// connection for startTransaction) and fails with a "no database host" error
// that looks like a missing env var but isn't one.
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Requires a live Postgres connection (Neon) — CI's quality/quality job carries no
// DATABASE_URL, so this skips there rather than crashing the whole run (same lesson
// as tests/slot-capacity.test.ts and tests/concurrency-slot-booking.test.ts).
test.skipIf(!process.env.DATABASE_URL)(
  "R5: Express targetFulfilmentTime is populated on payment confirmation",
  async () => {
    const vendorId = randomUUID();
    const vendorSlug = "express-test-" + vendorId.substring(0, 8);

    await prisma.vendor.create({
      data: {
        id: vendorId,
        slug: vendorSlug,
        name: "Express Test Vendor",
        deliveryAreas: { create: { prefix: "AB" } },
        branding: {
          create: {
            name: "Express Test Vendor",
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
            expressCollectionEnabled: true,
          },
        },
      },
    });

    // Create a minimal address (required FK on Order)
    const addressId = randomUUID();
    await prisma.address.create({
      data: {
        id: addressId,
        vendorId,
        recipientName: "Test",
        phone: "01234567890",
        line1: "1 Test St",
        city: "Test City",
        postcode: "AB1 2CD",
      },
    });

    const orderNumber = "EXP-" + vendorId.substring(0, 8);
    const providerRef = "sess_" + randomUUID();

    await prisma.order.create({
      data: {
        vendorId,
        orderNumber,
        isExpress: true,
        status: "PENDING_PAYMENT",
        fulfilmentMethod: "COLLECTION",
        subtotalPence: 1000,
        discountPence: 0,
        deliveryFeePence: 0,
        totalPence: 1000,
        guestEmail: "express@example.com",
        confirmationToken: randomUUID(),
        addressId,
        payment: {
          create: {
            vendorId,
            provider: "stripe",
            providerReference: providerRef,
            amountPence: 1000,
            status: "PENDING",
          },
        },
      },
    });

    const beforeConfirm = Date.now();

    const res = await confirmPayment(prisma as any, orderNumber, {
      provider: "stripe",
      providerReference: providerRef,
      amountPence: 1000,
      currency: "GBP",
    });

    expect(res.ok).toBe(true);

    const updated = await prisma.order.findUnique({
      where: { orderNumber },
      select: { status: true, targetFulfilmentTime: true },
    });

    expect(updated?.status).toBe("CONFIRMED");
    expect(updated?.targetFulfilmentTime).not.toBeNull();

    // targetFulfilmentTime should be approximately now + 60 min (within ±2 min tolerance)
    const target = updated!.targetFulfilmentTime!.getTime();
    const expectedMin = beforeConfirm + 58 * 60_000;
    const expectedMax = beforeConfirm + 62 * 60_000;
    expect(target).toBeGreaterThan(expectedMin);
    expect(target).toBeLessThan(expectedMax);
  },
  30_000,
);
