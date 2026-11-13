import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  CONTACT_OUTBOX_PENDING_KEY,
  DB_WARMUP_LAST_ACTIVITY_KEY,
  DB_WARMUP_LAST_PING_KEY,
  DB_WARMUP_SCHEDULE_KEY,
  ERROR_EVENTS_LAST_AT_KEY,
  ERROR_RATE_ALERT_COOLDOWN_MS,
  ERROR_RATE_ALERT_LAST_AT_KEY,
  ERROR_SIGNAL_THROTTLE_MS,
  JOB_SIGNALS_BINDING,
  NOTIFICATION_OUTBOX_PENDING_KEY,
  PAYMENT_SWEEP_DUE_AT_KEY,
  WARMUP_ACTIVITY_THROTTLE_MS,
} from "@/lib/job-signal-keys";

/**
 * The application's half of the job activity markers (#1324): the only module
 * under `app/`, `lib/`, `features/` or `components/` that touches the
 * `JOB_SIGNALS` KV namespace. `workers/scheduler` reads what this writes and
 * calls a job only when there is work, so an idle store stops waking Neon every
 * fifteen minutes.
 *
 * NOTHING HERE MAY FAIL ITS CALLER. A marker is an optimisation of when a job
 * runs, never a condition of the work that wrote it: a checkout, an error
 * capture or a staff action must complete identically whether KV is bound,
 * unbound, or throwing. So every export resolves, always. An absent binding is
 * the normal state of an environment whose namespace the owner has not created
 * yet, and is silent; a KV call that throws is logged, because that one means a
 * marker the scheduler relies on may now be missing.
 *
 * The other half of that guarantee lives in the scheduler: a marker that is
 * missing because a write failed makes the scheduler SKIP a job, so the daily
 * ungated run (`0 3 * * *`) is what bounds the cost of a lost write to a day.
 *
 * Behind this one module, per `specs/architecture.md`'s "optional edge KV behind
 * a port": swapping KV for another store is a change here and in the scheduler,
 * nowhere else.
 */

/** The three KV methods this module uses — what a test double has to provide. */
export interface SignalStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** The bound namespace, or null outside a Worker request or when it is not bound. */
function resolveStore(): SignalStore | null {
  try {
    const { env } = getCloudflareContext();
    const store = (env as Record<string, unknown>)[JOB_SIGNALS_BINDING];
    return store ? (store as SignalStore) : null;
  } catch {
    // Not inside a Worker request context (a Node script, a unit test, `next dev`).
    return null;
  }
}

function logFailure(operation: string, key: string, error: unknown): void {
  console.error(
    `job-signal ${operation} of ${key} failed: ${error instanceof Error ? error.message : String(error)}`,
  );
}

/** A stored instant, or null when absent or unparseable. */
function parseStored(value: string | null): number | null {
  if (value === null) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
}

/**
 * Brings the sweep's due time forward to `at`, never back. Writes only when
 * nothing usable is stored or the stored instant is later than `at`: a new
 * checkout must not push back an order that is already due sooner.
 *
 * Read-then-write, not atomic. A lost race delays an order by at most the gap
 * between the two values, and the sweep rewrites the key from the database at
 * the end of every run anyway.
 */
export async function markPaymentSweepDue(at: Date): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  try {
    const stored = parseStored(await store.get(PAYMENT_SWEEP_DUE_AT_KEY));
    if (stored !== null && stored <= at.getTime()) return;
    await store.put(PAYMENT_SWEEP_DUE_AT_KEY, at.toISOString());
  } catch (error) {
    logFailure("mark", PAYMENT_SWEEP_DUE_AT_KEY, error);
  }
}

/**
 * The sweep's authoritative answer, computed from the database at the end of a
 * run: the instant it next has work, or `null` (the key is deleted) when nothing
 * is pending. Unconditional — this is the value every earlier race resolves to.
 */
export async function setPaymentSweepDue(at: Date | null): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  try {
    if (at === null) await store.delete(PAYMENT_SWEEP_DUE_AT_KEY);
    else await store.put(PAYMENT_SWEEP_DUE_AT_KEY, at.toISOString());
  } catch (error) {
    logFailure("set", PAYMENT_SWEEP_DUE_AT_KEY, error);
  }
}

/**
 * Records that an `ErrorEvent` was written, at most once per
 * `ERROR_SIGNAL_THROTTLE_MS` — an error storm must not spend KV's daily write
 * allowance, and the scheduler's 20-minute window only needs one write in five
 * minutes to stay open.
 */
export async function markErrorEvent(now: Date): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  try {
    const stored = parseStored(await store.get(ERROR_EVENTS_LAST_AT_KEY));
    if (stored !== null && stored >= now.getTime() - ERROR_SIGNAL_THROTTLE_MS) return;
    await store.put(ERROR_EVENTS_LAST_AT_KEY, now.toISOString());
  } catch (error) {
    logFailure("mark", ERROR_EVENTS_LAST_AT_KEY, error);
  }
}

