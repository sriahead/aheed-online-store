import { getJobsEnv, getPaymentEnv } from "@/lib/config";
import { timingSafeEqual } from "@/lib/stripe-webhook";
import { getPaymentSweepService } from "@/lib/payment-sweep-service";

export const dynamic = "force-dynamic";

/**
 * The scheduled stranded-payment sweep's entry point (P9.2, #618).
 *
 * Invoked by `workers/scheduler`, never by a browser. `requireVendorRole` — the
 * gate on `app/api/admin/jobs/backfill-images/route.ts` — cannot apply here
 * because a cron has no session, so a shared secret stands in its place.
 *
 * Deliberately thin: it proves the caller, refuses the two unsafe
 * configurations, and reports counts. Every decision about what to do with an
 * order lives in `lib/payment-sweep.ts`, where it is unit-testable without any
 * of this; the live clients are resolved one layer down in
 * `lib/payment-sweep-service.ts`, because `app/` may not import `@/lib/db`
 * (ADR-004 slice 2, enforced by `no-restricted-imports`).
 */

const JOB_TOKEN_HEADER = "x-job-token";

/**
 * `getJobsEnv()`/`getPaymentEnv()` THROW rather than returning an empty value
 * when their field is absent and `NODE_ENV === "production"` — and `NODE_ENV`
 * is unconditionally `"production"` in every BUILT Worker this route ever
 * actually runs in (`npm run preview`, staging, production alike; `next build`
 * bakes it in regardless of the deploy target). Without this, that throw fires
 * before either `if (!X)` check below ever runs, so the exact misconfiguration
 * those checks exist to answer with a clean 503 instead crashes as an uncaught
 * `ZodError` — a bare 500. Confirmed live at `/validate` (#618).
 */
function readOptional<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const JOB_INVOCATION_TOKEN = readOptional(getJobsEnv)?.JOB_INVOCATION_TOKEN;

  // Fail closed. An unset token in a deployed environment is a misconfiguration,
  // and running an unauthenticated sweep would be a worse answer than not
  // running one. Checked before any database or provider work.
  if (!JOB_INVOCATION_TOKEN) {
    console.error("payment sweep invoked but JOB_INVOCATION_TOKEN is unset");
    return Response.json({ error: "Job invocation is not configured" }, { status: 503 });
  }

  const supplied = request.headers.get(JOB_TOKEN_HEADER);
  if (!supplied || !timingSafeEqual(supplied, JOB_INVOCATION_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  /**
   * The stub payment adapter is a live hazard here, and the direction matters.
   *
   * `createStubPaymentService().retrieveSession` returns `paymentStatus:
   * "unpaid"` unconditionally. That is deliberate and correct for #454, whose
   * risk is CONFIRMING an order nobody paid for — a stub that never says "paid"
   * cannot do that. But this sweep's risk runs the other way: "unpaid" is the
   * answer that authorizes CANCELLING an order and restocking it. A sweep run
   * against the stub would treat every order in the store as an authoritative
   * "not paid".
   *
   * The `status === "open"` rule inside the sweep already means the stub can
   * never actually trigger a release, since the stub reports `open`. Relying on
   * that coincidence would be fragile, so the run is refused outright as well.
   */
  const STRIPE_SECRET_KEY = readOptional(getPaymentEnv)?.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    console.error("payment sweep refused: the stub payment adapter is active");
    return Response.json(
      { error: "Refusing to sweep against the stub payment adapter" },
      { status: 503 },
    );
  }

  const summary = await getPaymentSweepService().run();

  return Response.json(summary, { status: 200 });
}

/**
 * A sweep mutates orders, so it is POST-only. A GET reaching here is either a
 * misconfigured scheduler or someone probing; both should get an unambiguous
 * answer rather than a 404 that suggests the route does not exist.
 */
export function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
