import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { getEnv, readEnv } from "@/lib/config";
import { getReferenceStatus } from "@/lib/reference/reference-status-service";
import { recordErrorEventDirect } from "@/lib/error-event-fallback";
import { normalizeCaughtError } from "@/lib/repositories/error-events";

export const dynamic = "force-dynamic";

/**
 * How a failed database round-trip is classified (#1289).
 *
 * Neon answers a project that is over its plan's quota with HTTP 402 and the
 * message "Your account or project has exceeded the quota." Until 2026-10-26 the
 * health check reported every database failure as an unclassified `degraded`
 * with a bare `db.error` string, so a quota outage — an owner action — looked
 * identical to a transient blip and nothing stood out to an operator, to
 * `wrangler tail` or to #437's scheduled error-rate check ("No alert fired").
 *
 * `"quota"` is reserved for that one distinguishable, owner-actionable state;
 * every other failure is `"unreachable"`, which keeps the parsing conservative:
 * a message that merely mentions a quota somewhere still needs the Neon wording
 * before it is treated as one.
 */
export type DbFailureReason = "quota" | "unreachable";

/** The exact Neon wording from the 402 response, matched case-insensitively. */
const QUOTA_MESSAGE_PATTERN = /exceeded the quota/i;

export function classifyDbFailure(error: unknown): DbFailureReason {
  const message = error instanceof Error ? error.message : String(error);
  return QUOTA_MESSAGE_PATTERN.test(message) ? "quota" : "unreachable";
}

/**
 * Best-effort record of a degraded health check on the `ErrorEvent` log (#508/#674),
 * which is the table #437's scheduled error-rate check counts. This is what turns
 * "no alert fired" into a signal a running system can see without a human watching.
 *
 * Goes through `lib/error-event-fallback.ts`'s fetch-based writer rather than Prisma:
 * the health check runs precisely because Prisma/Neon is the thing that failed, so
 * re-entering that path would fail the same way. `recordErrorEventDirect` never
 * throws or rejects, so it cannot turn a degraded report into a 500.
 */
async function recordDegradedHealth(error: unknown, reason: DbFailureReason): Promise<void> {
  const { message, stack, digest } = normalizeCaughtError(error);
  await recordErrorEventDirect({
    message: `health check degraded (${reason}): ${message}`,
    stack,
    digest,
    path: "/api/health",
    method: "GET",
    routerKind: "App Router",
    routeType: "route",
  });
}

export async function GET() {
  const body: Record<string, unknown> = {
    service: "aheed-online-store",
    status: "ok",
    time: new Date().toISOString(),
    // Set via `wrangler deploy --var GIT_COMMIT_SHA:...` in deploy-staging/production.yml;
    // unset locally (npm run preview/dev) and on any environment deployed manually.
    commit: readEnv("GIT_COMMIT_SHA") ?? null,
  };

  // 1) Real DB round-trip through Prisma -> Neon (the end-to-end proof).
  try {
    const row = await getPrisma().healthCheck.findFirst({ orderBy: { checkedAt: "desc" } });
    body.db = { ok: true, label: row?.label ?? null, checkedAt: row?.checkedAt ?? null };
  } catch (e) {
    const reason = classifyDbFailure(e);
    body.status = "degraded";
    body.db = { ok: false, reason, error: (e as Error).message };
    await recordDegradedHealth(e, reason);
  }

  // 2) Storage config presence (no network call in the smoke test — extend later).
  try {
    const env = getEnv();
    body.storage = {
      configured: Boolean(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY),
      cdnBase: env.CDN_BASE_URL ?? null,
    };
  } catch {
    body.storage = { configured: false };
  }

  // 3) Reference database (#771): configured, reachable, and whether materialised coverage matches
  // UK_LOCATION_REF_POSTCODE_AREAS in both directions.
  //
  // REPORTED, NEVER FATAL — `body.status` is deliberately untouched here. An absent or unsynced
  // reference database is a designed, recoverable state: the address surfaces degrade to manual
  // entry, and `lib/config.ts` declines to make these variables required-in-production for exactly
  // that reason. Failing the health check on it would invert that decision and make a provisioning
  // gap look like an outage.
  //
  // Reached through `lib/reference/` only (architecture §3.0, rule 1), and `getReferenceStatus()`
  // resolves in every failure mode rather than throwing — but the try/catch stays, because this
  // route's job is to report what it can, never to 500 on the way to saying so.
  try {
    body.reference = await getReferenceStatus();
  } catch (e) {
    body.reference = { configured: false, reachable: false, error: (e as Error).message };
  }

  return NextResponse.json(body, { status: body.status === "ok" ? 200 : 503 });
}
