/**
 * P8.5a (#345) — collapses a burst of stepper clicks into one cart mutation.
 *
 * WHY THIS IS A REQUIREMENT AND NOT AN OPTIMISATION. `features/cart/shared.ts`'s
 * `revalidateCartSurfaces()` calls `revalidatePath("/", "layout")` on every cart
 * write, which invalidates the whole storefront tree — header drawer included.
 * A stepper that fires one server action per click, rendered across a twenty-card
 * grid, is exactly the mutation pattern #236 measured failing at ~20 rapid
 * mutations ("This page couldn't load"). #236's own "worth checking when picked
 * up" section names client-side coalescing as the fix, so this is the mitigation
 * the issue asked for rather than a workaround invented around it.
 *
 * DELIBERATELY NOT A REACT HOOK. Keeping the scheduling logic as a plain object
 * is what makes requirement R8 checkable with fake timers and no DOM — the
 * behaviour under test is "N calls inside the window produce one flush carrying
 * the last value", which has nothing to do with rendering.
 *
 * The flush is LAST-VALUE-WINS, not additive: `updateQuantity` takes an absolute
 * quantity, so replaying every intermediate value would be both wasteful and
 * wrong if one were dropped.
 */

export interface QuantityCoalescerOptions {
  /** Idle period after the final `set()` before the flush fires. */
  delayMs: number;
  /** Performs the real mutation. Rejections are surfaced to `onError`. */
  flush: (quantity: number) => void | Promise<void>;
  /** Called when `flush` rejects, so the caller can roll back optimistic state. */
  onError?: (error: unknown) => void;
}

export interface QuantityCoalescer {
  /** Record the newest intended quantity and (re)start the idle window. */
  set: (quantity: number) => void;
  /** Flush immediately if a value is pending — e.g. on unmount. */
  flushNow: () => void;
  /** Drop any pending value without flushing. */
  cancel: () => void;
}

export function createQuantityCoalescer({
  delayMs,
  flush,
  onError,
}: QuantityCoalescerOptions): QuantityCoalescer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: number | null = null;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const run = () => {
    clear();
    if (pending === null) return;
    const quantity = pending;
    pending = null;
    try {
      // `flush` may be sync or async; Promise.resolve normalises both so a
      // synchronous throw and a rejected promise reach onError the same way.
      Promise.resolve(flush(quantity)).catch((error: unknown) => onError?.(error));
    } catch (error) {
      onError?.(error);
    }
  };

  return {
    set(quantity: number) {
      pending = quantity;
      // Restart the window on every click, so a steady burst flushes once at
      // the end rather than once per delayMs.
      clear();
      timer = setTimeout(run, delayMs);
    },
    flushNow: run,
    cancel() {
      clear();
      pending = null;
    },
  };
}
