import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * `getJobsEnv` (P9.2, #618).
 *
 * `lib/config.ts` imports `getCloudflareContext` from `@opennextjs/cloudflare`
 * at module level, so the module cannot load under vitest without standing that
 * in — the same reason `tests/payments.test.ts` mocks `@/lib/config` rather than
 * loading it. Here the mock is the other way round: the config module IS the
 * thing under test, so the Cloudflare boundary is what gets replaced.
 *
 * `readEnv` falls through to `process.env` when there is no Worker request
 * context, which is exactly what a throwing `getCloudflareContext` produces.
 */
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    throw new Error("not in a Worker request context");
  },
}));

const { getJobsEnv } = await import("@/lib/config");

describe("getJobsEnv", () => {
  const originalToken = process.env.JOB_INVOCATION_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.JOB_INVOCATION_TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.JOB_INVOCATION_TOKEN;
    else process.env.JOB_INVOCATION_TOKEN = originalToken;
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    vi.unstubAllEnvs();
  });

  it("reads the token through readEnv when it is set", () => {
    process.env.JOB_INVOCATION_TOKEN = "tok_secret";
    expect(getJobsEnv().JOB_INVOCATION_TOKEN).toBe("tok_secret");
  });

  it("leaves the token undefined outside production rather than throwing", () => {
    // Local preview and CI legitimately run without one; the ROUTE fails closed
    // with a 503 in that case, which is where the refusal belongs.
    expect(getJobsEnv().JOB_INVOCATION_TOKEN).toBeUndefined();
  });

  it("refuses an absent token in production", () => {
    // An unset token in a deployed environment is a misconfiguration that would
    // silently disable payment recovery, not a degraded mode worth supporting.
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getJobsEnv()).toThrow(/JOB_INVOCATION_TOKEN is required in production/);
  });

  it("accepts a set token in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.JOB_INVOCATION_TOKEN = "tok_secret";
    expect(getJobsEnv().JOB_INVOCATION_TOKEN).toBe("tok_secret");
  });
});
