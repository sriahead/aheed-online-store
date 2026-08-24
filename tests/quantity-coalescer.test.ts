import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQuantityCoalescer } from "@/components/cart/quantity-coalescer";

/**
 * P8.5a (#345) R8 — a burst of stepper clicks must reach the server as ONE
 * cart mutation carrying the final quantity.
 *
 * This is the requirement that lets the product grid mutate the cart at all.
 * `revalidateCartSurfaces()` invalidates the whole storefront layout on every
 * write, and #236 measured "This page couldn't load" at roughly twenty rapid
 * mutations — so a stepper that wrote per click, across a twenty-card grid,
 * would be reproducing a known failure deliberately.
 *
 * Fake timers rather than real waits: the behaviour under test is scheduling,
 * and a test that actually slept would be both slow and flaky.
 */
describe("createQuantityCoalescer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("collapses a burst of increments into one flush carrying the last quantity", () => {
    const flush = vi.fn();
    const coalescer = createQuantityCoalescer({ delayMs: 600, flush });

    // Five clicks well inside the window — the R8 case.
    for (const quantity of [2, 3, 4, 5, 6]) {
      coalescer.set(quantity);
      vi.advanceTimersByTime(50);
    }
    expect(flush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(6);
  });

  it("restarts the idle window on each set, so a steady burst still flushes once", () => {
    const flush = vi.fn();
    const coalescer = createQuantityCoalescer({ delayMs: 600, flush });

    // Clicks spaced at 500ms — each one under the window, but the total span
    // (2s) is well over it. A fixed-interval throttle would flush repeatedly
    // here; a trailing debounce must not.
    for (const quantity of [2, 3, 4, 5]) {
      coalescer.set(quantity);
      vi.advanceTimersByTime(500);
    }
    expect(flush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(5);
  });

  it("flushes separate bursts separately", () => {
    const flush = vi.fn();
    const coalescer = createQuantityCoalescer({ delayMs: 600, flush });

    coalescer.set(2);
    vi.advanceTimersByTime(700);
    coalescer.set(3);
    vi.advanceTimersByTime(700);

    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenNthCalledWith(1, 2);
    expect(flush).toHaveBeenNthCalledWith(2, 3);
  });

  it("reports a rejected flush to onError so the caller can roll back (R10)", async () => {
    const onError = vi.fn();
    const coalescer = createQuantityCoalescer({
      delayMs: 600,
      flush: () => Promise.reject(new Error("offline")),
      onError,
    });

    coalescer.set(4);
    vi.advanceTimersByTime(600);
    // The rejection settles on the microtask queue, not the timer queue.
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect((onError.mock.calls[0][0] as Error).message).toBe("offline");
  });

  it("reports a synchronously thrown flush to onError too", async () => {
    const onError = vi.fn();
    const coalescer = createQuantityCoalescer({
      delayMs: 600,
      flush: () => {
        throw new Error("boom");
      },
      onError,
    });

    coalescer.set(4);
    vi.advanceTimersByTime(600);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  });

  it("flushNow sends a pending value immediately, and only once", () => {
    const flush = vi.fn();
    const coalescer = createQuantityCoalescer({ delayMs: 600, flush });

    coalescer.set(7);
    coalescer.flushNow();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(7);

    // The scheduled timer must not fire a second write for the same value.
    vi.advanceTimersByTime(600);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("flushNow with nothing pending does nothing", () => {
    const flush = vi.fn();
    const coalescer = createQuantityCoalescer({ delayMs: 600, flush });

    coalescer.flushNow();
    expect(flush).not.toHaveBeenCalled();
  });

  it("cancel drops a pending value without flushing", () => {
    const flush = vi.fn();
    const coalescer = createQuantityCoalescer({ delayMs: 600, flush });

    coalescer.set(9);
    coalescer.cancel();
    vi.advanceTimersByTime(600);
    expect(flush).not.toHaveBeenCalled();
  });
});
