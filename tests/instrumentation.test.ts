import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "@/instrumentation";

/**
 * R7 fix (#480). An error boundary's own `console.error` runs inside a `useEffect`
 * in a Client Component (see tests/error-boundary.test.tsx), so it only ever executes
 * in the visitor's browser — it structurally cannot reach `wrangler tail`/Workers Logs.
 * `onRequestError` is what actually gives the Worker server-side visibility: Next.js
 * calls it once per request whose render/route/action throws, regardless of which
 * boundary displays the fallback.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

it("logs the raw error and request context server-side, exactly once", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const error = new Error("boom");

  onRequestError(
    error,
    { path: "/staff", method: "GET", headers: {} },
    {
      routerKind: "App Router",
      routePath: "/staff",
      routeType: "render",
      revalidateReason: undefined,
    },
  );

  expect(spy).toHaveBeenCalledTimes(1);
  const [, payload] = spy.mock.calls[0];
  expect(payload).toMatchObject({ path: "/staff", routerKind: "App Router", routeType: "render" });
  expect((payload as { error: unknown }).error).toBe(error);
});
