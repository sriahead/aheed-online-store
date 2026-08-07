import { describe, it, expect, vi } from "vitest";

// lib/auth.ts imports lib/db.ts, which imports @prisma/client/wasm — not
// resolvable under vitest (same reason getAuth() itself has no unit tests).
// Mocking these lets buildSocialProviders, which touches neither, be tested
// as the pure function it is.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/email", () => ({ getEmailService: vi.fn() }));

const { buildSocialProviders } = await import("@/lib/auth");
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
