import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { checkDestructiveTarget } from "@/lib/db-target-guard";
import { cancelConfirmedOrder } from "@/lib/repositories/orders";
import { claimCode, recordCodeRedemption } from "@/lib/repositories/discounts";
import { getAvailableSlotsForDate } from "@/lib/repositories/fulfilment-slots";

/**
 * Live verification for #696 — requirements.md R9, R10, R11, R11a, R12, R19.
 *
 * WHY A SCRIPT AND NOT A TEST. Every requirement here is a claim about what a
 * real Postgres transaction did: stock actually moved, the Payment row actually
 * did not, a second call actually changed nothing, the fulfilment slot actually
 * came back. A fake client can only prove that the code calls the methods its
 * author expected it to call. `tests/orders.test.ts` covers that half; this
 * covers the half a double can't. Precedent: #786's `verify-ledger.mjs`,
 * ratified at /validate.
 *
 * This is possible at all because the repository layer takes its client and
 * vendorId as explicit arguments and reads no request context — the same
 * property that makes it unit-testable makes it drivable from Node.
 *
 * GUARDED. It writes, so it refuses to run against staging or production by
 * comparing Neon ENDPOINTS, not file names (lib/db-target-guard.ts). It cleans
 * up every row it creates, including on failure.
 *
 *   npx tsx specs/2026-09-17-p696-staff-cancel-confirmed-order/verify-cancel.ts
 *   npx tsx specs/2026-09-17-p696-staff-cancel-confirmed-order/verify-cancel.ts --twice
 *   npx tsx specs/2026-09-17-p696-staff-cancel-confirmed-order/verify-cancel.ts --reclaim
 */

/** Read a connection string out of a gitignored secrets file without importing it. */
function readVar(path: string, key: string): string | undefined {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return undefined; // absent in CI; the guard treats that as "no constraint from this file"
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"#]*)"?/);
    if (match && match[1] === key) return match[2].trim();
  }
  return undefined;
}

const TAG = "P696VERIFY";
let failures = 0;

