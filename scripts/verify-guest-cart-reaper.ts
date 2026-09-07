import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { checkDestructiveTarget } from "@/lib/db-target-guard";
import {
  ABANDONED_GUEST_CART_RETENTION_MS,
  deleteAbandonedGuestCarts,
} from "@/lib/repositories/cart";

/**
 * Proves R12 (#94) against a REAL database — see
 * `specs/2026-09-07-p9-2-non-operational-gaps/validation.md`.
 *
 * WHY A LIVE SCRIPT AND NOT ANOTHER UNIT TEST. `tests/guest-cart-reaper.test.ts`
 * pins the `where` clause the repository function issues, which is our own code.
 * It cannot establish that Postgres interprets that clause the way we meant, and
 * it certainly cannot establish that `CartItem`'s `onDelete: Cascade` actually
 * fires — a hand-built stub returns whatever its author assumed. That is the
 * exact trap `CLAUDE.md` records for Prisma driver error codes (`P2002` vs
 * `23505`) and for the Workers AI response shape: the double reproduces the
 * assumption, not the behaviour. Only a real database answers this.
 *
 * WHY IT BUILDS ITS OWN CLIENT. This runs in Node via `tsx`, not workerd, so it
 * constructs a client from the bare `@prisma/client` specifier exactly as
 * `prisma/seed.ts` does, never `lib/db.ts`'s `@prisma/client/wasm` — whose WASM
 * query compiler Node cannot load at all. `deleteAbandonedGuestCarts` takes its
 * client as a parameter precisely so this is possible.
 *
 * GUARDED. It creates and deletes rows, so `lib/db-target-guard.ts` refuses the
 * staging and production endpoints outright; `tests/db-target-guard.test.ts`
 * proves that refusal works.
 *
 *   npx tsx scripts/verify-guest-cart-reaper.ts > reaper.log
 *
 * DO NOT PIPE THIS TO `head` OR ANYTHING THAT CLOSES THE PIPE EARLY. The reader
 * closing the pipe sends SIGPIPE, which can kill the process before the cleanup
 * below runs, leaving `__verify-` fixture rows in the database — that has
 * happened here before (#411/#412). Redirect to a file and read the file.
 */

/** Every fixture this script creates carries this prefix, so a leak is findable. */
const FIXTURE_PREFIX = "__verify-guest-cart-";

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

async function main() {
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
    console.error("This script only ever runs against the dev Neon branch.");
    process.exit(1);
  }

  console.log(`Target endpoint: ${verdict.endpoint}`);

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: targetUrl as string }),
  });

  const createdCartIds: string[] = [];
  let failures = 0;

  const check = (label: string, actual: unknown, expected: unknown) => {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label} (got ${actual}, expected ${expected})`);
  };

  try {
    const vendor = await prisma.vendor.findFirst({ select: { id: true, slug: true } });
    if (!vendor) throw new Error("no vendor in this database — seed it first");

    const product = await prisma.product.findFirst({
      where: { vendorId: vendor.id },
      select: { id: true },
    });
    if (!product) throw new Error("no product for this vendor — seed it first");

    // A user with no cart for this vendor, so the control cart below does not
    // collide with Cart's @@unique([vendorId, userId]).
    const user = await prisma.user.findFirst({
      where: { carts: { none: { vendorId: vendor.id } } },
      select: { id: true },
    });

    console.log(`vendor: ${vendor.slug}`);
    console.log(`signed-in control: ${user ? "yes" : "SKIPPED (no cart-free user)"}\n`);

    const now = Date.now();
    // Comfortably past the window, so the assertion is not sitting on a boundary.
    const expiredAt = new Date(now - ABANDONED_GUEST_CART_RETENTION_MS - 24 * 60 * 60 * 1000);
    const recentAt = new Date(now - 60 * 60 * 1000);

    // `updatedAt` is `@updatedAt`, so Prisma stamps it on write unless it is
    // given explicitly. It is given explicitly here — an aged fixture is the
    // whole point, and waiting 30 days is not an option.
    const expired = await prisma.cart.create({
      data: {
        vendorId: vendor.id,
        guestToken: `${FIXTURE_PREFIX}expired`,
        createdAt: expiredAt,
        updatedAt: expiredAt,
        items: { create: [{ vendorId: vendor.id, productId: product.id, quantity: 2 }] },
      },
      select: { id: true, updatedAt: true },
    });
    createdCartIds.push(expired.id);

    const recent = await prisma.cart.create({
      data: {
        vendorId: vendor.id,
        guestToken: `${FIXTURE_PREFIX}recent`,
        createdAt: recentAt,
        updatedAt: recentAt,
      },
      select: { id: true },
    });
    createdCartIds.push(recent.id);

    let signedInId: string | null = null;
    if (user) {
      const signedIn = await prisma.cart.create({
        data: {
          vendorId: vendor.id,
          userId: user.id,
          createdAt: expiredAt,
          updatedAt: expiredAt,
        },
        select: { id: true },
      });
      signedInId = signedIn.id;
      createdCartIds.push(signedIn.id);
    }

    // The aged fixture only means anything if the explicit updatedAt actually
    // stuck. If Prisma had overridden it, every assertion below would pass for
    // the wrong reason — the cart would simply be too recent to delete.
    console.log("preconditions:");
    check(
      "expired fixture's updatedAt was stored as given",
      expired.updatedAt.toISOString(),
      expiredAt.toISOString(),
    );

    const itemsBefore = await prisma.cartItem.count({ where: { cartId: expired.id } });
    check("expired fixture has its CartItem rows", itemsBefore, 1);

    const olderThan = new Date(now - ABANDONED_GUEST_CART_RETENTION_MS);
    console.log(`\nreaping carts untouched since ${olderThan.toISOString()}:`);

    const deleted = await deleteAbandonedGuestCarts(prisma as never, vendor.id, olderThan, 500);
    check("deleted exactly the one eligible cart", deleted, 1);

    console.log("\npost-conditions:");
    check("expired guest cart is gone", await prisma.cart.count({ where: { id: expired.id } }), 0);
    check(
      "its CartItem rows went with it (onDelete: Cascade)",
      await prisma.cartItem.count({ where: { cartId: expired.id } }),
      0,
    );
    check("recent guest cart survived", await prisma.cart.count({ where: { id: recent.id } }), 1);
    if (signedInId) {
      check(
        "signed-in cart survived despite being just as old",
        await prisma.cart.count({ where: { id: signedInId } }),
        1,
      );
    }
  } finally {
    // Runs whatever happened above, including a thrown assertion. Deletes by the
    // ids this run created — never by prefix match alone, so a fixture left by an
    // earlier interrupted run is reported rather than silently swept up.
    console.log("\ncleanup:");
    const removed = await prisma.cart.deleteMany({ where: { id: { in: createdCartIds } } });
    console.log(`  deleted ${removed.count} of ${createdCartIds.length} fixture cart(s)`);

    const strays = await prisma.cart.count({
      where: { guestToken: { startsWith: FIXTURE_PREFIX } },
    });
    console.log(
      strays === 0
        ? "  no stray fixtures remain"
        : `  WARNING: ${strays} stray "${FIXTURE_PREFIX}" cart(s) remain from an earlier run`,
    );

    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
