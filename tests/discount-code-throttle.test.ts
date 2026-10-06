import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import {
  DISCOUNT_CODE_WINDOW_MS,
  hashIp,
  isDiscountCodeCheckThrottled,
  MAX_UNKNOWN_DISCOUNT_CODES,
  recordUnknownDiscountCode,
} from "@/lib/repositories/discount-code-throttle";

/**
 * #988 (R19) — the unknown-code throttle's rule, boundary, hashing and sweep. The real-database
 * proof (vendor and IP isolation) is `scripts/verify-referral-code-integrity.ts throttle`.
 */

const count = vi.fn();
const create = vi.fn();
const deleteMany = vi.fn();
const prisma = { discountCodeAttempt: { count, create, deleteMany } } as never;

const IP = "203.0.113.7";
const expectedHash = createHash("sha256").update(IP).digest("hex");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Math, "random").mockReturnValue(0.5); // above the 0.01 sweep probability
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hashIp", () => {
  it("is the lowercase hex SHA-256 of the IP", async () => {
    await expect(hashIp(IP)).resolves.toBe(expectedHash);
    expect(expectedHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isDiscountCodeCheckThrottled", () => {
  it("allows 9 unknown codes in the window", async () => {
    count.mockResolvedValueOnce(9);
    await expect(isDiscountCodeCheckThrottled(prisma, "v-1", IP)).resolves.toBe(false);
  });

  it("throttles at 10", async () => {
    count.mockResolvedValueOnce(10);
    await expect(isDiscountCodeCheckThrottled(prisma, "v-1", IP)).resolves.toBe(true);
    expect(MAX_UNKNOWN_DISCOUNT_CODES).toBe(10);
  });

  it("counts this vendor and hashed IP over the last 60 seconds only", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
    try {
      count.mockResolvedValueOnce(0);
      await isDiscountCodeCheckThrottled(prisma, "v-1", IP);
      expect(DISCOUNT_CODE_WINDOW_MS).toBe(60_000);
      expect(count).toHaveBeenCalledWith({
        where: {
          vendorId: "v-1",
          ipHash: expectedHash,
          createdAt: { gte: new Date("2026-10-06T11:59:00Z") },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("recordUnknownDiscountCode", () => {
  it("stores the hash, never the raw IP", async () => {
    await recordUnknownDiscountCode(prisma, "v-1", IP);
    expect(create).toHaveBeenCalledWith({ data: { vendorId: "v-1", ipHash: expectedHash } });
    expect(JSON.stringify(create.mock.calls)).not.toContain(IP);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("sweeps rows older than an hour when the 1% roll hits", async () => {
    vi.mocked(Math.random).mockReturnValue(0.005);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
    try {
      await recordUnknownDiscountCode(prisma, "v-1", IP);
      expect(deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: new Date("2026-10-06T11:00:00Z") } },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
