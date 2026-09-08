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
const recordErrorEventDirectMock = vi.hoisted(() => vi.fn());

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
vi.mock("@/lib/error-event-fallback", () => ({
  recordErrorEventDirect: recordErrorEventDirectMock,
}));

afterEach(() => {
  vi.restoreAllMocks();
  recordErrorEventMock.mockReset();
  recordErrorEventDirectMock.mockReset();
});

/** The request/context pair every case below sends; only the errors differ. */
const REQUEST = { path: "/staff", method: "GET", headers: {} } as const;
const CONTEXT = {
  routerKind: "App Router",
  routePath: "/staff",
  routeType: "render",
  revalidateReason: undefined,
} as const;

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
  recordErrorEventDirectMock.mockResolvedValueOnce(true);
  const { onRequestError } = await import("@/instrumentation");
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});

  await expect(onRequestError(new Error("boom"), REQUEST, CONTEXT)).resolves.toBeUndefined();

  const writeFailureCalls = spy.mock.calls.filter(
    (call) => call[0] === "Failed to persist ErrorEvent:",
  );
  expect(writeFailureCalls).toHaveLength(1);
  expect(writeFailureCalls[0][1]).toBe(writeError);
});

/**
 * R11-R13 (#674). The Prisma recorder builds a fresh WASM QueryCompiler, so an
 * error originating in that constructor defeats it every time — the fallback
 * exists for exactly that case and must not fire in any other.
 */
it("does not reach for the fallback when the Prisma write succeeds", async () => {
  recordErrorEventMock.mockResolvedValueOnce(undefined);
  const { onRequestError } = await import("@/instrumentation");
  vi.spyOn(console, "error").mockImplementation(() => {});

  await onRequestError(new Error("boom"), REQUEST, CONTEXT);

  expect(recordErrorEventDirectMock).not.toHaveBeenCalled();
});

it("falls back exactly once, with the same payload the Prisma path was given", async () => {
  recordErrorEventMock.mockRejectedValueOnce(new Error("wasm panic"));
  recordErrorEventDirectMock.mockResolvedValueOnce(true);
  const { onRequestError } = await import("@/instrumentation");
  vi.spyOn(console, "error").mockImplementation(() => {});

  await onRequestError(new Error("boom"), REQUEST, CONTEXT);

  expect(recordErrorEventDirectMock).toHaveBeenCalledTimes(1);
  expect(recordErrorEventDirectMock.mock.calls[0][0]).toEqual(
    recordErrorEventMock.mock.calls[0][1],
  );
});

it("logs all three failures and still resolves when both write paths fail", async () => {
  recordErrorEventMock.mockRejectedValueOnce(new Error("wasm panic"));
  recordErrorEventDirectMock.mockResolvedValueOnce(false);
  const { onRequestError } = await import("@/instrumentation");
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});

  await expect(onRequestError(new Error("boom"), REQUEST, CONTEXT)).resolves.toBeUndefined();

  const labels = spy.mock.calls.map((call) => call[0]);
  expect(labels).toContain("Unhandled request error:");
  expect(labels).toContain("Failed to persist ErrorEvent:");
  expect(labels).toContain("Failed to persist ErrorEvent via fallback:");
});

it("does not reject even if the fallback itself throws, against its own contract", async () => {
  recordErrorEventMock.mockRejectedValueOnce(new Error("wasm panic"));
  recordErrorEventDirectMock.mockRejectedValueOnce(new Error("fallback broke its contract"));
  const { onRequestError } = await import("@/instrumentation");
  vi.spyOn(console, "error").mockImplementation(() => {});

  await expect(onRequestError(new Error("boom"), REQUEST, CONTEXT)).resolves.toBeUndefined();
});
