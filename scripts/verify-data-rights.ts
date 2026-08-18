import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  REDACTED,
  countOtherVendorData,
  eraseVendorData,
  exportPersonalData,
} from "@/lib/repositories/data-rights";

/**
 * P7b (#216) validation harness — proves the properties requirements.md asserts
 * about export and erasure against REAL Postgres.
 *
 * Runs in Node (via tsx), NOT workerd — so it builds its own client from the
 * bare `@prisma/client`, like prisma/seed.ts and scripts/demo-accounts.ts, and
 * never `lib/db.ts`'s `@prisma/client/wasm` (which does not even resolve under
 * Node: `Cannot find module .../wasm.mjs`). That is exactly why
 * lib/repositories/data-rights.ts imports `@/lib/db` as `import type` only — a
 * runtime import there would make this file unable to load the module it is
 * meant to exercise.
 *
 * Every mode creates its own fixture, snapshots what it is about to touch, runs
 * the operation, and diffs the result. Nothing here is eyeballed.
 *
 *   npx tsx scripts/verify-data-rights.ts export-shape
 *   npx tsx scripts/verify-data-rights.ts export-isolation
 *   npx tsx scripts/verify-data-rights.ts count-other
 *   npx tsx scripts/verify-data-rights.ts erase
 *   npx tsx scripts/verify-data-rights.ts erase-last-vendor
 *   npx tsx scripts/verify-data-rights.ts all
 *
 * READ THE DATABASE IT IS POINTED AT BEFORE RUNNING. It writes fixtures and
 * then erases them; `.env`'s DIRECT_URL decides where. Staging only.
 */

const FIXTURE_TAG = "p7b-fixture";

function db(): PrismaClient {
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("DIRECT_URL is not set — check .env against secrets/staging.vars");
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
}

let failures = 0;

function check(label: string, passed: boolean, detail?: string): void {
  if (passed) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Every property name in an object graph, for the credential-leak assertion. */
function propertyNames(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) propertyNames(item, into);
  } else if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, nested] of Object.entries(value)) {
      into.add(key);
      propertyNames(nested, into);
    }
  }
  return into;
}

interface Fixture {
  userId: string;
  vendorA: string;
  vendorB: string | null;
}

/**
 * Two active vendors, so the cross-vendor rows R6/R16 depend on are real rather
 * than simulated. Staging has Aheed and SriMart.
 */
async function vendors(prisma: PrismaClient, needTwo: boolean) {
  const rows = await prisma.vendor.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true },
    take: 2,
  });
  if (needTwo && rows.length < 2) {
    throw new Error(`need two active vendors for this mode, found ${rows.length}`);
  }
  if (rows.length === 0) throw new Error("no active vendors");
  return { a: rows[0].id, b: rows[1]?.id ?? null };
}

/** A product to hang orders, reviews and carts off, at the given vendor. */
async function anyProduct(prisma: PrismaClient, vendorId: string) {
  const product = await prisma.product.findFirst({
    where: { vendorId },
    select: { id: true, name: true, basePrice: true },
  });
  if (!product) throw new Error(`no product at vendor ${vendorId} to build a fixture from`);
  return product;
}

