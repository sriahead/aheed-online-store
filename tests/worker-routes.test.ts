import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareRoutes,
  isRoutableHost,
  parseRoutePatterns,
  renderRoutesBlock,
} from "../scripts/verify-worker-routes";

/**
 * #1198 — the comparison that stands between a hand edit and a torn-down custom domain.
 *
 * Every case here runs against fixture strings rather than a live database, which is the whole
 * reason `scripts/verify-worker-routes.ts` exposes these four pure functions instead of doing the
 * work inside `main()`.
 */

// The real shape, including the two tables that must NOT be read as routes and a second
// environment's routes that must not leak into the first's.
const FIXTURE_TOML = `
name = "aheed-store"
main = ".open-next/worker.js"

[[env.staging.routes]]
pattern = "staging.aheedfoodcentre.nocaped.com"
custom_domain = true

[[env.staging.routes]]
pattern = "srimart-staging.nocaped.com"
custom_domain = true

[[env.staging.r2_buckets]]
binding = "IMAGES"
bucket_name = "aheed-images-staging"

[env.staging.vars]
PLATFORM_NAME = "[PLATFORM NAME]"
pattern = "not-a-route.example.com"

[[env.production.routes]]
pattern = "aheedfoodcentre.nocaped.com"
custom_domain = true
`;

describe("parseRoutePatterns", () => {
  it("reads only the named environment's route tables", () => {
    expect(parseRoutePatterns(FIXTURE_TOML, "staging")).toEqual([
      "staging.aheedfoodcentre.nocaped.com",
      "srimart-staging.nocaped.com",
    ]);
    expect(parseRoutePatterns(FIXTURE_TOML, "production")).toEqual(["aheedfoodcentre.nocaped.com"]);
  });

  it("ignores a `pattern` key that is not inside a routes table", () => {
    // `[env.staging.vars]` carries a decoy `pattern =` line; reading it as a route would invent a
    // host that must be declared, failing every deploy.
    expect(parseRoutePatterns(FIXTURE_TOML, "staging")).not.toContain("not-a-route.example.com");
  });

  it("returns nothing for an environment with no routes", () => {
    expect(parseRoutePatterns(FIXTURE_TOML, "nonexistent")).toEqual([]);
  });
});

describe("isRoutableHost", () => {
  it("excludes the hosts the dev seed actually writes", () => {
    // docs/developer-portal/env-setup.md seeds these verbatim, so without the exclusion this check
    // fails on every developer machine.
    expect(isRoutableHost("localhost:8787")).toBe(false);
    expect(isRoutableHost("srimart.localhost:8787")).toBe(false);
  });

  it("excludes any host carrying a port, and empty values", () => {
    expect(isRoutableHost("example.nocaped.com:443")).toBe(false);
    expect(isRoutableHost("   ")).toBe(false);
  });

  it("accepts a deployed host regardless of label depth", () => {
    expect(isRoutableHost("srimart.nocaped.com")).toBe(true);
    expect(isRoutableHost("staging.aheedfoodcentre.nocaped.com")).toBe(true);
    expect(isRoutableHost("SriMart.NoCaped.com")).toBe(true);
  });
});

describe("compareRoutes", () => {
  const patterns = parseRoutePatterns(FIXTURE_TOML, "staging");

  it("reports a trading vendor with no route as missing — the tear-down case", () => {
    const { missing } = compareRoutes(
      ["staging.aheedfoodcentre.nocaped.com", "newclient-staging.nocaped.com"],
      patterns,
    );
    expect(missing).toEqual(["newclient-staging.nocaped.com"]);
  });

  it("passes a dev database whose only hosts are localhost", () => {
    const { missing } = compareRoutes(["localhost:8787", "srimart.localhost:8787"], patterns);
    expect(missing).toEqual([]);
  });

  it("reports a routed host with no vendor row as stale, not missing", () => {
    const { missing, stale } = compareRoutes(["srimart-staging.nocaped.com"], patterns);
    expect(missing).toEqual([]);
    expect(stale).toEqual(["staging.aheedfoodcentre.nocaped.com"]);
  });

  it("is case-insensitive and de-duplicates", () => {
    const { missing } = compareRoutes(
      ["SRIMART-STAGING.nocaped.com", "new.nocaped.com", "new.nocaped.com"],
      patterns,
    );
    expect(missing).toEqual(["new.nocaped.com"]);
  });
});

describe("renderRoutesBlock", () => {
  it("emits a block the parser reads back identically", () => {
    const block = renderRoutesBlock("staging", [
      "b.nocaped.com",
      "a.nocaped.com",
      "localhost:8787",
    ]);
    expect(block).toContain("[[env.staging.routes]]");
    expect(block).toContain('pattern = "a.nocaped.com"');
    expect(block).toContain("custom_domain = true");
    expect(block).not.toContain("localhost");
    // The round trip is what lets the writer be trusted as the fix for the reader's failure.
    expect(parseRoutePatterns(block, "staging")).toEqual(["a.nocaped.com", "b.nocaped.com"]);
  });
});

/**
 * #1323 — the repository's own config, not a fixture: the Workers deploy to the Merqify account
 * under flat merqify.com hosts. A route left on nocaped.com would target a zone the deploy token
 * cannot reach, and Aheed Superstore was retired with this move.
 */
describe("repository Worker config (#1323)", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  const customDomainCount = (toml: string) =>
    (toml.match(/^custom_domain\s*=\s*true/gm) ?? []).length;

  it("R1: staging routes are exactly the two merqify.com store hosts", () => {
    expect(parseRoutePatterns(read("wrangler.toml"), "staging")).toEqual([
      "aheed-staging.merqify.com",
      "srimart-staging.merqify.com",
    ]);
  });

  it("R2: production routes are exactly the two merqify.com store hosts", () => {
    expect(parseRoutePatterns(read("wrangler.toml"), "production")).toEqual([
      "aheed.merqify.com",
      "srimart.merqify.com",
    ]);
  });

  it("R1/R2: every app Worker route is a custom domain", () => {
    expect(customDomainCount(read("wrangler.toml"))).toBe(4);
  });

  it("R3: the scheduler calls the Aheed host of its own environment", () => {
    const toml = read("workers/scheduler/wrangler.toml");
    const urls = [...toml.matchAll(/^APP_BASE_URL\s*=\s*"([^"]+)"/gm)].map((m) => m[1]);
    expect(urls).toEqual(["https://aheed-staging.merqify.com", "https://aheed.merqify.com"]);
  });

  it("R4: the internal docs site has exactly one route, docs.merqify.com", () => {
    const toml = read("kms/site-internal/wrangler.toml");
    const patterns = [...toml.matchAll(/^pattern\s*=\s*"([^"]+)"/gm)].map((m) => m[1]);
    expect(patterns).toEqual(["docs.merqify.com"]);
    expect(customDomainCount(toml)).toBe(1);
  });

  it("R5: the image CSP allows merqify.com and no nocaped.com host", () => {
    const config = read("next.config.mjs");
    const imgSrc = /"img-src[^"]*"/.exec(config)?.[0] ?? "";
    expect(imgSrc).toContain("https://*.merqify.com");
    expect(config).not.toMatch(/nocaped/);
  });
});
