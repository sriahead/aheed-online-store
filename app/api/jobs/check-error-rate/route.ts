import { getJobsEnv, readOptional } from "@/lib/config";
import { timingSafeEqual } from "@/lib/stripe-webhook";
import { getErrorRateService } from "@/lib/error-rate-service";

export const dynamic = "force-dynamic";

/**
 * The scheduled error-rate check's entry point (P9.2, #437 — code tail only).
 *
 * Invoked by `workers/scheduler`, never by a browser. Guard shape is deliberately
 * identical to `app/api/jobs/reconcile-payments/route.ts` and
 * `app/api/jobs/reap-guest-carts/route.ts`; three jobs authenticating three
 * different ways would be three things to get right.
 *
 * WHAT THIS ROUTE IS FOR. `ErrorEvent` rows have been written for every
 * unhandled request error since #508, and read by nothing but `/staff/errors`.
 * A spike was therefore visible only to someone who happened to look. This makes
 * it detectable on a schedule.
 *
 * WHERE THE ALERT GOES: nowhere yet, deliberately. Picking a delivery channel is
 * still open on #437, and the obvious one is currently inert — `lib/email.ts`
 * sends through Resend, which rejects recipients on unverified domains, and #104
 * (the verified sending domain) is unresolved. An email alert shipped today
 * would look delivered and never fire. So the breach is emitted as a structured
 * log line and returned in the response body, which `workers/scheduler` already
 * logs verbatim for every job on every tick — no new mechanism, and nothing that
 * pretends to a reliability it does not have.
 */

const JOB_TOKEN_HEADER = "x-job-token";

/**
 * Fixed prefix so the line is greppable in `wrangler tail`, in Workers Logs and
 * in local preview's Explorer API. Kept as a constant rather than inlined
 * because the whole value of a structured log line is that the string does not
 * drift.
 */
const ALERT_PREFIX = "error-rate alert:";

export async function POST(request: Request) {
  // `readOptional` because `getJobsEnv()` throws when the token is absent — see
  // its docstring in `@/lib/config` (#621).
  const JOB_INVOCATION_TOKEN = readOptional(getJobsEnv)?.JOB_INVOCATION_TOKEN;

  // Fail closed, matching the other jobs. This one only reads, so an
  // unauthenticated run would leak an error count rather than mutate anything —
  // still not something to expose on an unauthenticated endpoint.
  if (!JOB_INVOCATION_TOKEN) {
    console.error("error rate check invoked but JOB_INVOCATION_TOKEN is unset");
    return Response.json({ error: "Job invocation is not configured" }, { status: 503 });
  }

  const supplied = request.headers.get(JOB_TOKEN_HEADER);
  if (!supplied || !timingSafeEqual(supplied, JOB_INVOCATION_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await getErrorRateService().check();

  // Exactly one line, and only when breached. A log line emitted on every tick
  // would be noise that trains a reader to ignore it, which is worse than no
  // line at all.
  if (summary.breached) {
    console.error(
      `${ALERT_PREFIX} count=${summary.count} threshold=${summary.threshold} windowMs=${summary.windowMs} since=${summary.since}`,
    );
  }

  return Response.json(summary, { status: 200 });
}

/**
 * POST-only for consistency with the other two jobs, even though this one only
 * reads: a GET reaching here is a misconfigured scheduler or someone probing,
 * and both should get an unambiguous answer rather than a 404.
 */
export function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
