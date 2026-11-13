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

/**
 * #1409 — present (an ISO instant) while a failed contact-form email waits in `ContactOutbox`.
 * Absent means the outbox is empty, and the tick skips the retry job.
 */
export const CONTACT_OUTBOX_PENDING_KEY = "contact-outbox:pending";

/**
 * #1435 — present (an ISO instant) while a failed order-notification message waits in
 * `NotificationOutbox`. Absent means the outbox is empty, and the tick skips the retry job.
 */
export const NOTIFICATION_OUTBOX_PENDING_KEY = "notification-outbox:pending";

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

/** #1552 — when the error-rate Telegram alert last went out, as an ISO instant. */
export const ERROR_RATE_ALERT_LAST_AT_KEY = "error-rate:last-alert-at";

/** #1552 — at most one error-rate alert per hour: a sustained breach must not page every tick. */
export const ERROR_RATE_ALERT_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * How far ahead a new checkout marks the sweep due: the 35-minute Checkout
 * Session lifetime (`CHECKOUT_SESSION_TTL_MS`) plus a 5-minute margin, so the
 * first sweep to see the order gets a definitive paid-or-expired answer.
 */
export const CHECKOUT_SWEEP_DELAY_MS = 40 * 60 * 1000;

/**
 * #1491 — the database warm-up. The scheduler's every-4-minutes tick reads these and pings the database only
 * while the published schedule (or recent signed-in activity) says so; it never reads the database to
 * decide. Written only by `lib/job-signals.ts`.
 *
 * `db-warmup:schedule`: the JSON payload of `lib/db-warmup/payload.ts`, republished on every config
 * or opening-hours save and daily. `db-warmup:last-ping`: ISO instant of the last ping.
 * `db-warmup:last-activity`: ISO instant of the last signed-in request (a ping never writes it).
 */
export const DB_WARMUP_SCHEDULE_KEY = "db-warmup:schedule";
export const DB_WARMUP_LAST_PING_KEY = "db-warmup:last-ping";
export const DB_WARMUP_LAST_ACTIVITY_KEY = "db-warmup:last-activity";

/**
 * The activity marker is rewritten at most this often. Against a 30-minute activity window and a
 * 4-minute tick, 3 minutes loses no accuracy and caps a continuously busy cell at 480 writes a day
 * (KV's free tier allows 1,000 a day per account).
 */
export const WARMUP_ACTIVITY_THROTTLE_MS = 3 * 60 * 1000;

/** Neon suspends a compute after this long with no active query (Launch plan, fixed). */
export const NEON_SUSPEND_AFTER_MS = 5 * 60 * 1000;
