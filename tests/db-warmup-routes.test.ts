import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * #1491 R8/R9 — the two token-guarded warm-up job routes. Services mocked, so each status is one
 * branch of the route; `warmDatabase` itself is tested with a client double below.
 */

const warmDatabase = vi.fn();
vi.mock("@/lib/db-warmup-ping", () => ({ warmDatabase }));
const publishWarmupSchedule = vi.fn();
vi.mock("@/lib/db-warmup-service", () => ({ publishWarmupSchedule }));

const warm = await import("@/app/api/jobs/warm-db/route");
const refresh = await import("@/app/api/jobs/refresh-warmup-schedule/route");

const originalEnv = { ...process.env };
const TOKEN = "job-test-token";

function post(token: string | null) {
  return new Request("https://app.test/api/jobs/x", {
    method: "POST",
    headers: token === null ? {} : { "x-job-token": token },
  });
}

beforeEach(() => {
  process.env = { ...originalEnv, JOB_INVOCATION_TOKEN: TOKEN };
  warmDatabase.mockReset().mockResolvedValue({ ok: true, ms: 4 });
  publishWarmupSchedule.mockReset().mockResolvedValue({ windows: 8 });
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe.each([
  ["warm-db (R9)", warm, warmDatabase, { ok: true, ms: 4 }],
  ["refresh-warmup-schedule (R8)", refresh, publishWarmupSchedule, { ok: true, windows: 8 }],
] as const)("POST /api/jobs/%s", (_name, route, service, body) => {
  it("503 when JOB_INVOCATION_TOKEN is unset, and does no work", async () => {
    delete process.env.JOB_INVOCATION_TOKEN;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await route.POST(post(TOKEN))).status).toBe(503);
    expect(service).not.toHaveBeenCalled();
  });

  it("401 with a missing or wrong token", async () => {
    expect((await route.POST(post(null))).status).toBe(401);
    expect((await route.POST(post("wrong-token-xx"))).status).toBe(401);
    expect(service).not.toHaveBeenCalled();
  });

  it("200 with the right token", async () => {
    const res = await route.POST(post(TOKEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(body);
    expect(service).toHaveBeenCalledTimes(1);
  });

  it("405 for GET", () => {
    expect(route.GET().status).toBe(405);
  });
});

describe("the ping never reaches the reference database (R9)", () => {
  it("no warm-up module imports lib/reference", () => {
    for (const f of [
      "app/api/jobs/warm-db/route.ts",
      "lib/db-warmup-ping.ts",
      "lib/db-warmup/payload.ts",
      "lib/db-warmup/activity.ts",
    ]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/lib\/reference/);
    }
  });
});
