import { describe, expect, it, vi } from "vitest";
import {
  ABANDONED_GUEST_CART_RETENTION_MS,
  deleteAbandonedGuestCarts,
} from "@/lib/repositories/cart";

/**
 * Proves R7 and R8 (#94) — see
 * `specs/2026-09-07-p9-2-non-operational-gaps/requirements.md`.
 *
 * WHAT THIS FILE CAN AND CANNOT ESTABLISH. It asserts the `where` clause the
 * repository function actually issues, which is our own code and therefore a
 * legitimate thing to pin here. It does NOT establish that Postgres interprets
 * that clause as intended, nor that `CartItem`'s `onDelete: Cascade` fires — a
 * hand-built stub returns whatever its author assumed, which is the trap
 * `CLAUDE.md` records for Prisma error codes and the Workers AI response shape.
 * R12 covers those against a real database via
 * `scripts/verify-guest-cart-reaper.ts`; the two rows are complementary and
 * neither is sufficient alone.
 */

const OLDER_THAN = new Date("2026-08-08T12:00:00.000Z");
const VENDOR = "v-aheed";

function fakePrisma(staleIds: string[]) {
  return {
    cart: {
      findMany: vi.fn().mockResolvedValue(staleIds.map((id) => ({ id }))),
      deleteMany: vi.fn().mockResolvedValue({ count: staleIds.length }),
    },
  };
}

describe("deleteAbandonedGuestCarts", () => {
  it("selects only guest carts older than the bound, scoped to the vendor", async () => {
    const prisma = fakePrisma(["c1", "c2"]);

    await deleteAbandonedGuestCarts(prisma as never, VENDOR, OLDER_THAN, 500);

    expect(prisma.cart.findMany).toHaveBeenCalledWith({
      where: {
        vendorId: VENDOR,
        userId: null,
        guestToken: { not: null },
        updatedAt: { lt: OLDER_THAN },
      },
      select: { id: true },
      take: 500,
    });
  });

  it("asserts BOTH userId: null and a non-null guestToken, not just one", async () => {
    // A signed-in shopper's cart has no cookie dependency and no expiry, so its
    // age says nothing about whether it is still live state its owner can reach.
    // Either condition alone would eventually delete one.
    const prisma = fakePrisma(["c1"]);

    await deleteAbandonedGuestCarts(prisma as never, VENDOR, OLDER_THAN, 10);

    const where = prisma.cart.findMany.mock.calls[0][0].where;
    expect(where.userId).toBeNull();
    expect(where.guestToken).toEqual({ not: null });
  });

  it("uses a strict inequality, so a cart touched exactly at the bound survives", async () => {
    const prisma = fakePrisma([]);

    await deleteAbandonedGuestCarts(prisma as never, VENDOR, OLDER_THAN, 10);

    expect(prisma.cart.findMany.mock.calls[0][0].where.updatedAt).toEqual({ lt: OLDER_THAN });
  });

  it("deletes exactly the ids it selected, and re-asserts the vendor on the delete", async () => {
    const prisma = fakePrisma(["c1", "c2", "c3"]);

    const deleted = await deleteAbandonedGuestCarts(prisma as never, VENDOR, OLDER_THAN, 500);

    expect(prisma.cart.deleteMany).toHaveBeenCalledWith({
      where: { vendorId: VENDOR, id: { in: ["c1", "c2", "c3"] } },
    });
    expect(deleted).toBe(3);
  });

  it("issues no delete at all when nothing is stale", async () => {
    // Not merely an optimisation: a `deleteMany` with an empty `in` list is a
    // pointless round trip on every tick of a job that will usually find nothing.
    const prisma = fakePrisma([]);

    const deleted = await deleteAbandonedGuestCarts(prisma as never, VENDOR, OLDER_THAN, 500);

    expect(prisma.cart.deleteMany).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });

  it("bounds the selection by the supplied limit", async () => {
    const prisma = fakePrisma(["c1"]);

    await deleteAbandonedGuestCarts(prisma as never, VENDOR, OLDER_THAN, 25);

    expect(prisma.cart.findMany.mock.calls[0][0].take).toBe(25);
  });
});

describe("ABANDONED_GUEST_CART_RETENTION_MS", () => {
  it("equals the guest cart cookie's own 30-day maxAge (R8)", () => {
    // `lib/cart-identity.ts` sets CART_COOKIE with `maxAge: 60 * 60 * 24 * 30`
    // (seconds). Once that cookie expires the guest token exists nowhere, so the
    // row is unreachable by everyone including the shopper — which is what makes
    // reaping at exactly this age defensible rather than arbitrary. Pinned so the
    // two cannot drift apart silently.
    expect(ABANDONED_GUEST_CART_RETENTION_MS).toBe(60 * 60 * 24 * 30 * 1000);
  });
});