function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}: ${detail}`);
  if (!ok) failures += 1;
}

async function main() {
  const mode = process.argv.includes("--twice")
    ? "twice"
    : process.argv.includes("--reclaim")
      ? "reclaim"
      : "once";

  const targetUrl = process.env.DIRECT_URL;
  const verdict = checkDestructiveTarget(targetUrl, [
    { label: "the STAGING database", url: readVar("secrets/staging.vars", "DIRECT_URL") },
    {
      label: "the STAGING database (pooled)",
      url: readVar("secrets/staging.vars", "DATABASE_URL"),
    },
    { label: "the PRODUCTION database", url: readVar("secrets/production.vars", "DIRECT_URL") },
    {
      label: "the PRODUCTION database (pooled)",
      url: readVar("secrets/production.vars", "DATABASE_URL"),
    },
  ]);
  if (!verdict.allowed) {
    console.error(`REFUSED: ${verdict.reason}`);
    process.exit(1);
  }
  console.log(`target endpoint: ${verdict.endpoint}\nmode: ${mode}\n`);

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  let orderId: string | null = null;
  let codeId: string | null = null;
  let userId: string | null = null;
  let addressId: string | null = null;

  try {
    const vendor = await prisma.vendor.findFirst({ select: { id: true, slug: true } });
    if (!vendor) throw new Error("no vendor in this database — run the seed first");

    const products = await prisma.product.findMany({
      where: { vendorId: vendor.id, inventory: { isNot: null } },
      select: { id: true, name: true, inventory: { select: { quantity: true } } },
      take: 2,
    });
    if (products.length < 2) throw new Error("need 2 products with inventory rows");

    const slot = await prisma.vendorFulfilmentSlot.findFirst({
      where: { vendorId: vendor.id, method: "DELIVERY" },
      select: { id: true, dayOfWeek: true, capacity: true },
    });

    // --- fixture -----------------------------------------------------------
    const user = await prisma.user.create({
      data: {
        id: `${TAG}-u-${Date.now()}`,
        name: `${TAG} shopper`,
        email: `${TAG.toLowerCase()}-${Date.now()}@example.invalid`,
        emailVerified: true,
      },
      select: { id: true },
    });
    userId = user.id;

    await prisma.loyaltyAccount.create({
      data: { vendorId: vendor.id, userId: user.id, balancePoints: 500, lifetimePoints: 500 },
    });

    const code = await prisma.discountCode.create({
      data: {
        vendorId: vendor.id,
        code: `${TAG}${Date.now() % 100000}`,
        kind: "FIXED_AMOUNT",
        value: 500,
        remainingRedemptions: 5,
        maxPerCustomer: 1,
        isActive: true,
      },
      select: { id: true, code: true, remainingRedemptions: true },
    });
    codeId = code.id;

    // A date matching the slot's dayOfWeek, so R11a measures a real slot.
    const fulfilmentDate = (() => {
      if (!slot) return null;
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      while (d.getDay() !== slot.dayOfWeek) d.setDate(d.getDate() + 1);
      return d;
    })();

    // Address is a required relation on Order, and is a per-order SNAPSHOT.
    const address = await prisma.address.create({
      data: {
        vendorId: vendor.id,
        userId: user.id,
        recipientName: `${TAG} shopper`,
        phone: "00000000000",
        line1: "1 Verification Way",
        city: "Milton Keynes",
        postcode: "MK10 0AA",
      },
      select: { id: true },
    });
    addressId = address.id;

    // All-`connect` form: mixing scalar foreign keys with nested creates (items,
    // payment) is the "unchecked vs checked" split Prisma rejects outright.
    const order = await prisma.order.create({
      data: {
        vendor: { connect: { id: vendor.id } },
        orderNumber: `${TAG}-${Date.now()}`,
        user: { connect: { id: user.id } },
        address: { connect: { id: address.id } },
        status: "CONFIRMED",
        fulfilmentMethod: "DELIVERY",
        subtotalPence: 5000,
        discountPence: 800,
        deliveryFeePence: 0,
        totalPence: 4200,
        currency: "GBP",
        isExpress: false,
        ...(slot && fulfilmentDate
          ? { fulfilmentSlot: { connect: { id: slot.id } }, fulfilmentDate }
          : {}),
        items: {
          create: [
            {
              vendor: { connect: { id: vendor.id } },
              product: { connect: { id: products[0].id } },
              productName: products[0].name,
              quantity: 3,
              unitPricePence: 1000,
              lineTotalPence: 3000,
            },
            {
              vendor: { connect: { id: vendor.id } },
              product: { connect: { id: products[1].id } },
              productName: products[1].name,
              quantity: 1,
              unitPricePence: 2000,
              lineTotalPence: 2000,
            },
          ],
        },
        payment: {
          create: {
            vendor: { connect: { id: vendor.id } },
            provider: "stub",
            status: "SUCCEEDED",
            amountPence: 4200,
            providerReference: `${TAG}-pi`,
          },
        },
      },
      select: { id: true, orderNumber: true },
    });
    orderId = order.id;

    // Both ledger sides, which is the case that needs EARN_REVERSAL to exist.
    await prisma.loyaltyLedgerEntry.createMany({
      data: [
        {
          vendorId: vendor.id,
          userId: user.id,
          orderId: order.id,
          kind: "EARN",
          points: 42,
          tierKey: "bronze",
          multiplierBps: 10000,
        },
        {
          vendorId: vendor.id,
          userId: user.id,
          orderId: order.id,
          kind: "REDEEM",
          points: -300,
        },
      ],
    });

    await recordCodeRedemption(prisma, vendor.id, {
      codeId: code.id,
      orderId: order.id,
      userId: user.id,
      seq: 0,
      amountPence: 500,
    });
    await prisma.discountCode.update({
      where: { id: code.id },
      data: { remainingRedemptions: { decrement: 1 } },
    });

    const stockBefore = await prisma.inventory.findMany({
      where: { vendorId: vendor.id, productId: { in: products.map((p) => p.id) } },
      select: { productId: true, quantity: true },
      orderBy: { productId: "asc" },
    });
    const slotBefore =
      slot && fulfilmentDate
        ? (
            await getAvailableSlotsForDate(
              prisma,
              vendor.id,
              "DELIVERY",
              fulfilmentDate.toISOString().slice(0, 10),
            )
          ).find((s) => s.id === slot.id)?.available
        : null;
    const accountBefore = await prisma.loyaltyAccount.findUnique({
      where: { vendorId_userId: { vendorId: vendor.id, userId: user.id } },
      select: { balancePoints: true, lifetimePoints: true },
    });

    console.log(`fixture order ${order.orderNumber} (CONFIRMED, EARN 42, REDEEM -300, code use)\n`);

    // --- the act -----------------------------------------------------------
    const first = await cancelConfirmedOrder(
      prisma,
      vendor.id,
      order.id,
      "verify-cancel.ts fixture",
      null,
    );
    check("R9 first call cancels", first === true, `returned ${first}`);

    const after = async () => ({
      order: await prisma.order.findUnique({
        where: { id: order.id },
        select: { status: true },
      }),
      payment: await prisma.payment.findFirst({
        where: { orderId: order.id },
        select: { status: true },
      }),
      stock: await prisma.inventory.findMany({
        where: { vendorId: vendor.id, productId: { in: products.map((p) => p.id) } },
        select: { productId: true, quantity: true },
        orderBy: { productId: "asc" },
      }),
      ledger: await prisma.loyaltyLedgerEntry.findMany({
        where: { orderId: order.id },
        select: { kind: true, points: true },
        orderBy: { kind: "asc" },
      }),
      redemption: await prisma.discountRedemption.findFirst({
        where: { orderId: order.id },
        select: { seq: true, reversedAt: true },
      }),
      events: await prisma.orderStatusEvent.findMany({
        where: { orderId: order.id, status: "CANCELLED" },
        select: { note: true, createdByUserId: true },
      }),
      account: await prisma.loyaltyAccount.findUnique({
        where: { vendorId_userId: { vendorId: vendor.id, userId: user.id } },
        select: { balancePoints: true, lifetimePoints: true },
      }),
      code: await prisma.discountCode.findUnique({
        where: { id: code.id },
        select: { remainingRedemptions: true },
      }),
    });

    const s1 = await after();

    check("R9 order is CANCELLED", s1.order?.status === "CANCELLED", `${s1.order?.status}`);

    // R10 — stock
    // Expected delta PER PRODUCT, matched by id rather than by position — the
    // two reads are both ordered by productId, but asserting on a sorted pair
    // would pass if the quantities were swapped between the two products.
    const expected = new Map([
      [products[0].id, 3],
      [products[1].id, 1],
    ]);
    const beforeById = new Map(stockBefore.map((r) => [r.productId, r.quantity]));
    const deltas = s1.stock.map((row) => ({
      productId: row.productId,
      delta: row.quantity - (beforeById.get(row.productId) ?? 0),
    }));
    check(
      "R10 stock restored",
      deltas.length === 2 && deltas.every((d) => d.delta === expected.get(d.productId)),
      `stock restored: ${deltas.map((d) => `${d.productId} +${d.delta}`).join(", ")}`,
    );

    // R11 — payment untouched
    check(
      "R11 payment untouched",
      s1.payment?.status === "SUCCEEDED",
      `payment: ${s1.payment?.status} (unchanged)`,
    );

    // R11a — slot freed
    if (slot && fulfilmentDate) {
      const slotAfter = (
        await getAvailableSlotsForDate(
          prisma,
          vendor.id,
          "DELIVERY",
          fulfilmentDate.toISOString().slice(0, 10),
        )
      ).find((s) => s.id === slot.id)?.available;
      check(
        "R11a slot capacity freed",
        typeof slotBefore === "number" &&
          typeof slotAfter === "number" &&
          slotAfter === slotBefore + 1,
        `slot capacity: ${slotBefore} -> ${slotAfter} (freed)`,
      );
    } else {
      console.log("  SKIP  R11a: this vendor has no DELIVERY fulfilment slot configured");
    }

    // R12 — status event
    check(
      "R12 status event",
      s1.events.length === 1 && s1.events[0].note === "verify-cancel.ts fixture",
      `note=${JSON.stringify(s1.events[0]?.note)} createdByUserId=${s1.events[0]?.createdByUserId}`,
    );

    // Both reversals present
    const kinds = s1.ledger.map((l) => `${l.kind}:${l.points}`).join(" ");
    check(
      "both ledger reversals written",
      s1.ledger.some((l) => l.kind === "EARN_REVERSAL" && l.points === -42) &&
        s1.ledger.some((l) => l.kind === "REVERSAL" && l.points === 300),
      kinds,
    );
    check(
      "balance and lifetime both debited by the earn",
      s1.account!.balancePoints === accountBefore!.balancePoints + 300 - 42 &&
        s1.account!.lifetimePoints === accountBefore!.lifetimePoints - 42,
      `balance ${accountBefore!.balancePoints} -> ${s1.account!.balancePoints}, lifetime ${accountBefore!.lifetimePoints} -> ${s1.account!.lifetimePoints}`,
    );
    check(
      "code redemption RETAINED and stamped",
      s1.redemption !== null && s1.redemption.reversedAt !== null,
      `seq=${s1.redemption?.seq} reversedAt=${s1.redemption?.reversedAt?.toISOString()}`,
    );
    check(
      "code use given back",
      s1.code?.remainingRedemptions === code.remainingRedemptions,
      `remainingRedemptions back to ${s1.code?.remainingRedemptions}`,
    );

    // --- R9 idempotence ----------------------------------------------------
    if (mode === "twice") {
      const second = await cancelConfirmedOrder(
        prisma,
        vendor.id,
        order.id,
        "verify-cancel.ts SECOND call",
        null,
      );
      const s2 = await after();
      const same = JSON.stringify(s1) === JSON.stringify(s2);
      check("R9 second call is refused", second === false, `returned ${second}`);
      check(
        "R9 IDENTICAL state after second call",
        same,
        same ? "IDEMPOTENT: identical state after second call" : "STATE CHANGED",
      );
    }

    // --- R19 the reversed row does not block a re-claim ---------------------
    if (mode === "reclaim") {
      const claim = await claimCode(prisma, vendor.id, {
        code: code.code,
        userId: user.id,
        subtotalPence: 5000,
        deliveryFeePence: 0,
      });
      check(
        "R19 second claim accepted despite maxPerCustomer=1",
        claim.ok === true,
        claim.ok ? `second claim accepted, seq=${claim.claim.seq}` : `refused: ${claim.reason}`,
      );
      if (claim.ok) {
        check(
          "R19 new seq differs from the retained reversed row",
          claim.claim.seq !== s1.redemption?.seq,
          `second claim accepted, seq=${claim.claim.seq} (reversed row seq=${s1.redemption?.seq} retained)`,
        );
      }
    }
  } finally {
    // Clean up in FK order. Runs on failure too — a verification script that
    // leaves fixtures behind makes the next run's evidence untrustworthy.
    if (orderId) {
      await prisma.loyaltyLedgerEntry.deleteMany({ where: { orderId } });
      await prisma.discountRedemption.deleteMany({ where: { orderId } });
      await prisma.orderStatusEvent.deleteMany({ where: { orderId } });
      await prisma.payment.deleteMany({ where: { orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
    }
    if (userId) {
      await prisma.discountRedemption.deleteMany({ where: { userId } });
      await prisma.loyaltyLedgerEntry.deleteMany({ where: { userId } });
      await prisma.loyaltyAccount.deleteMany({ where: { userId } });
    }
    if (codeId) {
      await prisma.discountRedemption.deleteMany({ where: { codeId } });
      await prisma.discountCode.delete({ where: { id: codeId } }).catch(() => {});
    }
    if (addressId) await prisma.address.delete({ where: { id: addressId } }).catch(() => {});
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
