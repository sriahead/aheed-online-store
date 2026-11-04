import { getJobsEnv, readOptional } from "@/lib/config";
import { timingSafeEqual } from "@/lib/stripe-webhook";
import { getContactOutboxService } from "@/lib/contact-service";

export const dynamic = "force-dynamic";

/**
 * The contact-form outbox retry job (#1409 R20).
 *
 * Invoked by `workers/scheduler`, never by a browser: on the 15-minute tick while the
 * `contact-outbox:pending` marker is set, and on the daily run. The guard is deliberately identical
 * to `app/api/jobs/reap-guest-carts/route.ts`: fail closed with no token, 401 on a wrong one.
 * What it sends, deletes and expires lives in `lib/contact-service.ts`.
 */

const JOB_TOKEN_HEADER = "x-job-token";

export async function POST(request: Request) {
  // `readOptional` because `getJobsEnv()` throws when the token is absent (#621).
  const JOB_INVOCATION_TOKEN = readOptional(getJobsEnv)?.JOB_INVOCATION_TOKEN;

  if (!JOB_INVOCATION_TOKEN) {
    console.error("contact outbox retry invoked but JOB_INVOCATION_TOKEN is unset");
    return Response.json({ error: "Job invocation is not configured" }, { status: 503 });
  }

  const supplied = request.headers.get(JOB_TOKEN_HEADER);
  if (!supplied || !timingSafeEqual(supplied, JOB_INVOCATION_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await getContactOutboxService().run();
  return Response.json(summary, { status: 200 });
}

/** It sends and deletes, so it is POST-only. */
export function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
