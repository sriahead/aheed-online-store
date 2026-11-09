import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseRoutePatterns } from "@/scripts/verify-worker-routes";

describe("Dedicated Cell Topology Configuration", () => {
  const rootToml = readFileSync("wrangler.toml", "utf8");
  const schedulerToml = readFileSync("workers/scheduler/wrangler.toml", "utf8");
  const inboundEmailToml = readFileSync("workers/inbound-email/wrangler.toml", "utf8");
  const deployStagingYml = readFileSync(".github/workflows/deploy-staging.yml", "utf8");
  const deployProdYml = readFileSync(".github/workflows/deploy-production.yml", "utf8");

  it("configures afc-staging in root wrangler.toml with correct routes, buckets, and vars", () => {
    expect(rootToml).toContain("[env.afc-staging]");
    expect(rootToml).toContain('name = "afc-store-staging"');
    expect(rootToml).toContain('bucket_name = "afc-images-staging"');
    expect(rootToml).toContain('PLATFORM_NAME = "Aheed Food Centre"');

    const routes = parseRoutePatterns(rootToml, "afc-staging");
    expect(routes).toContain("staging.aheedfoodcentre.co.uk");
  });

  it("configures afc-production in root wrangler.toml with correct routes, buckets, and vars", () => {
    expect(rootToml).toContain("[env.afc-production]");
    expect(rootToml).toContain('name = "afc-store-production"');
    expect(rootToml).toContain('bucket_name = "afc-images-production"');
    expect(rootToml).toContain('PLATFORM_NAME = "Aheed Food Centre"');

    const routes = parseRoutePatterns(rootToml, "afc-production");
    expect(routes).toContain("www.aheedfoodcentre.co.uk");
  });

  it("configures afc-staging and afc-production in workers/scheduler/wrangler.toml", () => {
    expect(schedulerToml).toContain("[env.afc-staging]");
    expect(schedulerToml).toContain('name = "afc-scheduler-staging"');
    expect(schedulerToml).toContain('APP_BASE_URL = "https://staging.aheedfoodcentre.co.uk"');

    expect(schedulerToml).toContain("[env.afc-production]");
    expect(schedulerToml).toContain('name = "afc-scheduler-production"');
    expect(schedulerToml).toContain('APP_BASE_URL = "https://www.aheedfoodcentre.co.uk"');
  });

  it("configures afc-staging and afc-production in workers/inbound-email/wrangler.toml", () => {
    expect(inboundEmailToml).toContain("[env.afc-staging]");
    expect(inboundEmailToml).toContain('name = "afc-inbound-email-staging"');
    expect(inboundEmailToml).toContain('APP_BASE_URL = "https://staging.aheedfoodcentre.co.uk"');

    expect(inboundEmailToml).toContain("[env.afc-production]");
    expect(inboundEmailToml).toContain('name = "afc-inbound-email"');
    expect(inboundEmailToml).toContain('APP_BASE_URL = "https://www.aheedfoodcentre.co.uk"');
  });

  it("includes lockstep AFC deployment steps in deploy-staging.yml", () => {
    expect(deployStagingYml).toContain("AFC_DIRECT_URL");
    expect(deployStagingYml).toContain("npx prisma migrate deploy");
    expect(deployStagingYml).toContain("scripts/verify-worker-routes.ts --env afc-staging");
    expect(deployStagingYml).toContain("npx wrangler deploy --env afc-staging");
    expect(deployStagingYml).toContain("workers/scheduler/wrangler.toml --env afc-staging");
    expect(deployStagingYml).toContain("workers/inbound-email/wrangler.toml --env afc-staging");
  });

  it("includes lockstep AFC deployment steps in deploy-production.yml", () => {
    expect(deployProdYml).toContain("AFC_DIRECT_URL");
    expect(deployProdYml).toContain("npx prisma migrate deploy");
    expect(deployProdYml).toContain("scripts/verify-worker-routes.ts --env afc-production");
    expect(deployProdYml).toContain("npx wrangler deploy --env afc-production");
    expect(deployProdYml).toContain("workers/scheduler/wrangler.toml --env afc-production");
    expect(deployProdYml).toContain("workers/inbound-email/wrangler.toml --env afc-production");
  });
});
