import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression proof for #1289 — "Production is down: Neon production project over quota
 * (HTTP 402), storefront 500 since ~2026-10-26".
 *
 * The bounded code path is `app/api/health/route.ts`, whose Prisma/Neon round-trip is what
 * produced the reported `degraded` verdict. The defect this pins is not that a dead database
 * reports degraded — it already did — but that the verdict was *silent and unclassified*: a
 * Neon HTTP 402 quota outage (an owner action) was indistinguishable from a transient blip,
 * and nothing landed on the `ErrorEvent` log #437's scheduled check counts, which is exactly
 * the issue's "No alert fired".
 *
 * Run on the unchanged base these assertions fail: `body.db.reason` is `undefined` and
 * `recordErrorEventDirect` is never called. They pass once the route classifies the failure
 * (`"quota"` for the Neon wording, `"unreachable"` otherwise) and best-effort records it.
 */

const findFirstMock = vi.hoisted(() => vi.fn());
const recordErrorEventDirectMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  getPrisma: () => ({ healthCheck: { findFirst: findFirstMock } }),
  getPrismaWs: vi.fn(),
  getPrismaUncached: vi.fn(),
}));
vi.mock("@/lib/error-event-fallback", () => ({
  recordErrorEventDirect: recordErrorEventDirectMock,
}));
vi.mock("@/lib/reference/reference-status-service", () => ({
  getReferenceStatus: vi.fn(async () => ({ configured: true, reachable: true, sources: [] })),
}));
vi.mock("@/lib/config", () => ({
  getEnv: () => ({
    S3_ENDPOINT: undefined,
    S3_BUCKET: undefined,
    S3_ACCESS_KEY: undefined,
    CDN_BASE_URL: null,
  }),
  readEnv: () => undefined,
}));

import { GET, classifyDbFailure } from "@/app/api/health/route";

/** The exact string Neon returns for HTTP 402 on an over-quota project. */
const QUOTA_ERROR = new Error(
  "Your account or project has exceeded the quota. Upgrade your plan to increase limits.",
);
const GENERIC_ERROR = new Error("connect ECONNREFUSED 127.0.0.1:5432");

beforeEach(() => {
  findFirstMock.mockReset();
  recordErrorEventDirectMock.mockReset();
  recordErrorEventDirectMock.mockResolvedValue(true);
});

describe("GET /api/health during a Neon over-quota outage (#1289)", () => {
  it("classifies the Neon HTTP 402 quota message and stays 503 degraded", async () => {
    findFirstMock.mockRejectedValueOnce(QUOTA_ERROR);

    const response = await GET();
    const body = (await response.json()) as Record<string, any>;

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.db.ok).toBe(false);
    expect(body.db.reason).toBe("quota");
  });

  it("classifies any other database failure as unreachable", async () => {
    findFirstMock.mockRejectedValueOnce(GENERIC_ERROR);

    const response = await GET();
    const body = (await response.json()) as Record<string, any>;

    expect(response.status).toBe(503);
    expect(body.db.reason).toBe("unreachable");
  });

  it("records the degraded verdict on the alertable ErrorEvent log, once per failure", async () => {
    findFirstMock.mockRejectedValueOnce(QUOTA_ERROR);

    await GET();

    expect(recordErrorEventDirectMock).toHaveBeenCalledTimes(1);
    expect(recordErrorEventDirectMock.mock.calls[0][0]).toMatchObject({
      path: "/api/health",
      method: "GET",
    });
    expect(recordErrorEventDirectMock.mock.calls[0][0].message).toContain("quota");
  });

  it("records nothing when the database round-trip succeeds", async () => {
    findFirstMock.mockResolvedValueOnce({
      label: "ok",
      checkedAt: new Date("2026-10-30T00:00:00Z"),
    });

    const response = await GET();
    const body = (await response.json()) as Record<string, any>;

    expect(response.status).toBe(200);
    expect(body.db.ok).toBe(true);
    expect(recordErrorEventDirectMock).not.toHaveBeenCalled();
  });

  it("leaves the endpoint's verdict unchanged when its degraded report is not recorded", async () => {
    // `recordErrorEventDirect` resolves false in every failure mode it has (no
    // connection string, a rejected insert, a synchronous throw from the driver) and
    // never rejects. The health check runs precisely because the database route is
    // already down, so a second failure on the reporting path must not turn a
    // reportable 503 degraded into an unhandled 500 — the opposite of the #1289 outage.
    recordErrorEventDirectMock.mockResolvedValueOnce(false);
    findFirstMock.mockRejectedValueOnce(QUOTA_ERROR);

    const response = await GET();
    const body = (await response.json()) as Record<string, any>;

    expect(response.status).toBe(503);
    expect(body.db.reason).toBe("quota");
    expect(recordErrorEventDirectMock).toHaveBeenCalledTimes(1);
  });

  it("keeps concurrent degraded requests separate: one verdict and one record per request", async () => {
    // Requests overlap on the same already-degraded endpoint. Each must classify and
    // record independently — a shared module-level latch (or a memoized verdict) would
    // let the first failure mask the next one, which is the concurrency defect this pins.
    // The two in-flight requests are handed different failures (quota, then generic) so a
    // leaked verdict is observable rather than merely a count mismatch.
    let call = 0;
    findFirstMock.mockImplementation(() => {
      call += 1;
      return call === 1 ? Promise.reject(QUOTA_ERROR) : Promise.reject(GENERIC_ERROR);
    });

    const [first, second] = await Promise.all([GET(), GET()]);
    const [firstBody, secondBody] = (await Promise.all([first.json(), second.json()])) as Array<
      Record<string, any>
    >;

    expect([first.status, second.status]).toEqual([503, 503]);
    expect([firstBody.db.reason, secondBody.db.reason]).toEqual(["quota", "unreachable"]);
    expect(recordErrorEventDirectMock).toHaveBeenCalledTimes(2);
  });
});

describe("classifyDbFailure boundaries", () => {
  it("treats nothing thrown / null / undefined as unreachable", () => {
    expect(classifyDbFailure(undefined)).toBe("unreachable");
    expect(classifyDbFailure(null)).toBe("unreachable");
    expect(classifyDbFailure("")).toBe("unreachable");
    expect(classifyDbFailure("   ")).toBe("unreachable");
  });

  it("matches the quota wording case-insensitively", () => {
    expect(classifyDbFailure(new Error("EXCEEDED THE QUOTA"))).toBe("quota");
  });

  it("does not mistake a generic error that merely mentions a quota", () => {
    expect(classifyDbFailure(new Error("quota service unavailable"))).toBe("unreachable");
  });

  it("accepts a thrown non-Error value", () => {
    expect(classifyDbFailure({ message: "has exceeded the quota" })).toBe("unreachable");
  });
});
