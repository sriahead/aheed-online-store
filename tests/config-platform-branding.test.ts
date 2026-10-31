import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * `getPlatformBrandingEnv` — the footer's "Powered by" line. Unset or blank falls back to the
 * platform's own name and tagline (Merqify), in every environment. The Cloudflare boundary is
 * replaced so `readEnv` falls through to `process.env`, as in `tests/config-jobs.test.ts`.
 */
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    throw new Error("not in a Worker request context");
  },
}));

const { getPlatformBrandingEnv, DEFAULT_PLATFORM_NAME, DEFAULT_PLATFORM_TAGLINE } =
  await import("@/lib/config");

describe("getPlatformBrandingEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to Merqify and its tagline when unset or blank", () => {
    vi.stubEnv("PLATFORM_NAME", "");
    vi.stubEnv("PLATFORM_TAGLINE", "   ");
    expect(getPlatformBrandingEnv()).toEqual({
      PLATFORM_NAME: "Merqify",
      PLATFORM_TAGLINE: "Your Merchandise, Digitised Quickly",
    });
  });

  it("uses configured values, trimmed", () => {
    vi.stubEnv("PLATFORM_NAME", " Other ");
    vi.stubEnv("PLATFORM_TAGLINE", "A line");
    expect(getPlatformBrandingEnv()).toEqual({
      PLATFORM_NAME: "Other",
      PLATFORM_TAGLINE: "A line",
    });
  });

  it("wrangler.toml sets the same values for staging and production", () => {
    const toml = readFileSync("wrangler.toml", "utf8");
    expect(toml.match(/^PLATFORM_NAME = "(.*)"$/gm)).toEqual([
      `PLATFORM_NAME = "${DEFAULT_PLATFORM_NAME}"`,
      `PLATFORM_NAME = "${DEFAULT_PLATFORM_NAME}"`,
    ]);
    expect(toml.match(/^PLATFORM_TAGLINE = "(.*)"$/gm)).toEqual([
      `PLATFORM_TAGLINE = "${DEFAULT_PLATFORM_TAGLINE}"`,
      `PLATFORM_TAGLINE = "${DEFAULT_PLATFORM_TAGLINE}"`,
    ]);
  });
});
