import { describe, it, expect, vi, afterEach } from "vitest";
import {
  recordPaymentBindingRefusal,
  listBindingRefusalsForVendor,
  findBindingRefusalForVendor,
  recordRefusalResolution,
} from "@/lib/repositories/payment-binding-refusals";

/**
 * #454 — the durable record of a refused payment binding.
 *
 * Every function here takes its Prisma client explicitly, which is what lets
 * these run against a hand-built fake with no database and no Workers request.
 * The fake is deliberately shaped like the real client's call surface rather
 * than being a full mock: what matters is which arguments reach Prisma.
 */

const ORDER_WITH_PAYMENT = {
  id: "order-1",
  vendorId: "vendor-aheed",
  currency: "GBP",
  payment: { providerReference: "cs_stored_1", amountPence: 2346 },
};

const INPUT = {
  orderNumber: "AHE-20260902-ABC123",
  reason: "binding-mismatch",
  provider: "stripe",
  claimedProviderReference: "cs_claimed_9",
  claimedAmountPence: 2346,
  claimedCurrency: "gbp",
};

/** The one Prisma argument shape these assertions care about. */
type Args = Record<string, unknown>;

function fakePrisma(order: unknown) {
  const create = vi.fn(async (_args: Args) => ({}));
  const deleteMany = vi.fn(async (_args: Args) => ({ count: 0 }));
  const update = vi.fn(async (_args: Args) => ({}));
  const findMany = vi.fn(async (_args: Args) => [] as unknown[]);
  const findFirst = vi.fn(async (_args: Args) => null);
  return {
    client: {
      order: { findUnique: vi.fn(async (_args: Args) => order) },
      paymentBindingRefusal: { create, deleteMany, update, findMany, findFirst },
    },
    create,
    deleteMany,
    update,
    findMany,
    findFirst,
  };
}

// The repository takes a real PrismaClient; the fake above is deliberately only
// the slice of it these functions touch, so the cast is the point of the helper.
const asClient = (c: unknown) => c as Parameters<typeof recordPaymentBindingRefusal>[0];

afterEach(() => vi.restoreAllMocks());

describe("recordPaymentBindingRefusal", () => {
  it("snapshots the order and its stored payment when the order exists", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // above SWEEP_PROBABILITY
    const p = fakePrisma(ORDER_WITH_PAYMENT);

    await recordPaymentBindingRefusal(asClient(p.client), INPUT);

    expect(p.create).toHaveBeenCalledTimes(1);
    const { data } = p.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.orderId).toBe("order-1");
    expect(data.vendorId).toBe("vendor-aheed");
    expect(data.storedProviderReference).toBe("cs_stored_1");
    expect(data.storedAmountPence).toBe(2346);
    // Currency comes off the ORDER — Payment has no currency column.
    expect(data.storedCurrency).toBe("GBP");
    expect(data.claimedProviderReference).toBe("cs_claimed_9");
    expect(data.orderNumber).toBe(INPUT.orderNumber);
    expect(data.reason).toBe("binding-mismatch");
  });

  it("still records the refusal when no order matches, with every resolved field null", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const p = fakePrisma(null);

    await recordPaymentBindingRefusal(asClient(p.client), { ...INPUT, reason: "not-found" });

    expect(p.create).toHaveBeenCalledTimes(1);
    const { data } = p.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.orderId).toBeNull();
    expect(data.vendorId).toBeNull();
    expect(data.storedProviderReference).toBeNull();
    expect(data.storedAmountPence).toBeNull();
    expect(data.storedCurrency).toBeNull();
    // The claimed order number survives even though nothing matched it — that
    // is the only identifier a `not-found` refusal has.
    expect(data.orderNumber).toBe(INPUT.orderNumber);
  });

  it("records a refusal whose claimed fields are all null (the `unbindable` case)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const p = fakePrisma(ORDER_WITH_PAYMENT);

    await recordPaymentBindingRefusal(asClient(p.client), {
      ...INPUT,
      reason: "unbindable",
      claimedProviderReference: null,
      claimedAmountPence: null,
      claimedCurrency: null,
    });

    const { data } = p.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.claimedProviderReference).toBeNull();
    expect(data.claimedAmountPence).toBeNull();
    expect(data.claimedCurrency).toBeNull();
  });

  it("sweeps expired rows when the probability roll passes", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // below SWEEP_PROBABILITY
    const p = fakePrisma(ORDER_WITH_PAYMENT);

    await recordPaymentBindingRefusal(asClient(p.client), INPUT);

    expect(p.deleteMany).toHaveBeenCalledTimes(1);
    const arg = p.deleteMany.mock.calls[0][0] as unknown as {
      where: { createdAt: { lt: Date } };
    };
    const cutoff = arg.where.createdAt.lt.getTime();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    expect(Math.abs(Date.now() - ninetyDays - cutoff)).toBeLessThan(10_000);
  });

  it("does not sweep when the probability roll fails", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const p = fakePrisma(ORDER_WITH_PAYMENT);

    await recordPaymentBindingRefusal(asClient(p.client), INPUT);

    expect(p.deleteMany).not.toHaveBeenCalled();
  });
});

describe("staff-facing reads and writes are vendor-scoped", () => {
  it("lists only the given vendor's refusals, newest first", async () => {
    const p = fakePrisma(null);
    await listBindingRefusalsForVendor(asClient(p.client), "vendor-aheed", 50);

    const arg = p.findMany.mock.calls[0][0] as unknown as {
      where: { vendorId: string };
      orderBy: { createdAt: string };
      take: number;
    };
    expect(arg.where.vendorId).toBe("vendor-aheed");
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
    expect(arg.take).toBe(50);
  });

  it("resolves a single refusal only within the vendor, returning null otherwise", async () => {
    const p = fakePrisma(null);
    const found = await findBindingRefusalForVendor(asClient(p.client), "vendor-aheed", "ref-1");

    const arg = p.findFirst.mock.calls[0][0] as unknown as {
      where: { id: string; vendorId: string };
    };
    expect(arg.where).toEqual({ id: "ref-1", vendorId: "vendor-aheed" });
    // The fake returns null — a row belonging to another vendor must surface as
    // "not found", never as that row's data and never as a throw.
    expect(found).toBeNull();
  });

  it("carries the vendor into the resolution write itself, not a prior check", async () => {
    const p = fakePrisma(null);
    await recordRefusalResolution(
      asClient(p.client),
      "vendor-aheed",
      "ref-1",
      "provider-unpaid",
      "detail",
    );

    const arg = p.update.mock.calls[0][0] as unknown as {
      where: { id: string; vendorId: string };
      data: { resolution: string; resolvedAt: Date };
    };
    expect(arg.where).toEqual({ id: "ref-1", vendorId: "vendor-aheed" });
    expect(arg.data.resolution).toBe("provider-unpaid");
    expect(arg.data.resolvedAt).toBeInstanceOf(Date);
  });
});
