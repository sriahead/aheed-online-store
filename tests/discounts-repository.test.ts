import { describe, it, expect } from "vitest";

// lib/repositories/discounts.ts imports lib/db (→ @prisma/client/wasm,
// unresolvable under vitest) and lib/tenant. Mock both so the module loads;
// every test below drives the real functions with a fake tx, which is exactly
// what taking `tx` and `vendorId` as explicit arguments makes possible.
import { vi } from "vitest";
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn() }));

const {
  claimCode,
  recordCodeRedemption,
  releaseCodeRedemption,
  reverseCodeRedemptionForPaidOrder,
} = await import("@/lib/repositories/discounts");

/**
 * P9.2 (#696) — the discount REPOSITORY's first tests.
 *
 * `tests/discounts.test.ts` covers only the pure `evaluateCode`. Everything that
 * actually writes — `claimCode`, `recordCodeRedemption`, `releaseCodeRedemption`
 * — had no coverage at all, which means the `@@unique([codeId, userId, seq])`
 * concurrency guarantee that `discounts.ts` describes as the real per-customer
 * enforcement was asserted only by a code comment.
 *
 * #696 changes how `seq` is allocated (max+1 rather than count, so a reversed
 * row can keep its slot), so that guarantee had to be pinned before it moved
 * rather than after.
 */

const VENDOR = "v-aheed";
const CODE_ID = "c-1";
const USER = "u-1";

type Redemption = {
  id: string;
  codeId: string;
  orderId: string;
  userId: string | null;
  seq: number;
  reversedAt: Date | null;
};

type CodeRow = {
  id: string;
  kind: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  minSubtotalPence: number;
  startsAt: Date;
  endsAt: Date | null;
  remainingRedemptions: number | null;
  maxPerCustomer: number | null;
  isActive: boolean;
};

const aCode = (overrides: Partial<CodeRow> = {}): CodeRow => ({
  id: CODE_ID,
  kind: "FIXED_AMOUNT",
  value: 500,
  minSubtotalPence: 0,
  startsAt: new Date("2026-01-01"),
  endsAt: null,
  remainingRedemptions: 10,
  maxPerCustomer: 1,
  isActive: true,
  ...overrides,
});

/**
 * A fake that models the three things these functions actually depend on: the
 * code row, the redemption rows, and the unique index over (codeId, userId, seq).
 */
function fakeTx(opts: { code?: CodeRow | null; redemptions?: Redemption[] } = {}) {
  const code = opts.code === undefined ? aCode() : opts.code;
  const redemptions: Redemption[] = [...(opts.redemptions ?? [])];
  const calls = {
    codeUpdates: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
    redemptionUpdates: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
    deletes: [] as Record<string, unknown>[],
    creates: [] as Record<string, unknown>[],
  };

  const matches = (r: Redemption, where: Record<string, unknown>): boolean => {
    if ("id" in where && r.id !== where.id) return false;
    if ("orderId" in where && r.orderId !== where.orderId) return false;
    if ("codeId" in where && r.codeId !== where.codeId) return false;
    if ("userId" in where && r.userId !== where.userId) return false;
    if ("reversedAt" in where && where.reversedAt === null && r.reversedAt !== null) return false;
    return true;
  };

  const tx = {
    discountCode: {
      findUnique: async () => code,
      updateMany: async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        calls.codeUpdates.push(args);
        if (!code) return { count: 0 };
        // Mirror the real guard: the claim only succeeds while uses remain.
        if (
          args.data.remainingRedemptions &&
          "decrement" in (args.data.remainingRedemptions as object)
        ) {
          if (code.remainingRedemptions !== null && code.remainingRedemptions <= 0) {
            return { count: 0 };
          }
        }
        return { count: 1 };
      },
    },
    discountRedemption: {
      findFirst: async (args: { where: Record<string, unknown>; orderBy?: { seq: "desc" } }) => {
        const found = redemptions.filter((r) => matches(r, args.where));
        if (args.orderBy?.seq === "desc") {
          return found.sort((a, b) => b.seq - a.seq)[0] ?? null;
        }
        return found[0] ?? null;
      },
      count: async (args: { where: Record<string, unknown> }) =>
        redemptions.filter((r) => matches(r, args.where)).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.creates.push(data);
        // The real index. This is the whole point of the concurrency test below.
        const clash = redemptions.some(
          (r) => r.codeId === data.codeId && r.userId === data.userId && r.seq === data.seq,
        );
        if (clash) {
          throw Object.assign(new Error("duplicate key value violates unique constraint"), {
            code: "23505",
          });
        }
        redemptions.push({
          id: `r-${redemptions.length + 1}`,
          codeId: data.codeId as string,
          orderId: data.orderId as string,
          userId: (data.userId ?? null) as string | null,
          seq: data.seq as number,
          reversedAt: null,
        });
        return data;
      },
      updateMany: async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        calls.redemptionUpdates.push(args);
        const hit = redemptions.filter((r) => matches(r, args.where));
        for (const r of hit) {
          if ("reversedAt" in args.data) r.reversedAt = args.data.reversedAt as Date;
        }
        return { count: hit.length };
      },
      deleteMany: async (args: { where: Record<string, unknown> }) => {
        calls.deletes.push(args.where);
        const hit = redemptions.filter((r) => matches(r, args.where));
        for (const r of hit) redemptions.splice(redemptions.indexOf(r), 1);
        return { count: hit.length };
      },
    },
  };

  return { tx: tx as unknown as Parameters<typeof claimCode>[0], calls, redemptions };
}

