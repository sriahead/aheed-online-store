import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LIST_NORMALISATION_MAX_ATTEMPTS,
  LIST_NORMALISATION_WINDOW_MS,
  checkListNormalisationRateLimit,
} from "@/lib/repositories/list-normalisation-rate-limit";

/**
 * P2.6 slice 4 (#567). Mirrors tests/repository-order-lookup-rate-limit.test.ts, whose function
 * this one deliberately copies in shape.
 *
 * The client and vendor id are parameters, so this exercises the real function rather than a
 * re-implementation of it — the same property that lets `scripts/verify-repository-injection.ts`
 * run repository code against a live database from plain Node.
 */

const count = vi.fn();
const create = vi.fn();
const deleteMany = vi.fn();

const mockPrisma = {
  listNormalisationAttempt: { count, create, deleteMany },
} as any;

describe("checkListNormalisationRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Above SWEEP_PROBABILITY (0.01), so the sweep stays out of the way unless a test wants it.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a 60 second window and a 5 attempt ceiling", () => {
    expect(LIST_NORMALISATION_WINDOW_MS).toBe(60_000);
    expect(LIST_NORMALISATION_MAX_ATTEMPTS).toBe(5);
  });

  it("allows the 5th attempt in a window", async () => {
    count.mockResolvedValue(4);

    const result = await checkListNormalisationRateLimit(mockPrisma, "vendor-1", "127.0.0.1");

    expect(result.allowed).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.vendorId).toBe("vendor-1");
  });

  it("refuses the 6th attempt in a window", async () => {
    count.mockResolvedValue(5);

    const result = await checkListNormalisationRateLimit(mockPrisma, "vendor-1", "127.0.0.1");

    expect(result.allowed).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("stores a hash of the IP, never the address itself", async () => {
    count.mockResolvedValue(0);

    await checkListNormalisationRateLimit(mockPrisma, "vendor-1", "203.0.113.7");

    const { ipHash } = create.mock.calls[0][0].data;
    expect(ipHash).toHaveLength(64);
    expect(ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(ipHash).not.toContain("203.0.113.7");
  });

  it("scopes the count to the vendor, the caller and the window", async () => {
    count.mockResolvedValue(0);

    await checkListNormalisationRateLimit(mockPrisma, "vendor-1", "127.0.0.1");

    const where = count.mock.calls[0][0].where;
    expect(where.vendorId).toBe("vendor-1");
    expect(where.ipHash).toHaveLength(64);
    expect(where.createdAt.gte).toBeInstanceOf(Date);
  });

  it("gives two different callers independent budgets", async () => {
    count.mockResolvedValue(0);

    await checkListNormalisationRateLimit(mockPrisma, "vendor-1", "198.51.100.1");
    await checkListNormalisationRateLimit(mockPrisma, "vendor-1", "198.51.100.2");

    expect(count.mock.calls[0][0].where.ipHash).not.toBe(count.mock.calls[1][0].where.ipHash);
  });

  describe("retention sweep", () => {
    it("sweeps stale rows when the allowed call wins the draw", async () => {
      count.mockResolvedValue(0);
      vi.spyOn(Math, "random").mockReturnValue(0);

      await checkListNormalisationRateLimit(mockPrisma, "vendor-1", "127.0.0.1");

      expect(deleteMany).toHaveBeenCalledTimes(1);
      expect(deleteMany.mock.calls[0][0].where.createdAt.lt).toBeInstanceOf(Date);
    });

    it("does not sweep when the allowed call loses the draw", async () => {
      count.mockResolvedValue(0);
      vi.spyOn(Math, "random").mockReturnValue(0.99);

      await checkListNormalisationRateLimit(mockPrisma, "vendor-1", "127.0.0.1");

      expect(deleteMany).not.toHaveBeenCalled();
    });

    it("never sweeps a refused call", async () => {
      count.mockResolvedValue(5);
      vi.spyOn(Math, "random").mockReturnValue(0);

      await checkListNormalisationRateLimit(mockPrisma, "vendor-1", "127.0.0.1");

      expect(deleteMany).not.toHaveBeenCalled();
    });
  });
});
