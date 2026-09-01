import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * R7 fix (#480). An error boundary's own `console.error` runs inside a `useEffect` in a Client
 * Component (see tests/error-boundary.test.tsx), so it only ever executes in the visitor's
 * browser — it structurally cannot reach `wrangler tail`/Workers Logs. `onRequestError` is what
 * actually gives the Worker server-side visibility: Next.js calls it once per request whose
 * render/route/action throws, regardless of which boundary displays the fallback.
 *
 * #508 extends this with a second capture path (a database write via `recordErrorEvent`),
 * proved below with that dependency mocked so this stays a unit test.
 */

const recordErrorEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  getPrismaUncached: vi.fn(() => ({})),
}));
vi.mock("@/lib/repositories/error-events", () => ({
  normalizeCaughtError: (error: unknown) =>
    error instanceof Error
      ? { message: error.message, stack: error.stack ?? null, digest: null }
      : { message: String(error), stack: null, digest: null },
  recordErrorEvent: recordErrorEventMock,
}));

afterEach(() => {
  vi.restoreAllMocks();
  recordErrorEventMock.mockReset();
});

it("logs the raw error and request context server-side, exactly once", async () => {
  recordErrorEventMock.mockResolvedValueOnce(undefined);
  const { onRequestError } = await import("@/instrumentation");
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const error = new Error("boom");

  await onRequestError(
    error,
    { path: "/staff", method: "GET", headers: {} },
    {
      routerKind: "App Router",
      routePath: "/staff",
      routeType: "render",
      revalidateReason: undefined,
    },
  );

  const requestErrorCalls = spy.mock.calls.filter((call) => call[0] === "Unhandled request error:");
  expect(requestErrorCalls).toHaveLength(1);
  const [, payload] = requestErrorCalls[0];
  expect(payload).toMatchObject({ path: "/staff", routerKind: "App Router", routeType: "render" });
  expect((payload as { error: unknown }).error).toBe(error);
});

it("calls recordErrorEvent exactly once with the normalized error and request fields", async () => {
  recordErrorEventMock.mockResolvedValueOnce(undefined);
  const { onRequestError } = await import("@/instrumentation");
  vi.spyOn(console, "error").mockImplementation(() => {});
  const error = new Error("boom");

  await onRequestError(
    error,
    { path: "/staff", method: "GET", headers: {} },
    {
      routerKind: "App Router",
      routePath: "/staff",
      routeType: "render",
      revalidateReason: undefined,
    },
  );

  expect(recordErrorEventMock).toHaveBeenCalledTimes(1);
  expect(recordErrorEventMock.mock.calls[0][1]).toMatchObject({
    message: "boom",
    path: "/staff",
    method: "GET",
    routerKind: "App Router",
    routeType: "render",
  });
});

it("swallows a failed write, logs it separately, and does not reject", async () => {
  const writeError = new Error("db unavailable");
  recordErrorEventMock.mockRejectedValueOnce(writeError);
  const { onRequestError } = await import("@/instrumentation");
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});

  await expect(
    onRequestError(
      new Error("boom"),
      { path: "/staff", method: "GET", headers: {} },
      {
        routerKind: "App Router",
        routePath: "/staff",
        routeType: "render",
        revalidateReason: undefined,
      },
    ),
  ).resolves.toBeUndefined();

  const writeFailureCalls = spy.mock.calls.filter(
    (call) => call[0] === "Failed to persist ErrorEvent:",
  );
  expect(writeFailureCalls).toHaveLength(1);
  expect(writeFailureCalls[0][1]).toBe(writeError);
});
