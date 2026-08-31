import type { Instrumentation } from "next";

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
};
