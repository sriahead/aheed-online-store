import { describe, it, expect, vi } from "vitest";

// lib/auth.ts imports lib/db.ts, which imports @prisma/client/wasm — not
// resolvable under vitest (same reason getAuth() itself has no unit tests).
// Mocking these lets buildSocialProviders, which touches neither, be tested
// as the pure function it is.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/email", () => ({ getEmailService: vi.fn() }));

const { buildSocialProviders, authDb } = await import("@/lib/auth");
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
