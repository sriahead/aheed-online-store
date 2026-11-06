import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * #1390 R3 — `getTelegramBotToken`, the platform bot's token for order alerts. The Cloudflare
 * boundary is replaced so `readEnv` falls through to `process.env`, as in
 * `tests/config-inbound-default-forward.test.ts`.
 */
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    throw new Error("not in a Worker request context");
  },
}));

const { getTelegramBotToken } = await import("@/lib/config");

describe("getTelegramBotToken (R3)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is unset when the variable is missing", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", undefined as unknown as string);
    expect(getTelegramBotToken()).toEqual({ status: "unset" });
  });

  it("is unset when the variable is empty", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    expect(getTelegramBotToken()).toEqual({ status: "unset" });
  });

  it("is unset when the variable is blank", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "   ");
    expect(getTelegramBotToken()).toEqual({ status: "unset" });
  });

  it("trims a set token", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", " abc:123 ");
    expect(getTelegramBotToken()).toEqual({ status: "set", token: "abc:123" });
  });
});
