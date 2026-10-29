/**
 * The job activity markers' shared vocabulary (#1324).
 *
 * Two Workers read and write the same Cloudflare KV namespace: the application
 * writes a marker when there is background work, and `workers/scheduler` reads
 * it before deciding whether to wake the database at all. Both import their key
 * names from HERE, so a renamed key cannot leave one side writing a key the
 * other never reads — that failure would be silent, because the scheduler would
 * simply skip the job forever.
 *
 * Deliberately free of runtime imports: the scheduler Worker bundles this file,
 * and it must not drag the application's config or database modules in with it.
 */

/** The binding name both `wrangler.toml` files give the namespace. */
export const JOB_SIGNALS_BINDING = "JOB_SIGNALS";

/**
 * When the payment sweep next has work, as an ISO instant. Absent means nothing
 * is pending, and the scheduler skips the sweep on its 15-minute tick.
 */
export const PAYMENT_SWEEP_DUE_AT_KEY = "payment-sweep:due-at";

/** When an `ErrorEvent` was last written, as an ISO instant. */
export const ERROR_EVENTS_LAST_AT_KEY = "error-events:last-at";

/**
 * How recent the last error must be for the tick to run the error-rate check:
 * the check's own 15-minute window (`ERROR_RATE_WINDOW_MS`) plus slack for cron
 * jitter and KV's up-to-a-minute propagation delay.
 */
export const ERROR_SIGNAL_WINDOW_MS = 20 * 60 * 1000;

/**
 * The error marker is rewritten at most this often. KV's free tier allows 1,000
 * writes a day; an error storm writing on every event would exhaust that in
 * minutes, while one write per 5 minutes caps the key at 288 a day.
 */
export const ERROR_SIGNAL_THROTTLE_MS = 5 * 60 * 1000;

/**
 * How far ahead a new checkout marks the sweep due: the 35-minute Checkout
 * Session lifetime (`CHECKOUT_SESSION_TTL_MS`) plus a 5-minute margin, so the
 * first sweep to see the order gets a definitive paid-or-expired answer.
 */
export const CHECKOUT_SWEEP_DELAY_MS = 40 * 60 * 1000;
