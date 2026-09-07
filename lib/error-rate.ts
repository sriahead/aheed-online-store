/**
 * The error-rate decision, as a pure function (P9.2, #437 — code tail only).
 *
 * WHY THIS IS ITS OWN MODULE. `instrumentation.ts` has written an `ErrorEvent`
 * row for every unhandled request error since #508, and `/staff/errors` renders
 * the recent ones — but nothing anywhere ever asked *how many, how recently*, so
 * an error spike was visible only to someone who happened to open that page.
 * This is the half that makes the condition detectable.
 *
 * It imports nothing — no `@/lib/db`, no `next/headers`, no client of any kind —
 * for the same reason `lib/payment-sweep.ts` doesn't: a threshold comparison
 * should be testable without standing up a Prisma client and a job token just to
 * assert an inequality. The route above it holds the guard and the logging; this
 * holds the decision.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: deliver anything. Choosing a channel is
 * still open on #437, and the obvious one does not work yet — `lib/email.ts`
 * goes through Resend, which rejects recipients on unverified domains, and #104
 * (the verified sending domain) is unresolved. Shipping an email alert now would
 * produce a path that looks delivered and can never fire, which is exactly the
 * trap `JOB_INVOCATION_TOKEN` is already in: a scheduler deployed with a live
 * cron trigger invoking a job that refuses every tick. Detection first; the
 * channel when there is one that works.
 */

/**
 * The window over which errors are counted.
 *
 * Derived, not chosen: it equals the scheduler's cron interval declared in
 * `workers/scheduler/wrangler.toml` — every 15 minutes, the same value on all
 * three environments. (The literal cron expression is not quoted here: it
 * contains a slash-star sequence that would close this comment.) Matching them
 * exactly means consecutive ticks neither overlap — counting one error twice and
 * inventing a spike — nor leave a gap in which a burst goes unseen entirely.
 */
export const ERROR_RATE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Errors within the window at or above which the rate is treated as breached.
 *
 * UNLIKE THE WINDOW, THIS IS A JUDGEMENT CALL WITH NO PRINCIPLED DERIVATION
 * AVAILABLE YET, and it is written as a named constant so that stays visible.
 * Normal volume should be at or near zero, so ten unhandled request errors in
 * fifteen minutes is a deliberate, uncontroversial "something is wrong" rather
 * than a tuned figure. Tune it once #246 confirms whether logs are retained long
 * enough to establish a real baseline; until then there is nothing to tune
 * against and pretending otherwise would be false precision.
 */
export const ERROR_RATE_THRESHOLD = 10;

export interface ErrorRateSummary {
  /** Errors counted in the window. */
  count: number;
  /** Length of the window, in milliseconds. */
  windowMs: number;
  /** The count at or above which `breached` becomes true. */
  threshold: number;
  /** Start of the window — the bound the count was taken from. */
  since: string;
  /** Whether `count` reached `threshold`. */
  breached: boolean;
}

/**
 * Decides whether an observed error count breaches the threshold.
 *
 * The comparison is `>=`, not `>`: a threshold of ten means ten is already too
 * many, which is what "threshold" reads as to anyone tuning it later.
 */
export function evaluateErrorRate(
  count: number,
  since: Date,
  threshold: number = ERROR_RATE_THRESHOLD,
  windowMs: number = ERROR_RATE_WINDOW_MS,
): ErrorRateSummary {
  return {
    count,
    windowMs,
    threshold,
    since: since.toISOString(),
    breached: count >= threshold,
  };
}
