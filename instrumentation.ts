import type { Instrumentation } from "next";
import { getPrismaUncached } from "@/lib/db";
import { normalizeCaughtError, recordErrorEvent } from "@/lib/repositories/error-events";

/**
 * Server-side error capture (#480 fix, R7). An error boundary's own `console.error`
 * (app/error.tsx, app/global-error.tsx, app/(storefront)/error.tsx, app/(admin)/error.tsx)
 * runs inside a `useEffect` in a Client Component, so it only ever executes in the visitor's
 * browser — it structurally cannot reach `wrangler tail` or Workers Logs. This hook is what
 * actually gives the Worker visibility into an error one of those boundaries is about to
 * display, since Next.js invokes it server-side, once, for every request whose render/route/
 * action throws — independent of which boundary catches it client-side afterwards.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  console.error("Unhandled request error:", {
    path: request.path,
    routerKind: context.routerKind,
    routeType: context.routeType,
    error,
  });

  // #508 — a second, DB-backed capture path independent of Cloudflare Workers Logs (#246,
  // unconfirmed queryable). Never allowed to affect the request: a failure here (missing config,
  // a database outage — plausibly the very thing that caused the original error) is swallowed,
  // not re-thrown, so this degrades to exactly the console.error above rather than compounding
  // whatever already went wrong.
  try {
    const normalized = normalizeCaughtError(error);
    await recordErrorEvent(getPrismaUncached(), {
      ...normalized,
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,
      routeType: context.routeType,
    });
  } catch (writeError) {
    console.error("Failed to persist ErrorEvent:", writeError);
  }
};
