import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkOrderLookupRateLimit } from "@/lib/repositories/order-lookup-rate-limit";

// No test previously existed for this function at all (#468) — mirrors
// tests/repository-auth-rate-limit.test.ts's coverage for its sibling function.

const count = vi.fn();
const create = vi.fn();
const deleteMany = vi.fn();

const mockPrisma = {
  orderLookupAttempt: {
    count,
    create,
    deleteMany,
  },
} as any;

describe("checkOrderLookupRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Above SWEEP_PROBABILITY (0.01) by default, so pre-existing behavior stays
    // deterministic; sweep-specific tests below override this.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows requests when under the limit", async () => {
    count.mockResolvedValue(4);

    const result = await checkOrderLookupRateLimit(mockPrisma, "vendor-1", "127.0.0.1");

    expect(result.allowed).toBe(true);
    expect(count).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);

    const callArgs = create.mock.calls[0][0];
    expect(callArgs.data.vendorId).toBe("vendor-1");
    expect(callArgs.data.ipHash).toHaveLength(64);
  });

  it("blocks requests when limit is reached", async () => {
    count.mockResolvedValue(5);

    const result = await checkOrderLookupRateLimit(mockPrisma, "vendor-1", "127.0.0.1");

    expect(result.allowed).toBe(false);
    expect(count).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  // #468
  describe("retention sweep", () => {
    it("sweeps stale rows when the allowed call wins the random draw", async () => {
      count.mockResolvedValue(4);
      vi.spyOn(Math, "random").mockReturnValue(0);

      await checkOrderLookupRateLimit(mockPrisma, "vendor-1", "127.0.0.1");

      expect(deleteMany).toHaveBeenCalledTimes(1);
      const where = deleteMany.mock.calls[0][0].where;
      expect(where.createdAt.lt).toBeInstanceOf(Date);
    });

    it("does not sweep when the allowed call loses the random draw", async () => {
      count.mockResolvedValue(4);
      vi.spyOn(Math, "random").mockReturnValue(0.99);

      await checkOrderLookupRateLimit(mockPrisma, "vendor-1", "127.0.0.1");

      expect(deleteMany).not.toHaveBeenCalled();
    });

    it("never sweeps a blocked call, regardless of the random draw", async () => {
      count.mockResolvedValue(5);
      vi.spyOn(Math, "random").mockReturnValue(0);

      await checkOrderLookupRateLimit(mockPrisma, "vendor-1", "127.0.0.1");

      expect(deleteMany).not.toHaveBeenCalled();
    });
  });
});
