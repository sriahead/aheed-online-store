import "dotenv/config";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

/**
 * Fail a deploy when `wrangler.toml` does not route a vendor that is actually trading (#1198, P11).
 *
 *   npx tsx scripts/verify-worker-routes.ts --env staging
 *   npx tsx scripts/verify-worker-routes.ts --env production --write
 *
 * THE HAZARD THIS REMOVES. Every vendor host is declared in `wrangler.toml` as its own
 * `custom_domain = true` route, and the committed comment beside SriMart's says why that matters: a
 * host "must be declared here so `wrangler deploy` doesn't tear down the custom domain". So a hand
 * edit that DROPS a live host is destructive, and silent — nothing compared the file against the
 * `VendorDomain` rows until this script. `--write` prints the correct block, so adding a vendor is
 * paste-not-author rather than remember-not-to-break-production.
 *
 * WHY NOT A WILDCARD ROUTE, WHICH WOULD MAKE THE FILE STOP MATTERING. Decided against on
 * 2026-10-21 after reading the Cloudflare account rather than assuming: `nocaped.com` is an active
 * `full` zone on the Free plan, and proxied wildcard DNS is no longer Enterprise-only, so a wildcard
 * WAS available. It lost on certificate depth. Worker Custom Domains cannot be wildcards at all, and
 * a wildcard route plus Universal SSL each cover exactly ONE subdomain label —
 * `staging.aheedfoodcentre.nocaped.com` is two labels deep and serves a valid certificate today only
 * because a Custom Domain issues one per hostname. A wildcard would therefore have meant renaming a
 * live staging host or buying Advanced Certificate Manager on a Free zone. See ADR-004's 2026-10-21
 * implementation note; do not re-propose a wildcard without solving that first.
 *
 * NO TOML DEPENDENCY. This repo has no TOML parser and one is not worth adding for this. The reader
 * below handles exactly the shape `wrangler.toml` uses, and because `--write` GENERATES that same
 * shape, the reader and the writer are self-consistent and unit-testable (`tests/worker-routes.test.ts`).
 *
 * WHY IT RUNS IN THE DEPLOY WORKFLOWS AND NOT IN `quality.yml`. `CLAUDE.md` says to add a check to
 * `quality.yml` rather than to a caller, so that the deploy paths cannot run less than a PR does.
 * This is a stated exception: the check needs the TARGET ENVIRONMENT's `DIRECT_URL`, which a PR
 * runner does not have, so in `quality.yml` it could only skip — and a skip line is not a pass. It
 * is a per-deploy-target precondition, not a quality check, and it sits after `prisma migrate
 * deploy` (so the database is current) and before `wrangler deploy` (the one step that can destroy
 * a domain).
 */

const WRANGLER_CONFIG = "wrangler.toml";

/**
 * Every `pattern` declared by a `[[env.<envName>.routes]]` table.
 *
 * Deliberately narrow: it keys on the exact table header, so `[env.staging.vars]` and
 * `[[env.staging.r2_buckets]]` are not mistaken for routes, and a table for a DIFFERENT environment
 * is not either. A table ends at the next line starting with `[`.
 */
export function parseRoutePatterns(toml: string, envName: string): string[] {
  const header = `[[env.${envName}.routes]]`;
  const patterns: string[] = [];
  let inRoutesTable = false;

  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inRoutesTable = line === header;
      continue;
    }
    if (!inRoutesTable) continue;
    const match = /^pattern\s*=\s*["']([^"']+)["']/.exec(line);
    if (match) patterns.push(match[1].toLowerCase());
  }

  return patterns;
}

/**
 * Whether a `VendorDomain.host` is one the Worker can actually be routed for.
 *
 * Excludes two shapes, and both are real rows rather than hypotheses: the dev seed writes
 * `localhost:8787` and `srimart.localhost:8787` as genuine `VendorDomain` hosts
 * (`docs/developer-portal/env-setup.md`), because a dev database has no deployed host to point at.
 * Without this, the check would fail on every developer's machine and would quickly be ignored or
 * removed — which is how a safety check stops being one.
 */
