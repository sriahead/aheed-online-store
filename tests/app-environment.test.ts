import { describe, it, expect, afterEach, vi } from "vitest";
import { getAppEnvironment } from "@/lib/config";
import { withEnvironmentTag } from "@/lib/email/environment-tag";

/** #1409 R1 and R3 — which deployment this is, and the subject tag it implies. */

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    throw new Error("not in a Worker");
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAppEnvironment (R1)", () => {
  it.each([
    ["production", "production"],
    ["staging", "staging"],
    [" STAGING ", "staging"],
    ["preview", "development"],
    ["", "development"],
  ])("APP_ENV=%j gives %s", (value, expected) => {
    vi.stubEnv("APP_ENV", value);
    expect(getAppEnvironment()).toBe(expected);
  });

  it("unset gives development", () => {
    vi.stubEnv("APP_ENV", undefined as unknown as string);
    expect(getAppEnvironment()).toBe("development");
  });
});

describe("withEnvironmentTag (R3)", () => {
  it("leaves production subjects unchanged", () => {
    expect(withEnvironmentTag("Order confirmed", "production")).toBe("Order confirmed");
  });

  it("prefixes staging and development", () => {
    expect(withEnvironmentTag("Order confirmed", "staging")).toBe("[STAGING] Order confirmed");
    expect(withEnvironmentTag("Order confirmed", "development")).toBe("[DEV] Order confirmed");
  });

  it("is idempotent", () => {
    expect(withEnvironmentTag("[STAGING] x", "staging")).toBe("[STAGING] x");
    expect(withEnvironmentTag("[DEV] x", "development")).toBe("[DEV] x");
  });
});
