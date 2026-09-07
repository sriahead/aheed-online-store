import { describe, expect, it, vi } from "vitest";
import { ERROR_RATE_THRESHOLD, ERROR_RATE_WINDOW_MS, evaluateErrorRate } from "@/lib/error-rate";
import { countRecentErrorEvents } from "@/lib/repositories/error-events";

/**
 * Proves R13, R14 and R17 (#437 code tail) — see
 * `specs/2026-09-07-p9-2-non-operational-gaps/requirements.md`.
 *
 * NOTE THE ABSENCE OF `vi.mock` FOR THE `evaluateErrorRate` BLOCK, and that it
 * is the point rather than a convenience. R14 requires the decision to be
 * testable with no stubs at all: `lib/error-rate.ts` imports nothing, so if this
 * file ever needs a mock to load it, the threshold logic has drifted back into
 * something that resolves its own dependencies — which is what putting it in the
 * route would have meant. Same evidence-by-absence as `tests/payment-sweep.test.ts`.
 */

const SINCE = new Date("2026-09-07T12:00:00.000Z");

describe("evaluateErrorRate", () => {
  it("does not breach below the threshold", () => {
    const summary = evaluateErrorRate(ERROR_RATE_THRESHOLD - 1, SINCE);
    expect(summary.breached).toBe(false);
    expect(summary.count).toBe(ERROR_RATE_THRESHOLD - 1);
  });

  it("breaches AT the threshold, not only above it", () => {
    // `>=`, deliberately: a threshold of ten means ten is already too many,
    // which is how anyone tuning the constant later will read it.
    expect(evaluateErrorRate(ERROR_RATE_THRESHOLD, SINCE).breached).toBe(true);
  });

  it("breaches above the threshold", () => {
    expect(evaluateErrorRate(ERROR_RATE_THRESHOLD + 50, SINCE).breached).toBe(true);
  });

  it("does not breach on zero errors", () => {
    expect(evaluateErrorRate(0, SINCE).breached).toBe(false);
  });

  it("reports the window and threshold it applied, so the caller need not re-derive them", () => {
    const summary = evaluateErrorRate(3, SINCE);
    expect(summary.windowMs).toBe(ERROR_RATE_WINDOW_MS);
    expect(summary.threshold).toBe(ERROR_RATE_THRESHOLD);
    expect(summary.since).toBe(SINCE.toISOString());
  });

  it("honours an explicit threshold and window over the defaults", () => {
    const summary = evaluateErrorRate(2, SINCE, 2, 1000);
    expect(summary.breached).toBe(true);
    expect(summary.threshold).toBe(2);
    expect(summary.windowMs).toBe(1000);
  });
});

describe("ERROR_RATE_WINDOW_MS", () => {
  it("equals the scheduler's cron interval (R17)", () => {
    // The window is derived from `workers/scheduler/wrangler.toml`'s 15-minute
    // trigger so consecutive ticks neither double-count an error nor leave a gap
    // a burst can hide in. Pinned here because the two files cannot import from
    // one another, so nothing else would notice them drifting apart.
    expect(ERROR_RATE_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});

describe("countRecentErrorEvents", () => {
  it("counts rows at or after the supplied bound", async () => {
    const count = vi.fn().mockResolvedValue(7);
    const prisma = { errorEvent: { count } } as never;

    await expect(countRecentErrorEvents(prisma, SINCE)).resolves.toBe(7);
    expect(count).toHaveBeenCalledWith({ where: { createdAt: { gte: SINCE } } });
  });
});
