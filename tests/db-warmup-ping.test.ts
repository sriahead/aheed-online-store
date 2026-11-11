import { describe, it, expect, vi } from "vitest";

/**
 * #1491 R9 — `warmDatabase`: exactly one query on the main database, then the last-ping marker, and
 * never the activity marker (a ping is not activity).
 */

const findFirst = vi.fn(async () => ({ id: "h1" }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ healthCheck: { findFirst } }) }));
const markWarmupPing = vi.fn(async () => {});
const markWarmupActivity = vi.fn(async () => {});
vi.mock("@/lib/job-signals", () => ({ markWarmupPing, markWarmupActivity }));

describe("warmDatabase (#1491 R9)", () => {
  it("runs one trivial query, marks the ping, never marks activity", async () => {
    const { warmDatabase } = await import("@/lib/db-warmup-ping");
    const now = new Date("2026-11-10T15:00:00Z");
    const result = await warmDatabase(now);
    expect(result.ok).toBe(true);
    expect(typeof result.ms).toBe("number");
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
    expect(markWarmupPing).toHaveBeenCalledWith(now);
    expect(markWarmupActivity).not.toHaveBeenCalled();
  });
});