/** Build one user with a full spread of personal data at each given vendor. */
async function buildFixture(prisma: PrismaClient, vendorIds: string[]): Promise<Fixture> {
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: {
      id: `${FIXTURE_TAG}-${stamp}`,
      name: "Fixture Person",
      email: `${FIXTURE_TAG}-${stamp}@example.invalid`,
      emailVerified: true,
    },
  });

  for (const vendorId of vendorIds) {
    const product = await anyProduct(prisma, vendorId);

    const address = await prisma.address.create({
      data: {
        vendorId,
        userId: user.id,
        recipientName: "Fixture Person",
        phone: "07700 900000",
        line1: "1 Fixture Street",
        line2: "Flat 2",
        city: "Milton Keynes",
        postcode: "MK1 1AA",
        notes: "Leave with neighbour",
      },
    });

    const order = await prisma.order.create({
      data: {
        vendorId,
        orderNumber: `P7B-${stamp}-${vendorId.slice(0, 4)}`,
        userId: user.id,
        addressId: address.id,
        status: "DELIVERED",
        subtotalPence: 1000,
        discountPence: 100,
        deliveryFeePence: 200,
        totalPence: 1100,
        items: {
          create: [
            {
              vendorId,
              productId: product.id,
              productName: product.name,
              quantity: 2,
              unitPricePence: 500,
              lineTotalPence: 1000,
            },
          ],
        },
        statusEvents: { create: [{ vendorId, status: "DELIVERED", createdByUserId: user.id }] },
      },
    });

    await prisma.review.create({
      data: { vendorId, productId: product.id, userId: user.id, rating: 5, comment: "Fixture" },
    });
    await prisma.cart.create({
      data: {
        vendorId,
        userId: user.id,
        items: { create: [{ vendorId, productId: product.id, quantity: 1 }] },
      },
    });
    await prisma.loyaltyAccount.create({
      data: { vendorId, userId: user.id, balancePoints: 50, lifetimePoints: 50 },
    });
    await prisma.loyaltyLedgerEntry.create({
      data: {
        vendorId,
        userId: user.id,
        orderId: order.id,
        kind: "EARN",
        points: 50,
        tierKey: "bronze",
        multiplierBps: 10000,
      },
    });

    const code = await prisma.discountCode.create({
      data: {
        vendorId,
        code: `P7B-${stamp}-${vendorId.slice(0, 4)}`,
        kind: "FIXED_AMOUNT",
        value: 100,
      },
    });
    await prisma.discountRedemption.create({
      data: {
        vendorId,
        codeId: code.id,
        orderId: order.id,
        userId: user.id,
        seq: 0,
        amountPence: 100,
      },
    });
  }

  return { userId: user.id, vendorA: vendorIds[0], vendorB: vendorIds[1] ?? null };
}

/** Remove a fixture and everything hanging off it, erased or not. */
async function cleanup(prisma: PrismaClient, fixture: Fixture): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { orderNumber: { startsWith: "P7B-" } },
    select: { id: true, addressId: true },
  });
  const orderIds = orders.map((o) => o.id);
  const addressIds = orders.map((o) => o.addressId);

  await prisma.loyaltyLedgerEntry.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.discountRedemption.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.discountCode.deleteMany({ where: { code: { startsWith: "P7B-" } } });
  await prisma.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.address.deleteMany({ where: { id: { in: addressIds } } });
  await prisma.loyaltyAccount.deleteMany({ where: { userId: fixture.userId } });
  await prisma.review.deleteMany({ where: { userId: fixture.userId } });
  await prisma.cart.deleteMany({ where: { userId: fixture.userId } });
  await prisma.user.deleteMany({ where: { id: fixture.userId } });
}

// ---------------------------------------------------------------------------

async function modeExportShape(prisma: PrismaClient): Promise<void> {
  const { a } = await vendors(prisma, false);
  const fixture = await buildFixture(prisma, [a]);
  try {
    const result = await exportPersonalData(prisma, a, fixture.userId);

    const expected = [
      "addresses",
      "carts",
      "discountRedemptions",
      "exportedAt",
      "identity",
      "linkedAccounts",
      "loyalty",
      "orders",
      "reviews",
      "sessions",
      "vendor",
    ];
    const actual = Object.keys(result).sort();
    check(
      "R4 top-level keys match exactly",
      JSON.stringify(actual) === JSON.stringify(expected),
      `got ${actual.join(",")}`,
    );

    const names = propertyNames(result);
    const forbidden = ["password", "accessToken", "refreshToken", "idToken", "token"].filter((n) =>
      names.has(n),
    );
    check(
      "R5 no credential property names in the export",
      forbidden.length === 0,
      forbidden.join(","),
    );

    check("R4 orders present", result.orders.length === 1, `${result.orders.length}`);
    check("R4 loyalty ledger present", result.loyalty.ledger.length === 1);
  } finally {
    await cleanup(prisma, fixture);
  }
}

async function modeExportIsolation(prisma: PrismaClient): Promise<void> {
  const { a, b } = await vendors(prisma, true);
  const fixture = await buildFixture(prisma, [a, b!]);
  try {
    const result = await exportPersonalData(prisma, a, fixture.userId);
    const serialised = JSON.stringify(result);

    check("R6 export carries no other vendor's id", !serialised.includes(b!));
    check("R6 exactly one order (vendor A only)", result.orders.length === 1);
    check("R6 exactly one address", result.addresses.length === 1);
    check("R6 exactly one review", result.reviews.length === 1);
    check("R6 exactly one cart", result.carts.length === 1);
    check("R6 exactly one ledger entry", result.loyalty.ledger.length === 1);
    check("R6 vendor block names vendor A", result.vendor.id === a);
  } finally {
    await cleanup(prisma, fixture);
  }
}

