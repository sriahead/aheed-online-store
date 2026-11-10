import { ERROR_SIGNAL_WINDOW_MS } from "../../../lib/job-signal-keys";
import { decideWarmup, type WarmupReason } from "../../../lib/db-warmup/payload";

/**
 * Which jobs a scheduler invocation calls (#1324).
 *
 * Pure, and in its own module rather than `index.ts`, so the Worker entry keeps
 * its single default export and this table is testable with no KV, no fetch and
 * no clock.
 *
 * THE RULE THAT MATTERS: EVERY DOUBT RUNS THE JOB. A failed read, or a value
 * that does not parse, calls the job exactly as the ungated scheduler did. A
 * gate that failed closed would turn a KV outage into payments silently never
 * reconciling — the same invisible failure `JOB_INVOCATION_TOKEN` drift already
 * is (see `docs/developer-portal/env-setup.md`). Only a successful read saying
 * "nothing to do" skips anything.
 */

export const SWEEP_PATH = "/api/jobs/reconcile-payments";
export const REAPER_PATH = "/api/jobs/reap-guest-carts";
export const ERROR_RATE_PATH = "/api/jobs/check-error-rate";
export const CONTACT_OUTBOX_PATH = "/api/jobs/retry-contact-outbox";
export const NOTIFICATION_OUTBOX_PATH = "/api/jobs/retry-notification-outbox";

/** The once-a-day ungated run: the backstop for every race in the markers. */
export const DAILY_CRON = "0 3 * * *";

/**
 * #1491 — the database warm-up tick. Every 4 minutes because Neon suspends after 5 with no query; the
 * 15-minute tick is too slow and is left untouched. This cron runs NOTHING but the warm-up ping.
 */
export const WARMUP_CRON = "*/4 * * * *";
export const WARM_DB_PATH = "/api/jobs/warm-db";
/** Republishes the warm-up windows on the daily run, so the 8-day schedule never goes stale. */
export const REFRESH_WARMUP_PATH = "/api/jobs/refresh-warmup-schedule";

/** One KV read: its value (absent is `null`), or that the read itself failed. */
export type SignalRead = { ok: true; value: string | null } | { ok: false };

/** `null` when the read succeeded and nothing is stored; `NaN` when unparseable. */
function instantOf(read: Extract<SignalRead, { ok: true }>): number | null {
  return read.value === null ? null : Date.parse(read.value);
}

function sweepIsDue(read: SignalRead, now: Date): boolean {
  if (!read.ok) return true;
  const at = instantOf(read);
  if (at === null) return false;
  return Number.isNaN(at) || at <= now.getTime();
}

/**
 * #1409 — any stored value means a queued contact email; an absent key means none. #1435 reads its
 * `notification-outbox:pending` marker through the same rule.
 */
function outboxHasRows(read: SignalRead): boolean {
  if (!read.ok) return true;
  return read.value !== null;
}

function errorsAreRecent(read: SignalRead, now: Date): boolean {
  if (!read.ok) return true;
  const at = instantOf(read);
  if (at === null) return false;
  return Number.isNaN(at) || at >= now.getTime() - ERROR_SIGNAL_WINDOW_MS;
}

export function selectJobs(input: {
  cron: string;
  now: Date;
  paymentDueAt: SignalRead;
  errorLastAt: SignalRead;
  contactOutboxPending: SignalRead;
  notificationOutboxPending: SignalRead;
}): string[] {
  if (input.cron === DAILY_CRON) {
    return [
      SWEEP_PATH,
      REAPER_PATH,
      ERROR_RATE_PATH,
      CONTACT_OUTBOX_PATH,
      NOTIFICATION_OUTBOX_PATH,
      REFRESH_WARMUP_PATH,
    ];
  }

  // The warm-up tick is decided by selectWarmupJobs below, never here.
  if (input.cron === WARMUP_CRON) return [];

  // The guest-cart reaper is housekeeping nobody waits on, so it never runs on
  // the tick — only in the daily run above.
  const jobs: string[] = [];
  if (sweepIsDue(input.paymentDueAt, input.now)) jobs.push(SWEEP_PATH);
  if (errorsAreRecent(input.errorLastAt, input.now)) jobs.push(ERROR_RATE_PATH);
  if (outboxHasRows(input.contactOutboxPending)) jobs.push(CONTACT_OUTBOX_PATH);
  if (outboxHasRows(input.notificationOutboxPending)) jobs.push(NOTIFICATION_OUTBOX_PATH);
  return jobs;
}

/** Every path the scheduler can call, in invocation order — for the tick's log line. */
export const ALL_JOB_PATHS: readonly string[] = [
  SWEEP_PATH,
  REAPER_PATH,
  ERROR_RATE_PATH,
  CONTACT_OUTBOX_PATH,
  NOTIFICATION_OUTBOX_PATH,
  REFRESH_WARMUP_PATH,
];

/**
 * #1491 R11 — the warm-up tick's decision. THE RULE IS INVERTED HERE: every doubt SKIPS. The other
 * jobs run when a marker cannot be read because missing a payment sweep is harmful; a missed ping
 * costs one cold start, while a ping stuck "on" costs compute all night. So an unreadable, absent,
 * stale or malformed schedule, or an unreadable activity marker, means no ping.
 */
export function selectWarmupJobs(input: {
  now: Date;
  schedule: SignalRead;
  lastActivity: SignalRead;
}): { jobs: string[]; reason: WarmupReason } {
  const { ping, reason } = decideWarmup(input);
  return { jobs: ping ? [WARM_DB_PATH] : [], reason };
}
