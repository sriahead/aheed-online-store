import { describe, it, expect, vi, beforeEach } from "vitest";

// lib/repositories/loyalty.ts imports lib/db (→ @prisma/client/wasm, unresolvable under
// vitest) and lib/tenant. Mock both so the module loads; every test below drives
// reverseRedemption with a fake tx, which is exactly why it takes its client and
// vendorId as explicit arguments rather than resolving them from request context.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn() }));

const { reverseRedemption } = await import("@/lib/repositories/loyalty");

/**
 * #224 — reverseRedemption's null-owner path.
 *
 * P7b (#216) made LoyaltyLedgerEntry.userId nullable so erasure can sever the personal
 * link without destroying a row that a retained order's discountPence still needs to stay
 * explainable. That forced a real behaviour change here: when the redeeming user has since
 * been erased at this vendor, there is no LoyaltyAccount left to credit, so the balance
 * update is skipped while the REVERSAL row is still written — keeping the append-only trail
 * balanced and the idempotency guard intact.
 *
 * P7b's /validate called this the highest-risk edit in that diff, and it shipped verified by
 * code reading alone. These are the tests that were missing.
 */

const VENDOR = "v-aheed";
const ORDER = "o-1";

type LedgerRow = { userId: string | null; points: number };

type FakeState = {
  /** The REDEEM row for ORDER, or null when the order redeemed nothing. */
  redeem: LedgerRow | null;
  /** Whether a REVERSAL already exists (the idempotency guard's input). */
  alreadyReversed: boolean;
};

function fakeTx(state: FakeState) {
  const calls = {
    accountUpdates: [] as { where: unknown; data: unknown }[],
    ledgerCreates: [] as Record<string, unknown>[],
  };

  const tx = {
    loyaltyLedgerEntry: {
      findUnique: async ({ where }: { where: { orderId_kind: { kind: string } } }) => {
        const { kind } = where.orderId_kind;
        if (kind === "REDEEM") return state.redeem;
        if (kind === "REVERSAL") return state.alreadyReversed ? { id: "rev-1" } : null;
        return null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.ledgerCreates.push(data);
        return data;
      },
    },
    loyaltyAccount: {
      updateMany: async (args: { where: unknown; data: unknown }) => {
        calls.accountUpdates.push(args);
        return { count: 1 };
      },
    },
  };

  return { tx: tx as unknown as Parameters<typeof reverseRedemption>[0], calls };
}

describe("reverseRedemption — erased owner (userId null)", () => {
  let harness: ReturnType<typeof fakeTx>;

  beforeEach(() => {
    harness = fakeTx({ redeem: { userId: null, points: -250 }, alreadyReversed: false });
  });

  it("writes the REVERSAL row with the restored points and the order id", async () => {
    const restored = await reverseRedemption(harness.tx, VENDOR, ORDER);

    expect(restored).toBe(250);
    expect(harness.calls.ledgerCreates).toHaveLength(1);
    expect(harness.calls.ledgerCreates[0]).toMatchObject({
      vendorId: VENDOR,
      orderId: ORDER,
      kind: "REVERSAL",
      points: 250,
      userId: null,
    });
  });

  it("attempts no LoyaltyAccount write and does not throw", async () => {
    await expect(reverseRedemption(harness.tx, VENDOR, ORDER)).resolves.toBe(250);
    // The account was deleted by erasure — crediting it would either throw or, worse,
    // silently create a phantom row for a user who no longer exists here.
    expect(harness.calls.accountUpdates).toHaveLength(0);
  });

  it("still refuses a second reversal for the same order", async () => {
    const second = fakeTx({ redeem: { userId: null, points: -250 }, alreadyReversed: true });
    const restored = await reverseRedemption(second.tx, VENDOR, ORDER);

    expect(restored).toBe(0);
    expect(second.calls.ledgerCreates).toHaveLength(0);
    expect(second.calls.accountUpdates).toHaveLength(0);
  });
});

describe("reverseRedemption — owner still present (contrast)", () => {
  it("credits the account and writes the REVERSAL", async () => {
    // Present so the null-owner assertions above prove a real branch rather than a
    // fake that never calls updateMany under any input.
    const { tx, calls } = fakeTx({
      redeem: { userId: "u-1", points: -250 },
      alreadyReversed: false,
    });

    const restored = await reverseRedemption(tx, VENDOR, ORDER);

    expect(restored).toBe(250);
    expect(calls.accountUpdates).toHaveLength(1);
    expect(calls.accountUpdates[0]).toMatchObject({
      where: { vendorId: VENDOR, userId: "u-1" },
      data: { balancePoints: { increment: 250 } },
    });
    expect(calls.ledgerCreates[0]).toMatchObject({ userId: "u-1", kind: "REVERSAL" });
  });
});

describe("reverseRedemption — nothing to reverse", () => {
  it("returns 0 and writes nothing when the order redeemed no points", async () => {
    const { tx, calls } = fakeTx({ redeem: null, alreadyReversed: false });

    expect(await reverseRedemption(tx, VENDOR, ORDER)).toBe(0);
    expect(calls.ledgerCreates).toHaveLength(0);
    expect(calls.accountUpdates).toHaveLength(0);
  });
});
