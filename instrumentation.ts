import type { Instrumentation } from "next";
import { getPrismaUncached } from "@/lib/db";
import { normalizeCaughtError, recordErrorEvent } from "@/lib/repositories/error-events";
import { recordErrorEventDirect } from "@/lib/error-event-fallback";

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
  const payload = {
    ...normalizeCaughtError(error),
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routeType: context.routeType,
  };

  try {
    await recordErrorEvent(getPrismaUncached(), payload);
  } catch (writeError) {
    console.error("Failed to persist ErrorEvent:", writeError);

    // #674 — the Prisma path builds a fresh PrismaClient, and therefore a fresh
    // WASM QueryCompiler. When the original error came from that constructor,
    // this handler re-enters the code path that just threw and can never
    // succeed, so the row is lost exactly when it matters most. The fallback is
    // fetch-based and shares none of that machinery.
    //
    // It is documented and tested never to throw, returning `false` instead.
    // The catch is here anyway because this handler's one hard guarantee is that
    // it never compounds the error it was called about: if the fallback ever
    // breaks its own contract, that has to degrade to a log line rather than
    // reject out of `onRequestError`.
    try {
      if (!(await recordErrorEventDirect(payload))) {
        console.error("Failed to persist ErrorEvent via fallback:", payload);
      }
    } catch (fallbackError) {
      console.error("Failed to persist ErrorEvent via fallback:", fallbackError);
    }
  }
};
