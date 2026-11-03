import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * #1399 R1, R2 — `getInboundDefaultForward`, the platform default forward-to inbox prefilled in
 * Client Setup. The Cloudflare boundary is replaced so `readEnv` falls through to `process.env`,
 * as in `tests/config-platform-branding.test.ts`.
 */
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    throw new Error("not in a Worker request context");
  },
}));

const { getInboundDefaultForward, getEmailEnv, getInboundEmailEnv } = await import("@/lib/config");

describe("getInboundDefaultForward (R1)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is unset when the variable is missing", () => {
    vi.stubEnv("INBOUND_DEFAULT_FORWARD", undefined as unknown as string);
    expect(getInboundDefaultForward()).toEqual({ status: "unset" });
  });

  it("is unset when the variable is blank", () => {
    vi.stubEnv("INBOUND_DEFAULT_FORWARD", "   ");
    expect(getInboundDefaultForward()).toEqual({ status: "unset" });
  });

  it("returns a valid address", () => {
    vi.stubEnv("INBOUND_DEFAULT_FORWARD", "inbox@example.com");
    expect(getInboundDefaultForward()).toEqual({ status: "set", address: "inbox@example.com" });
  });

  it("trims and lower-cases the address", () => {
    vi.stubEnv("INBOUND_DEFAULT_FORWARD", "  Info-Hub@Example.COM ");
    expect(getInboundDefaultForward()).toEqual({ status: "set", address: "info-hub@example.com" });
  });

  it("is invalid when the value is not an email address, and does not throw", () => {
    vi.stubEnv("INBOUND_DEFAULT_FORWARD", "not-an-email");
    expect(getInboundDefaultForward()).toEqual({ status: "invalid" });
  });
});

describe("an invalid default never touches sending or the inbound route (R2)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("getEmailEnv and getInboundEmailEnv read the same with it invalid as with it unset", () => {
    vi.stubEnv("EMAIL_FROM", "no-reply@example.com");
    vi.stubEnv("INBOUND_EMAIL_TOKEN", "token");

    vi.stubEnv("INBOUND_DEFAULT_FORWARD", "");
    const emailUnset = getEmailEnv();
    const inboundUnset = getInboundEmailEnv();

    vi.stubEnv("INBOUND_DEFAULT_FORWARD", "not-an-email");
    expect(getEmailEnv()).toEqual(emailUnset);
    expect(getInboundEmailEnv()).toEqual(inboundUnset);
  });
});
