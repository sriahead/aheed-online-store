import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  ERROR_EVENTS_LAST_AT_KEY,
  ERROR_SIGNAL_THROTTLE_MS,
  JOB_SIGNALS_BINDING,
  PAYMENT_SWEEP_DUE_AT_KEY,
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
