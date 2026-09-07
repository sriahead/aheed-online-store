import { getJobsEnv, readOptional } from "@/lib/config";
import { timingSafeEqual } from "@/lib/stripe-webhook";
import { getGuestCartReaperService } from "@/lib/guest-cart-reaper-service";

export const dynamic = "force-dynamic";

/**
 * The scheduled abandoned-guest-cart reaper's entry point (P9.2, #94).
 *
 * Invoked by `workers/scheduler`, never by a browser. `requireVendorRole` — the
 * gate on `app/api/admin/jobs/backfill-images/route.ts` — cannot apply here
 * because a cron has no session, so a shared secret stands in its place. Guard
 * shape is deliberately identical to
 * `app/api/jobs/reconcile-payments/route.ts`: two jobs that authenticate
 * differently would be two things to get right.
 *
 * Deliberately thin. Which carts are stale, and what the retention window even
 * is, live in `lib/repositories/cart.ts`; the live client is resolved one layer
 * down in `lib/guest-cart-reaper-service.ts`, because `app/` may not import
 * `@/lib/db` (ADR-004 slice 2, enforced by `no-restricted-imports`).
 *
 * Unlike the payment sweep, this job has no provider to disagree with and no
 * stub-adapter hazard: it reads its own rows and deletes its own rows, so there
 * is no second unsafe configuration to refuse.
 */

const JOB_TOKEN_HEADER = "x-job-token";

export async function POST(request: Request) {
  // `readOptional` because `getJobsEnv()` throws when the token is absent —
  // see its docstring in `@/lib/config` (#621). Without it the 503 below is
  // unreachable and this returns a bare, uncaught 500 instead.
  const JOB_INVOCATION_TOKEN = readOptional(getJobsEnv)?.JOB_INVOCATION_TOKEN;

  // Fail closed. An unset token in a deployed environment is a
  // misconfiguration, and running an unauthenticated job that DELETES rows
  // would be a considerably worse answer than not running one.
  if (!JOB_INVOCATION_TOKEN) {
    console.error("guest cart reaper invoked but JOB_INVOCATION_TOKEN is unset");
    return Response.json({ error: "Job invocation is not configured" }, { status: 503 });
  }

  const supplied = request.headers.get(JOB_TOKEN_HEADER);
  if (!supplied || !timingSafeEqual(supplied, JOB_INVOCATION_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await getGuestCartReaperService().run();

  return Response.json(summary, { status: 200 });
}

/**
 * The reaper deletes rows, so it is POST-only. A GET reaching here is either a
 * misconfigured scheduler or someone probing; both should get an unambiguous
 * answer rather than a 404 that suggests the route does not exist.
 */
export function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
