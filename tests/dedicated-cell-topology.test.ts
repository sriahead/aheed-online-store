import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseRoutePatterns } from "@/scripts/verify-worker-routes";

/** The platform `deploy` job and the `deploy-afc` job of a deploy workflow, as text (#1505). */
function splitDeployJobs(yml: string): { platform: string; afc: string } {
  const platformStart = yml.search(/^  deploy:\r?$/m);
  const afcStart = yml.search(/^  deploy-afc:\r?$/m);
  expect(platformStart).toBeGreaterThan(-1);
  expect(afcStart).toBeGreaterThan(platformStart);
  return { platform: yml.slice(platformStart, afcStart), afc: yml.slice(afcStart) };
}

describe("Dedicated Cell Topology Configuration", () => {
  const rootToml = readFileSync("wrangler.toml", "utf8");
  const schedulerToml = readFileSync("workers/scheduler/wrangler.toml", "utf8");
  const inboundEmailToml = readFileSync("workers/inbound-email/wrangler.toml", "utf8");
  const deployStagingYml = readFileSync(".github/workflows/deploy-staging.yml", "utf8");
  const deployProdYml = readFileSync(".github/workflows/deploy-production.yml", "utf8");

  it("configures afc-staging in root wrangler.toml with correct routes, buckets, and vars", () => {
    expect(rootToml).toContain("[env.afc-staging]");
    expect(rootToml).toContain('name = "afc-store-staging"');
    // #1503 — images go through S3_* to the client's own account, never a Merqify-account binding.
    expect(rootToml).not.toMatch(/\[\[env\.afc-staging\.r2_buckets\]\]/);
    expect(rootToml).toContain('PLATFORM_NAME = "Aheed Food Centre"');

    const routes = parseRoutePatterns(rootToml, "afc-staging");
    expect(routes).toContain("staging.aheedfoodcentre.co.uk");
  });

  it("configures afc-production in root wrangler.toml with correct routes, buckets, and vars", () => {
    expect(rootToml).toContain("[env.afc-production]");
    expect(rootToml).toContain('name = "afc-store-production"');
    expect(rootToml).not.toMatch(/\[\[env\.afc-production\.r2_buckets\]\]/);
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

  it("#1505: deploy-staging.yml deploys the AFC cell in its own job, independent of the platform deploy", () => {
    const { platform, afc } = splitDeployJobs(deployStagingYml);
    expect(afc).toMatch(/^    needs: quality$/m);
    expect(afc).toMatch(/^    environment: staging/m);
    // Build before migrate inside the AFC job too (#434).
    expect(afc.indexOf("opennextjs-cloudflare build")).toBeGreaterThan(-1);
    expect(afc.indexOf("opennextjs-cloudflare build")).toBeLessThan(
      afc.indexOf("prisma migrate deploy"),
    );
    // No AFC step left behind in the platform job, so a platform failure cannot skip the cell.
    expect(platform).not.toMatch(/afc-staging|AFC_DIRECT_URL/);
    // #1509 — each job queues in its own group: same-cell runs never overlap, the cells stay parallel.
    expect(platform).toMatch(
      /concurrency:\s+group: deploy-staging-platform\s+cancel-in-progress: false/,
    );
    expect(afc).toMatch(/concurrency:\s+group: deploy-staging-afc\s+cancel-in-progress: false/);
  });

  it("includes the AFC deployment steps in deploy-staging.yml", () => {
    expect(deployStagingYml).toContain("AFC_DIRECT_URL");
    expect(deployStagingYml).toContain("npx prisma migrate deploy");
    expect(deployStagingYml).toContain("scripts/verify-worker-routes.ts --env afc-staging");
    expect(deployStagingYml).toContain("npx wrangler deploy --env afc-staging");
    expect(deployStagingYml).toContain("workers/scheduler/wrangler.toml --env afc-staging");
    expect(deployStagingYml).toContain("workers/inbound-email/wrangler.toml --env afc-staging");
  });

  it("#1505: deploy-production.yml deploys the AFC cell in its own job, independent of the platform deploy", () => {
    const { platform, afc } = splitDeployJobs(deployProdYml);
    expect(afc).toMatch(/^    needs: quality$/m);
    expect(afc).toMatch(/^    environment: production/m);
    // Build before migrate inside the AFC job too (#434).
    expect(afc.indexOf("opennextjs-cloudflare build")).toBeGreaterThan(-1);
    expect(afc.indexOf("opennextjs-cloudflare build")).toBeLessThan(
      afc.indexOf("prisma migrate deploy"),
    );
    // No AFC step left behind in the platform job, so a platform failure cannot skip the cell.
    expect(platform).not.toMatch(/afc-production|AFC_DIRECT_URL/);
    // #1509 — each job queues in its own group: same-cell runs never overlap, the cells stay parallel.
    expect(platform).toMatch(
      /concurrency:\s+group: deploy-production-platform\s+cancel-in-progress: false/,
    );
    expect(afc).toMatch(/concurrency:\s+group: deploy-production-afc\s+cancel-in-progress: false/);
  });

  it("includes the AFC deployment steps in deploy-production.yml", () => {
    expect(deployProdYml).toContain("AFC_DIRECT_URL");
    expect(deployProdYml).toContain("npx prisma migrate deploy");
    expect(deployProdYml).toContain("scripts/verify-worker-routes.ts --env afc-production");
    expect(deployProdYml).toContain("npx wrangler deploy --env afc-production");
    expect(deployProdYml).toContain("workers/scheduler/wrangler.toml --env afc-production");
    expect(deployProdYml).toContain("workers/inbound-email/wrangler.toml --env afc-production");
  });
});
