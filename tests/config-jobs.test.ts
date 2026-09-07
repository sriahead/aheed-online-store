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

const { getJobsEnv, readOptional } = await import("@/lib/config");

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

/**
 * `readOptional` (P9.2, #621).
 *
 * The accessors above are deliberately fail-hard, and `NODE_ENV` is
 * unconditionally "production" in every BUILT Worker — so a route that wants to
 * treat an absent secret as its own recoverable case cannot simply check for a
 * falsy value; the accessor throws first and the check becomes dead code. This
 * is what makes such a branch reachable, and it is exported from `lib/config`
 * rather than copied into each route because one private copy in
 * `app/api/jobs/reconcile-payments/route.ts` is how the same defect went
 * unnoticed in `app/api/webhooks/stripe/route.ts` for as long as it did.
 */
describe("readOptional", () => {
  it("returns the value when the reader succeeds", () => {
    expect(readOptional(() => 1)).toBe(1);
    expect(readOptional(() => ({ A: "set" }))).toEqual({ A: "set" });
  });

  it("returns undefined when the reader throws, rather than propagating", () => {
    expect(
      readOptional(() => {
        throw new Error("ZodError-ish");
      }),
    ).toBeUndefined();
  });

  it("makes a falsy-check on a throwing accessor reachable — the whole point", () => {
    // Reproduces the #621 shape: getPaymentEnv() throws in production when the
    // secret is absent, so `const { X } = getPaymentEnv(); if (!X)` never runs
    // its own branch. Through readOptional, it does.
    vi.stubEnv("NODE_ENV", "production");
    const token = readOptional(getJobsEnv)?.JOB_INVOCATION_TOKEN;
    expect(token).toBeUndefined();
  });

  it("still yields the real value through the same path when it IS set", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.JOB_INVOCATION_TOKEN = "tok_secret";
    expect(readOptional(getJobsEnv)?.JOB_INVOCATION_TOKEN).toBe("tok_secret");
  });
});