/**
 * #1552 — whether the error-rate alert may go out now, recording it when it may. False only when a
 * successful read shows an alert inside the cooldown; no binding, or a failing KV, says yes, because
 * a missed alert is worse than a repeated one (the job runs at most every 15 minutes).
 */
export async function claimErrorRateAlert(now: Date): Promise<boolean> {
  const store = resolveStore();
  if (!store) return true;
  try {
    const stored = parseStored(await store.get(ERROR_RATE_ALERT_LAST_AT_KEY));
    if (stored !== null && stored > now.getTime() - ERROR_RATE_ALERT_COOLDOWN_MS) return false;
    await store.put(ERROR_RATE_ALERT_LAST_AT_KEY, now.toISOString());
  } catch (error) {
    logFailure("claim", ERROR_RATE_ALERT_LAST_AT_KEY, error);
  }
  return true;
}

/**
 * #1409 — a contact-form email failed and was queued, or the retry job left rows behind. One write
 * per call: contact submissions are rare, so no throttle is needed.
 */
export async function markContactOutboxPending(): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  try {
    await store.put(CONTACT_OUTBOX_PENDING_KEY, new Date().toISOString());
  } catch (error) {
    logFailure("mark", CONTACT_OUTBOX_PENDING_KEY, error);
  }
}

/** #1409 — the retry job emptied the outbox. */
export async function clearContactOutboxPending(): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  try {
    await store.delete(CONTACT_OUTBOX_PENDING_KEY);
  } catch (error) {
    logFailure("clear", CONTACT_OUTBOX_PENDING_KEY, error);
  }
}

/**
 * #1435 — an order-notification message failed and was queued, or the retry job left rows behind.
 * One write per dispatch that queued anything, never per message.
 */
export async function markNotificationOutboxPending(): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  try {
    await store.put(NOTIFICATION_OUTBOX_PENDING_KEY, new Date().toISOString());
  } catch (error) {
    logFailure("mark", NOTIFICATION_OUTBOX_PENDING_KEY, error);
  }
}

/** #1435 — the retry job emptied the outbox. */
export async function clearNotificationOutboxPending(): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  try {
    await store.delete(NOTIFICATION_OUTBOX_PENDING_KEY);
  } catch (error) {
    logFailure("clear", NOTIFICATION_OUTBOX_PENDING_KEY, error);
  }
}

/**
 * #1491 — the database warm-up's three keys. Same rule as every marker here: never fails its caller.
 * The scheduler reads these on its every-4-minutes tick and never reads the database to decide.
 */

/** Publish the computed schedule (`lib/db-warmup/payload.ts` JSON). Unconditional. */
export async function putWarmupSchedule(value: string): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  try {
    await store.put(DB_WARMUP_SCHEDULE_KEY, value);
  } catch (error) {
    logFailure("put", DB_WARMUP_SCHEDULE_KEY, error);
  }
}

/** A ping reached the database. Never touches the activity key: a ping is not activity. */
export async function markWarmupPing(now: Date): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  try {
    await store.put(DB_WARMUP_LAST_PING_KEY, now.toISOString());
  } catch (error) {
    logFailure("mark", DB_WARMUP_LAST_PING_KEY, error);
  }
}

/**
 * A signed-in request was served. Throttled: written only when nothing usable is stored or the stored
 * instant is older than `WARMUP_ACTIVITY_THROTTLE_MS`, so a busy cell costs one read per request and
 * at most one write per throttle period. No database access, ever.
 */
export async function markWarmupActivity(
  now: Date,
  storeOverride?: SignalStore | null,
): Promise<void> {
  const store = storeOverride === undefined ? resolveStore() : storeOverride;
  if (!store) return;
  try {
    const stored = parseStored(await store.get(DB_WARMUP_LAST_ACTIVITY_KEY));
    if (stored !== null && now.getTime() - stored < WARMUP_ACTIVITY_THROTTLE_MS) return;
    await store.put(DB_WARMUP_LAST_ACTIVITY_KEY, now.toISOString());
  } catch (error) {
    logFailure("mark", DB_WARMUP_LAST_ACTIVITY_KEY, error);
  }
}

/** For the admin page: the last ping and last recorded activity, null when absent or unreadable. */
export async function readWarmupStatus(): Promise<{
  lastPing: Date | null;
  lastActivity: Date | null;
}> {
  const store = resolveStore();
  if (!store) return { lastPing: null, lastActivity: null };
  const read = async (key: string): Promise<Date | null> => {
    try {
      const at = parseStored(await store.get(key));
      return at === null ? null : new Date(at);
    } catch (error) {
      logFailure("read", key, error);
      return null;
    }
  };
  return {
    lastPing: await read(DB_WARMUP_LAST_PING_KEY),
    lastActivity: await read(DB_WARMUP_LAST_ACTIVITY_KEY),
  };
}