const claimInput = {
  code: "SAVE5",
  userId: USER as string | null,
  subtotalPence: 5000,
  deliveryFeePence: 0,
  now: new Date("2026-06-01"),
};

describe("claimCode — seq allocation (#696)", () => {
  it("allocates seq 0 on a first-ever claim, exactly as the old count did", async () => {
    const { tx } = fakeTx({ redemptions: [] });
    const result = await claimCode(tx, VENDOR, claimInput);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.claim.seq).toBe(0);
  });

  it("allocates max(seq)+1, not a count, so gaps do not cause collisions", async () => {
    // Rows at 0 and 2 with nothing at 1: a count would hand out 2 and collide.
    const { tx } = fakeTx({
      code: aCode({ maxPerCustomer: null }),
      redemptions: [
        { id: "r-a", codeId: CODE_ID, orderId: "o-a", userId: USER, seq: 0, reversedAt: null },
        { id: "r-b", codeId: CODE_ID, orderId: "o-b", userId: USER, seq: 2, reversedAt: null },
      ],
    });

    const result = await claimCode(tx, VENDOR, claimInput);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.claim.seq).toBe(3);
  });

  it("counts only un-reversed rows against the per-customer cap", async () => {
    // maxPerCustomer is 1 and the customer has one redemption — but it was
    // reversed by a staff cancellation, so the use was given back and this
    // claim must succeed. Before #696 the single count served both jobs and
    // this was refused.
    const { tx } = fakeTx({
      redemptions: [
        {
          id: "r-a",
          codeId: CODE_ID,
          orderId: "o-a",
          userId: USER,
          seq: 0,
          reversedAt: new Date(),
        },
      ],
    });

    const result = await claimCode(tx, VENDOR, claimInput);

    expect(result.ok).toBe(true);
    // The reversed row keeps its slot, so the new row must NOT reuse seq 0.
    if (result.ok) expect(result.claim.seq).toBe(1);
  });

  it("still refuses when the cap is reached by un-reversed rows", async () => {
    const { tx } = fakeTx({
      redemptions: [
        { id: "r-a", codeId: CODE_ID, orderId: "o-a", userId: USER, seq: 0, reversedAt: null },
      ],
    });

    const result = await claimCode(tx, VENDOR, claimInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("CUSTOMER_LIMIT_REACHED");
  });

  it("uses seq 0 and no per-customer counting for a guest", async () => {
    const { tx } = fakeTx({ code: aCode({ maxPerCustomer: null }), redemptions: [] });
    const result = await claimCode(tx, VENDOR, { ...claimInput, userId: null });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.claim.seq).toBe(0);
  });
});

/**
 * The guarantee #696 must not weaken. Two concurrent checkouts by the same
 * shopper both read the same highest seq, so both compute the same next value,
 * and the unique index refuses the second — rolling back its whole transaction
 * including its remainingRedemptions decrement. A count-then-write would have
 * let both through, and that was true before #696 and is still true after it.
 */
