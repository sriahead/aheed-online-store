import { ERROR_SIGNAL_WINDOW_MS } from "../../../lib/job-signal-keys";

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

/** The once-a-day ungated run: the backstop for every race in the markers. */
export const DAILY_CRON = "0 3 * * *";

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
}): string[] {
  if (input.cron === DAILY_CRON) return [SWEEP_PATH, REAPER_PATH, ERROR_RATE_PATH];

  // The guest-cart reaper is housekeeping nobody waits on, so it never runs on
  // the tick — only in the daily run above.
  const jobs: string[] = [];
  if (sweepIsDue(input.paymentDueAt, input.now)) jobs.push(SWEEP_PATH);
  if (errorsAreRecent(input.errorLastAt, input.now)) jobs.push(ERROR_RATE_PATH);
  return jobs;
}

/** Every path the scheduler can call, in invocation order — for the tick's log line. */
export const ALL_JOB_PATHS: readonly string[] = [SWEEP_PATH, REAPER_PATH, ERROR_RATE_PATH];
