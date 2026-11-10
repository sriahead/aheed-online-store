import { getJobsEnv, readOptional } from "@/lib/config";
import { timingSafeEqual } from "@/lib/stripe-webhook";
import { warmDatabase } from "@/lib/db-warmup-ping";

export const dynamic = "force-dynamic";

/**
 * #1491 R9 — the database warm-up ping. Invoked by `workers/scheduler` on its every-4-minutes tick,
 * only while the published schedule (or recent signed-in activity) says so; never by a browser. One
 * trivial query on the MAIN database keeps Neon from suspending; the postcode reference database is
 * deliberately not touched. The guard is identical to the other job routes: fail closed with no token,
 * 401 on a wrong one.
 */

const JOB_TOKEN_HEADER = "x-job-token";

export async function POST(request: Request) {
  // `readOptional` because `getJobsEnv()` throws when the token is absent (#621).
  const JOB_INVOCATION_TOKEN = readOptional(getJobsEnv)?.JOB_INVOCATION_TOKEN;

  if (!JOB_INVOCATION_TOKEN) {
    console.error("db warm-up invoked but JOB_INVOCATION_TOKEN is unset");
    return Response.json({ error: "Job invocation is not configured" }, { status: 503 });
  }

  const supplied = request.headers.get(JOB_TOKEN_HEADER);
  if (!supplied || !timingSafeEqual(supplied, JOB_INVOCATION_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await warmDatabase();
  return Response.json(result, { status: 200 });
}

/** It writes a KV marker, so it is POST-only. */
export function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