describe("recordCodeRedemption — the per-customer concurrency guard", () => {
  it("admits the first writer at a given seq", async () => {
    const { tx, redemptions } = fakeTx({ redemptions: [] });

    await recordCodeRedemption(tx, VENDOR, {
      codeId: CODE_ID,
      orderId: "o-1",
      userId: USER,
      seq: 0,
      amountPence: 500,
    });

    expect(redemptions).toHaveLength(1);
  });

  it("refuses the second writer at the SAME seq with CUSTOMER_LIMIT_REACHED", async () => {
    const { tx, redemptions } = fakeTx({ redemptions: [] });
    const write = (orderId: string) =>
      recordCodeRedemption(tx, VENDOR, {
        codeId: CODE_ID,
        orderId,
        userId: USER,
        seq: 0,
        amountPence: 500,
      });

    await write("o-1");
    await expect(write("o-2")).rejects.toThrow(/CUSTOMER_LIMIT_REACHED/);
    expect(redemptions).toHaveLength(1);
  });

  it("admits two writers at different seqs", async () => {
    const { tx, redemptions } = fakeTx({ redemptions: [] });

    await recordCodeRedemption(tx, VENDOR, {
      codeId: CODE_ID,
      orderId: "o-1",
      userId: USER,
      seq: 0,
      amountPence: 500,
    });
    await recordCodeRedemption(tx, VENDOR, {
      codeId: CODE_ID,
      orderId: "o-2",
      userId: USER,
      seq: 1,
      amountPence: 500,
    });

    expect(redemptions).toHaveLength(2);
  });
});

describe("releaseCodeRedemption — the UNPAID path is unchanged by #696", () => {
  it("deletes the row and gives the code use back", async () => {
    const { tx, calls, redemptions } = fakeTx({
      redemptions: [
        { id: "r-a", codeId: CODE_ID, orderId: "o-1", userId: USER, seq: 0, reversedAt: null },
      ],
    });

    expect(await releaseCodeRedemption(tx, VENDOR, "o-1")).toBe(1);
    expect(redemptions).toHaveLength(0);
    expect(calls.deletes).toHaveLength(1);
    expect(calls.codeUpdates[0].data).toMatchObject({ remainingRedemptions: { increment: 1 } });
  });

  it("is idempotent — the row is gone, so a second call finds nothing", async () => {
    const { tx, calls } = fakeTx({ redemptions: [] });

    expect(await releaseCodeRedemption(tx, VENDOR, "o-1")).toBe(0);
    expect(calls.codeUpdates).toHaveLength(0);
  });
});

describe("reverseCodeRedemptionForPaidOrder (#696) — the PAID path", () => {
  const paid = () =>
    fakeTx({
      redemptions: [
        { id: "r-a", codeId: CODE_ID, orderId: "o-1", userId: USER, seq: 0, reversedAt: null },
      ],
    });

  it("stamps reversedAt and KEEPS the row", async () => {
    const { tx, calls, redemptions } = paid();

    expect(await reverseCodeRedemptionForPaidOrder(tx, VENDOR, "o-1")).toBe(1);

    // The row survives: Order.discountPence stays explainable, the same reason
    // LoyaltyLedgerEntry is append-only.
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0].reversedAt).toBeInstanceOf(Date);
    expect(calls.deletes).toHaveLength(0);
  });

  it("gives the code use back", async () => {
    const { tx, calls } = paid();
    await reverseCodeRedemptionForPaidOrder(tx, VENDOR, "o-1");

    expect(calls.codeUpdates).toHaveLength(1);
    expect(calls.codeUpdates[0].data).toMatchObject({ remainingRedemptions: { increment: 1 } });
  });

  it("is idempotent and does not increment the code twice", async () => {
    const { tx, calls } = paid();

    expect(await reverseCodeRedemptionForPaidOrder(tx, VENDOR, "o-1")).toBe(1);
    expect(await reverseCodeRedemptionForPaidOrder(tx, VENDOR, "o-1")).toBe(0);

    expect(calls.codeUpdates).toHaveLength(1);
  });

  it("returns 0 when the order has no redemption at all", async () => {
    const { tx, calls } = fakeTx({ redemptions: [] });

    expect(await reverseCodeRedemptionForPaidOrder(tx, VENDOR, "o-9")).toBe(0);
    expect(calls.codeUpdates).toHaveLength(0);
    expect(calls.redemptionUpdates).toHaveLength(0);
  });
});