async function modeCountOther(prisma: PrismaClient): Promise<void> {
  const { a, b } = await vendors(prisma, true);

  const two = await buildFixture(prisma, [a, b!]);
  try {
    const count = await countOtherVendorData(prisma, two.userId, a);
    check("R2b two-vendor user has data elsewhere", count > 0, `count=${count}`);
    check("R2b returns a number", typeof count === "number");
  } finally {
    await cleanup(prisma, two);
  }

  const one = await buildFixture(prisma, [a]);
  try {
    const count = await countOtherVendorData(prisma, one.userId, a);
    check("R2b single-vendor user has none elsewhere", count === 0, `count=${count}`);
  } finally {
    await cleanup(prisma, one);
  }
}

async function modeErase(prisma: PrismaClient): Promise<void> {
  const { a, b } = await vendors(prisma, true);
  const fixture = await buildFixture(prisma, [a, b!]);
  try {
    const before = {
      ordersA: await prisma.order.findMany({
        where: { vendorId: a, userId: fixture.userId },
        select: {
          id: true,
          orderNumber: true,
          subtotalPence: true,
          discountPence: true,
          deliveryFeePence: true,
          totalPence: true,
          status: true,
          createdAt: true,
          addressId: true,
          items: { select: { productName: true, quantity: true, unitPricePence: true } },
        },
      }),
      ledgerA: await prisma.loyaltyLedgerEntry.findMany({
        where: { vendorId: a, userId: fixture.userId },
        select: {
          id: true,
          orderId: true,
          kind: true,
          points: true,
          tierKey: true,
          multiplierBps: true,
        },
      }),
      redemptionsA: await prisma.discountRedemption.findMany({
        where: { vendorId: a, userId: fixture.userId },
        select: { id: true },
      }),
      addressB: await prisma.address.findFirst({
        where: { vendorId: b!, userId: fixture.userId },
        select: { id: true, recipientName: true, phone: true, line1: true, postcode: true },
      }),
      orderB: await prisma.order.findFirst({
        where: { vendorId: b!, userId: fixture.userId },
        select: { id: true, userId: true, totalPence: true },
      }),
    };

    const result = await eraseVendorData(prisma, a, fixture.userId);

    // R10
    const ordersAfter = await prisma.order.findMany({
      where: { id: { in: before.ordersA.map((o) => o.id) } },
      select: {
        id: true,
        userId: true,
        guestEmail: true,
        orderNumber: true,
        subtotalPence: true,
        discountPence: true,
        deliveryFeePence: true,
        totalPence: true,
        status: true,
        createdAt: true,
        items: { select: { productName: true, quantity: true, unitPricePence: true } },
      },
    });
    check("R10 orders retained", ordersAfter.length === before.ordersA.length);
    check(
      "R10 order buyer link severed",
      ordersAfter.every((o) => o.userId === null && o.guestEmail === null),
    );
    check(
      "R10 order money and items unchanged",
      ordersAfter.every((after) => {
        const prior = before.ordersA.find((o) => o.id === after.id)!;
        return (
          after.orderNumber === prior.orderNumber &&
          after.subtotalPence === prior.subtotalPence &&
          after.discountPence === prior.discountPence &&
          after.deliveryFeePence === prior.deliveryFeePence &&
          after.totalPence === prior.totalPence &&
          after.status === prior.status &&
          after.createdAt.getTime() === prior.createdAt.getTime() &&
          JSON.stringify(after.items) === JSON.stringify(prior.items)
        );
      }),
    );

    // R11
    const addressesAfter = await prisma.address.findMany({
      where: { id: { in: before.ordersA.map((o) => o.addressId) } },
      select: {
        recipientName: true,
        phone: true,
        line1: true,
        line2: true,
        city: true,
        postcode: true,
        notes: true,
        userId: true,
      },
    });
    check("R11 address rows retained", addressesAfter.length === before.ordersA.length);
    check(
      "R11 address redacted and detached",
      addressesAfter.every(
        (addr) =>
          addr.userId === null &&
          addr.recipientName === REDACTED &&
          addr.phone === REDACTED &&
          addr.line1 === REDACTED &&
          addr.city === REDACTED &&
          addr.postcode === REDACTED &&
          addr.line2 === null &&
          addr.notes === null,
      ),
    );

    // R12
    for (const [label, count] of [
      ["reviews", await prisma.review.count({ where: { vendorId: a, userId: fixture.userId } })],
      ["carts", await prisma.cart.count({ where: { vendorId: a, userId: fixture.userId } })],
      [
        "loyalty accounts",
        await prisma.loyaltyAccount.count({ where: { vendorId: a, userId: fixture.userId } }),
      ],
    ] as const) {
      check(`R12 ${label} deleted at vendor A`, count === 0, `count=${count}`);
    }

    // R14
    const ledgerAfter = await prisma.loyaltyLedgerEntry.findMany({
      where: { id: { in: before.ledgerA.map((e) => e.id) } },
      select: {
        id: true,
        userId: true,
        orderId: true,
        kind: true,
        points: true,
        tierKey: true,
        multiplierBps: true,
      },
    });
    check("R14 ledger rows retained", ledgerAfter.length === before.ledgerA.length);
    check(
      "R14 ledger owner nulled, figures unchanged",
      ledgerAfter.every((after) => {
        const prior = before.ledgerA.find((e) => e.id === after.id)!;
        return (
          after.userId === null &&
          after.orderId === prior.orderId &&
          after.kind === prior.kind &&
          after.points === prior.points &&
          after.tierKey === prior.tierKey &&
          after.multiplierBps === prior.multiplierBps
        );
      }),
    );

    // R15
    const redemptionsAfter = await prisma.discountRedemption.findMany({
      where: { id: { in: before.redemptionsA.map((r) => r.id) } },
      select: { id: true, userId: true },
    });
    check("R15 redemption rows retained", redemptionsAfter.length === before.redemptionsA.length);
    check(
      "R15 redemption owner nulled",
      redemptionsAfter.every((after) => after.userId === null),
    );

    // R16
    const addressBAfter = await prisma.address.findUnique({
      where: { id: before.addressB!.id },
      select: { recipientName: true, phone: true, line1: true, postcode: true, userId: true },
    });
    check(
      "R16 vendor B address untouched",
      addressBAfter?.recipientName === before.addressB!.recipientName &&
        addressBAfter?.phone === before.addressB!.phone &&
        addressBAfter?.line1 === before.addressB!.line1 &&
        addressBAfter?.postcode === before.addressB!.postcode &&
        addressBAfter?.userId === fixture.userId,
    );
    const orderBAfter = await prisma.order.findUnique({
      where: { id: before.orderB!.id },
      select: { userId: true, totalPence: true },
    });
    check(
      "R16 vendor B order still owned by the user",
      orderBAfter?.userId === fixture.userId &&
        orderBAfter?.totalPence === before.orderB!.totalPence,
    );

    // R18
    const stillThere = await prisma.user.count({ where: { id: fixture.userId } });
    check("R18 identity retained while vendor B holds data", stillThere === 1);
    check("R18 result reports identity not deleted", result.identityDeleted === false);
  } finally {
    await cleanup(prisma, fixture);
  }
}

