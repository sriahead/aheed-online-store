/**
 * #1491 — the `db-warmup:schedule` KV value, shared by the app (which writes it) and
 * `workers/scheduler` (which reads it). Pure and import-free on purpose: the scheduler imports this
 * file by relative path, like `lib/job-signal-keys.ts`, and cannot resolve `@/` aliases.
 *
 * The scheduler decides whether to ping from this value and two KV instants alone, never from the
 * database — deciding must not be what wakes it.
 */

export interface WarmupSchedulePayload {
  v: 1;
  enabled: boolean;
  activityEnabled: boolean;
  activityMinutes: number;
  /** `[startIso, endIso]` pairs, sorted and non-overlapping. */
  windows: [string, string][];
  /** After this instant the payload is stale and the scheduler must not act on it. */
  validUntil: string;
  generatedAt: string;
}

export function serializeWarmupSchedule(payload: WarmupSchedulePayload): string {
  return JSON.stringify(payload);
}

/**
 * The payload, or null when the value is absent, not JSON, the wrong version, or malformed in any
 * field. Null always means "do not ping" to the scheduler.
 */
export function parseWarmupSchedule(value: string | null): WarmupSchedulePayload | null {
  if (value === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.v !== 1) return null;
  if (typeof p.enabled !== "boolean" || typeof p.activityEnabled !== "boolean") return null;
  if (typeof p.activityMinutes !== "number" || !Number.isFinite(p.activityMinutes)) return null;
  if (typeof p.validUntil !== "string" || Number.isNaN(Date.parse(p.validUntil))) return null;
  if (typeof p.generatedAt !== "string") return null;
  if (!Array.isArray(p.windows)) return null;
  for (const w of p.windows) {
    if (!Array.isArray(w) || w.length !== 2) return null;
    if (typeof w[0] !== "string" || typeof w[1] !== "string") return null;
    if (Number.isNaN(Date.parse(w[0])) || Number.isNaN(Date.parse(w[1]))) return null;
  }
  return p as unknown as WarmupSchedulePayload;
}

export type WarmupReason =
  | "in-window"
  | "recent-activity"
  | "outside-window"
  | "disabled"
  | "no-schedule"
  | "stale"
  | "unreadable";

/**
 * Whether the warm-up tick should ping, and why. EVERY DOUBT SKIPS — the opposite of the scheduler's
 * other jobs: a missed ping costs one cold start, a stuck ping costs compute all night.
 *
 * `schedule` / `lastActivity` are the raw KV reads: `{ ok: false }` when the read itself failed.
 */
export function decideWarmup(input: {
  now: Date;
  schedule: { ok: true; value: string | null } | { ok: false };
  lastActivity: { ok: true; value: string | null } | { ok: false };
}): { ping: boolean; reason: WarmupReason } {
  if (!input.schedule.ok) return { ping: false, reason: "unreadable" };
  if (input.schedule.value === null) return { ping: false, reason: "no-schedule" };
  const payload = parseWarmupSchedule(input.schedule.value);
  if (!payload) return { ping: false, reason: "unreadable" };
  if (!payload.enabled) return { ping: false, reason: "disabled" };

  const now = input.now.getTime();
  if (now >= Date.parse(payload.validUntil)) return { ping: false, reason: "stale" };

  for (const [start, end] of payload.windows) {
    if (now >= Date.parse(start) && now < Date.parse(end))
      return { ping: true, reason: "in-window" };
  }

  if (payload.activityEnabled && input.lastActivity.ok && input.lastActivity.value !== null) {
    const at = Date.parse(input.lastActivity.value);
    if (!Number.isNaN(at) && at <= now && now - at <= payload.activityMinutes * 60_000) {
      return { ping: true, reason: "recent-activity" };
    }
  }
  return { ping: false, reason: "outside-window" };
}
