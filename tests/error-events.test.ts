import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeCaughtError,
  recordErrorEvent,
  listRecentErrorEvents,
} from "@/lib/repositories/error-events";

/** Proves R2-R5 (#508) — see specs/2026-09-01-error-event-log/requirements.md. */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizeCaughtError", () => {
  it("extracts message and stack from a real Error", () => {
    const error = new Error("boom");
    const result = normalizeCaughtError(error);
    expect(result.message).toBe("boom");
    expect(result.stack).toBe(error.stack);
    expect(result.digest).toBeNull();
  });

  it("extracts a string .digest when present", () => {
    const error = new Error("boom") as Error & { digest?: string };
    error.digest = "abc123";
    expect(normalizeCaughtError(error).digest).toBe("abc123");
  });

  it("ignores a non-string .digest", () => {
    const error = new Error("boom") as Error & { digest?: unknown };
    error.digest = 42;
    expect(normalizeCaughtError(error).digest).toBeNull();
  });

  it("degrades a non-Error thrown value to String(value) with no stack/digest", () => {
    expect(normalizeCaughtError("plain string")).toEqual({
      message: "plain string",
      stack: null,
      digest: null,
    });
    expect(normalizeCaughtError(42)).toEqual({ message: "42", stack: null, digest: null });
    expect(normalizeCaughtError(undefined)).toEqual({
      message: "undefined",
      stack: null,
      digest: null,
    });
  });
});

function fakePrisma() {
  return {
    errorEvent: {
      create: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

describe("recordErrorEvent", () => {
  it("truncates an overlong message and stack before insert", async () => {
    const prisma = fakePrisma();
    const message = "m".repeat(3000);
    const stack = "s".repeat(9000);

    await recordErrorEvent(prisma, {
      message,
      stack,
      digest: null,
      path: "/staff",
      method: "GET",
      routerKind: "App Router",
      routeType: "render",
    });

    const data = prisma.errorEvent.create.mock.calls[0][0].data;
    expect(data.message).toHaveLength(2000);
    expect(data.stack).toHaveLength(8000);
  });

  it("strips a query string from path regardless of what the caller passed", async () => {
    const prisma = fakePrisma();

    await recordErrorEvent(prisma, {
      message: "boom",
      stack: null,
      digest: null,
      path: "/orders/lookup?email=someone@example.com",
      method: "GET",
      routerKind: "App Router",
      routeType: "render",
    });

    expect(prisma.errorEvent.create.mock.calls[0][0].data.path).toBe("/orders/lookup");
  });

  it("sweeps rows older than the retention window when the random draw is below the threshold", async () => {
    const prisma = fakePrisma();
    vi.spyOn(Math, "random").mockReturnValue(0);

    await recordErrorEvent(prisma, {
      message: "boom",
      stack: null,
      digest: null,
      path: "/staff",
      method: "GET",
      routerKind: "App Router",
      routeType: "render",
    });

    expect(prisma.errorEvent.deleteMany).toHaveBeenCalledTimes(1);
    const cutoff = prisma.errorEvent.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    const expected = Date.now() - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(5000);
  });

  it("does not sweep when the random draw is above the threshold", async () => {
    const prisma = fakePrisma();
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    await recordErrorEvent(prisma, {
      message: "boom",
      stack: null,
      digest: null,
      path: "/staff",
      method: "GET",
      routerKind: "App Router",
      routeType: "render",
    });

    expect(prisma.errorEvent.deleteMany).not.toHaveBeenCalled();
  });
});

describe("listRecentErrorEvents", () => {
  it("orders by createdAt descending and passes the limit through as take", async () => {
    const prisma = fakePrisma();
    await listRecentErrorEvents(prisma, 50);

    expect(prisma.errorEvent.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });
});