export function isRoutableHost(host: string): boolean {
  const lower = host.trim().toLowerCase();
  if (!lower) return false;
  if (lower.includes(":")) return false; // carries a port — never a deployed host
  const hostname = lower.split("/")[0];
  return !hostname.endsWith("localhost");
}

/**
 * `missing` is the failure: a trading vendor whose host has no route, which is the tear-down case.
 * `stale` is a warning only — a host may legitimately be declared in config ahead of its vendor row
 * (that is exactly the order `wrangler.toml` and the seed were populated in for SriMart).
 */
export function compareRoutes(
  hosts: string[],
  patterns: string[],
): { missing: string[]; stale: string[] } {
  const routable = hosts.filter(isRoutableHost).map((h) => h.toLowerCase());
  const declared = new Set(patterns.map((p) => p.toLowerCase()));
  const live = new Set(routable);

  return {
    missing: [...new Set(routable.filter((h) => !declared.has(h)))].sort(),
    stale: [...declared].filter((p) => !live.has(p)).sort(),
  };
}

/** The block to paste into `wrangler.toml`. Same shape `parseRoutePatterns` reads. */
export function renderRoutesBlock(envName: string, hosts: string[]): string {
  const routable = [...new Set(hosts.filter(isRoutableHost).map((h) => h.toLowerCase()))].sort();
  return routable
    .map((host) => `[[env.${envName}.routes]]\npattern = "${host}"\ncustom_domain = true\n`)
    .join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const envIndex = args.indexOf("--env");
  const envName = envIndex >= 0 ? args[envIndex + 1] : undefined;
  const write = args.includes("--write");

  if (!envName || envName.startsWith("--")) {
    console.error(
      "usage: npx tsx scripts/verify-worker-routes.ts --env <staging|production> [--write]\n" +
        "  --write  print the wrangler.toml route block for this environment instead of comparing",
    );
    process.exit(1);
  }

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DIRECT_URL/DATABASE_URL is empty — cannot read VendorDomain.");
    process.exit(1);
  }

  // Read-only, so unlike the provisioning scripts this does NOT refuse a deployed database: reading
  // the live VendorDomain rows for the environment being deployed is the entire point.
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  let hosts: string[];
  try {
    hosts = (await prisma.vendorDomain.findMany({ select: { host: true } })).map((r) => r.host);
  } finally {
    await prisma.$disconnect();
  }

  if (write) {
    console.log(renderRoutesBlock(envName, hosts));
    return;
  }

  const patterns = parseRoutePatterns(readFileSync(WRANGLER_CONFIG, "utf8"), envName);
  const { missing, stale } = compareRoutes(hosts, patterns);
  const routableCount = hosts.filter(isRoutableHost).length;

  console.log(
    `env ${envName}: ${routableCount} routable VendorDomain host(s), ` +
      `${patterns.length} route pattern(s) in ${WRANGLER_CONFIG}`,
  );

  for (const pattern of stale) {
    console.log(
      `  WARNING  ${pattern} is routed but has no VendorDomain row — fine if the vendor is not ` +
        "created yet, otherwise stale",
    );
  }

  if (missing.length > 0) {
    console.error(
      `\nFAIL  ${missing.length} trading vendor host(s) have no route in ${WRANGLER_CONFIG} ` +
        `for env ${envName}:`,
    );
    for (const host of missing) console.error(`  ${host}`);
    console.error(
      `\nDeploying now would leave these hosts unrouted, and a wrangler deploy that omits a host ` +
        `that already has a custom domain TEARS THAT DOMAIN DOWN.\n` +
        `Add them with:  npx tsx scripts/verify-worker-routes.ts --env ${envName} --write`,
    );
    process.exit(1);
  }

  console.log("OK  every routable VendorDomain host has a route");
}

// Only when run as a script. `tests/worker-routes.test.ts` imports the pure functions above, and
// without this guard that import would execute main(), hit the database and call process.exit().
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
