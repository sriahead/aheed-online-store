import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRoutePatterns } from "../scripts/verify-worker-routes";
import { manifestSchema } from "../scripts/provision-vendor";
import { assertNotProduction } from "../scripts/provision-aheedsuperstore-staging";

describe("Aheed Superstore Staging Onboarding (Issue #1265)", () => {
  it("R1 & R2: wrangler.toml declares aheedsuperstore-staging.nocaped.com under [env.staging]", () => {
    const toml = readFileSync("wrangler.toml", "utf8");
    const routes = parseRoutePatterns(toml, "staging");
    expect(routes).toContain("aheedsuperstore-staging.nocaped.com");
  });

  it("R3: prisma/manifests/aheedsuperstore.json conforms to strict manifestSchema", () => {
    const raw = JSON.parse(readFileSync("prisma/manifests/aheedsuperstore.json", "utf8"));
    const parsed = manifestSchema.parse(raw);
    expect(parsed.slug).toBe("aheedsuperstore");
    expect(parsed.name).toBe("Aheed Superstore");
    expect(parsed.host).toBe("aheedsuperstore-staging.nocaped.com");
    expect(parsed.deliveryPrefixes).toContain("MK1");
    expect(parsed.branding.brandGreenDark).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("R7: assertNotProduction throws when targeting production host", () => {
    expect(() => {
      assertNotProduction("ep-young-glitter-zadlkttm.c-2.eu-west-2.aws.neon.tech");
    }).toThrow(/REFUSING TO RUN.*matches production/);
  });

  it("R7: assertNotProduction permits staging host", () => {
    expect(() => {
      assertNotProduction("ep-empty-scene-zafjzeye.c-2.eu-west-2.aws.neon.tech");
    }).not.toThrow();
  });
});