async function modeEraseLastVendor(prisma: PrismaClient): Promise<void> {
  const { a } = await vendors(prisma, false);
  const fixture = await buildFixture(prisma, [a]);
  try {
    const result = await eraseVendorData(prisma, a, fixture.userId);

    check("R17 result reports identity deleted", result.identityDeleted === true);
    check("R17 user row gone", (await prisma.user.count({ where: { id: fixture.userId } })) === 0);
    check(
      "R17 sessions gone",
      (await prisma.session.count({ where: { userId: fixture.userId } })) === 0,
    );
    check(
      "R17 accounts gone",
      (await prisma.account.count({ where: { userId: fixture.userId } })) === 0,
    );

    // The migration's whole purpose: the ledger must SURVIVE the user delete.
    const ledger = await prisma.loyaltyLedgerEntry.count({ where: { vendorId: a, userId: null } });
    check("R14 ledger survived the identity delete (not cascaded away)", ledger > 0);
  } finally {
    await cleanup(prisma, fixture);
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "all";
  const prisma = db();
  const modes: Record<string, (p: PrismaClient) => Promise<void>> = {
    "export-shape": modeExportShape,
    "export-isolation": modeExportIsolation,
    "count-other": modeCountOther,
    erase: modeErase,
    "erase-last-vendor": modeEraseLastVendor,
  };

  try {
    const selected = mode === "all" ? Object.keys(modes) : [mode];
    for (const name of selected) {
      const run = modes[name];
      if (!run) throw new Error(`unknown mode "${name}" — one of ${Object.keys(modes).join(", ")}`);
      console.log(`\n${name}`);
      await run(prisma);
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
