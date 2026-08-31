import { describe, it, expect, vi, beforeEach } from "vitest";

// lib/auth.ts imports lib/db.ts, which imports @prisma/client/wasm — not
// resolvable under vitest (same reason getAuth() itself has no unit tests).
// Mocking these lets buildSocialProviders, which touches neither, be tested
// as the pure function it is.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/email", () => ({ getEmailService: vi.fn() }));

// #469 — authOnRequest dynamically imports both of these; mocking lets it be
// tested without a live Prisma/Workers context, same reasoning as above.
const getCurrentVendorIdOrNull = vi.fn();
vi.mock("@/lib/tenant", () => ({ getCurrentVendorIdOrNull }));

const checkAuthRateLimit = vi.fn();
vi.mock("@/lib/repositories/auth-rate-limit", () => ({ checkAuthRateLimit }));

const { buildSocialProviders, authDb, isSensitiveAuthPath, authOnRequest, authRateLimitPlugin } =
  await import("@/lib/auth");
describe("buildSocialProviders", () => {
  it("returns undefined when both credentials are unset", () => {
    expect(buildSocialProviders({})).toBeUndefined();
  });

  it("returns undefined when only the client ID is set", () => {
    expect(buildSocialProviders({ GOOGLE_CLIENT_ID: "id-only" })).toBeUndefined();
  });

  it("returns undefined when only the client secret is set", () => {
    expect(buildSocialProviders({ GOOGLE_CLIENT_SECRET: "secret-only" })).toBeUndefined();
  });

  it("returns a google provider block when both are set", () => {
    expect(
      buildSocialProviders({
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
      }),
    ).toEqual({
      google: { clientId: "client-id", clientSecret: "client-secret" },
    });
  });
});

describe("isSensitiveAuthPath (#469, #481)", () => {
  // #481 — these are the literal paths Better Auth actually registers
  // (node_modules/better-auth/dist/api/routes/*.mjs), not the placeholder
  // "/sign-in"-style paths the original #431 code assumed and which never
  // matched real traffic — confirmed live (see plan.md).
  it.each([
    "/api/auth/sign-in/email",
    "/api/auth/sign-up/email",
    "/api/auth/request-password-reset",
    "/api/auth/reset-password",
    "/api/auth/send-verification-email",
  ])("returns true for %s", (pathname) => {
    expect(isSensitiveAuthPath(pathname)).toBe(true);
  });

  it("returns false for an unrelated auth path", () => {
    expect(isSensitiveAuthPath("/api/auth/get-session")).toBe(false);
  });

  it("returns false for social sign-in — an OAuth redirect, not a password check", () => {
    expect(isSensitiveAuthPath("/api/auth/sign-in/social")).toBe(false);
  });
});

describe("authOnRequest (#469)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses with 429 when no vendor resolves on a sensitive path, without checking the rate limit", async () => {
    getCurrentVendorIdOrNull.mockResolvedValue(null);

    const response = await authOnRequest(new Request("https://x/api/auth/sign-in/email"));

    expect(response?.status).toBe(429);
    expect(checkAuthRateLimit).not.toHaveBeenCalled();
  });

  it("returns the identical response for 'no vendor' and 'rate limit exceeded'", async () => {
    getCurrentVendorIdOrNull.mockResolvedValueOnce(null);
    const noVendorResponse = await authOnRequest(new Request("https://x/api/auth/sign-in/email"));

    getCurrentVendorIdOrNull.mockResolvedValueOnce("vendor-1");
    checkAuthRateLimit.mockResolvedValueOnce({ allowed: false });
    const rateLimitedResponse = await authOnRequest(
      new Request("https://x/api/auth/sign-in/email"),
    );

    expect(noVendorResponse?.status).toBe(rateLimitedResponse?.status);
    expect(noVendorResponse?.headers.get("Content-Type")).toBe(
      rateLimitedResponse?.headers.get("Content-Type"),
    );
    expect(await noVendorResponse?.text()).toBe(await rateLimitedResponse?.text());
  });

  it("lets the request through when a vendor resolves and the rate limit allows it", async () => {
    getCurrentVendorIdOrNull.mockResolvedValue("vendor-1");
    checkAuthRateLimit.mockResolvedValue({ allowed: true });

    const response = await authOnRequest(new Request("https://x/api/auth/sign-in/email"));

    expect(response).toBeUndefined();
    expect(checkAuthRateLimit).toHaveBeenCalledTimes(1);
    expect(checkAuthRateLimit.mock.calls[0][1]).toBe("vendor-1");
  });

  it("takes no action for a non-sensitive path, regardless of vendor resolution", async () => {
    const response = await authOnRequest(new Request("https://x/api/auth/get-session"));

    expect(response).toBeUndefined();
    expect(getCurrentVendorIdOrNull).not.toHaveBeenCalled();
    expect(checkAuthRateLimit).not.toHaveBeenCalled();
  });
});

describe("authRateLimitPlugin (#483)", () => {
  // #483 — a bare top-level `onRequest` key in betterAuth({...})'s config is
  // silently never invoked; Better Auth only ever calls a *plugin's* onRequest,
  // whose contract is different: it returns { response } to short-circuit, not
  // a bare Response. This proves the wrapper performs that conversion correctly
  // — the exact shape mismatch that made #431's hook dead code from day one.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has the id field Better Auth's plugin loop requires", () => {
    expect(authRateLimitPlugin.id).toBe("auth-rate-limit");
  });

  it("wraps a refusal Response in { response } to short-circuit", async () => {
    getCurrentVendorIdOrNull.mockResolvedValue(null);

    const result = await authRateLimitPlugin.onRequest(
      new Request("https://x/api/auth/sign-in/email"),
    );

    expect(result).toHaveProperty("response");
    expect((result as { response: Response }).response.status).toBe(429);
  });

  it("returns undefined (not { response: undefined }) when the request is allowed through", async () => {
    getCurrentVendorIdOrNull.mockResolvedValue("vendor-1");
    checkAuthRateLimit.mockResolvedValue({ allowed: true });

    const result = await authRateLimitPlugin.onRequest(
      new Request("https://x/api/auth/sign-in/email"),
    );

    expect(result).toBeUndefined();
  });
});

describe("authDb (#382)", () => {
  it("hides $transaction so Better Auth's adapter takes its non-transactional fallback", () => {
    const client = {
      $transaction: vi.fn(() => {
        throw new Error("Transactions are not supported in HTTP mode");
      }),
    };
    const wrapped = authDb(client);
    expect(wrapped.$transaction).toBeUndefined();
    expect(typeof wrapped.$transaction).not.toBe("function");
  });

  it("still delegates every other method to the real underlying client", async () => {
    const findFirst = vi.fn(async (_args: { where: { id: string } }) => ({ id: "row-1" }));
    const client = { session: { findFirst } };
    const wrapped = authDb(client);
    const result = await wrapped.session.findFirst({ where: { id: "row-1" } });
    expect(result).toEqual({ id: "row-1" });
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "row-1" } });
  });

  it("still delegates plain (non-function) properties unchanged", () => {
    const client = { modelName: "Session" };
    const wrapped = authDb(client);
    expect(wrapped.modelName).toBe("Session");
  });
});
