import { getJobsEnv, readOptional } from "@/lib/config";
import { timingSafeEqual } from "@/lib/stripe-webhook";
import { publishWarmupSchedule } from "@/lib/db-warmup-service";

export const dynamic = "force-dynamic";

/**
 * #1491 R8 — recompute the database warm-up windows and republish them to KV. Called by the
 * scheduler's daily run, so the 8-day schedule never goes stale even when nobody saves anything. Same
 * guard as every job route.
 */

const JOB_TOKEN_HEADER = "x-job-token";

export async function POST(request: Request) {
  const JOB_INVOCATION_TOKEN = readOptional(getJobsEnv)?.JOB_INVOCATION_TOKEN;

  if (!JOB_INVOCATION_TOKEN) {
    console.error("warm-up schedule refresh invoked but JOB_INVOCATION_TOKEN is unset");
    return Response.json({ error: "Job invocation is not configured" }, { status: 503 });
  }

  const supplied = request.headers.get(JOB_TOKEN_HEADER);
  if (!supplied || !timingSafeEqual(supplied, JOB_INVOCATION_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { windows } = await publishWarmupSchedule();
  return Response.json({ ok: true, windows }, { status: 200 });
}

export function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
