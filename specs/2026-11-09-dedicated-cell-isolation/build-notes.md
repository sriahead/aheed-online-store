# Dedicated Cell Isolation: Aheed Food Centre Deployment Topology & CI (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

## What changed and why

1. **Wrangler Configuration:**
   - Updated root `wrangler.toml` to define dedicated cell environments `[env.afc-staging]` and `[env.afc-production]`, binding dedicated Workers (`afc-store-*`), dedicated R2 image bucket bindings (`afc-images-*`), custom domain routes (`staging.aheedfoodcentre.co.uk` and `www.aheedfoodcentre.co.uk`), dedicated KV namespaces (`JOB_SIGNALS`), and variables (`PLATFORM_NAME = "Aheed Food Centre"`).
   - Updated `workers/scheduler/wrangler.toml` and `workers/inbound-email/wrangler.toml` with conforming `afc-staging` and `afc-production` environments.
2. **Lockstep Multi-Cell CI Deployments:**
   - Modified `.github/workflows/deploy-staging.yml` and `.github/workflows/deploy-production.yml` to compile the single OpenNext bundle once, run database migrations sequentially across `DIRECT_URL` and `AFC_DIRECT_URL`, verify routes for each target, and deploy platform workers followed by dedicated AFC workers.
3. **Route Verification Script Support:**
   - Updated `scripts/verify-worker-routes.ts` usage to accept `--env afc-staging` and `--env afc-production`.
4. **Dedicated Cell Bootstrap Tooling:**
   - Created `scripts/bootstrap-dedicated-cell.ts` to idempotently seed the canonical `Vendor` (`a4ed0000-0000-4000-a000-000000000001`), domain mappings, satellites, fulfilment schedule, footer defaults, and WhatsApp community defaults, with a strict refusal if demo accounts exist on production targets.
5. **Architecture & ADR:**
   - Codified ADR-009 (`specs/decisions/ADR-009-dedicated-client-cells.md`) and updated `specs/architecture.md` and `docs/developer-portal/env-setup.md`.
6. **Unit Tests:**
   - Added `tests/dedicated-cell-topology.test.ts` (6 tests) and `tests/bootstrap-dedicated-cell.test.ts` (7 tests).

## Decisions taken during the build

1. **`AFC` Prefix Across Configuration & Secrets:**
   - Followed user direction to use `AFC` as the prefix across environments (`afc-staging`, `afc-production`), buckets (`afc-images-*`), and GitHub environment secrets (`AFC_DIRECT_URL`, `AFC_DATABASE_URL`).
2. **Sequential CI Execution With Secret Guards:**
   - In `.github/workflows/deploy-staging.yml` and `.github/workflows/deploy-production.yml`, AFC migration and deployment steps are guarded by `if: env.AFC_DIRECT_URL != ''` so staging CI does not crash while the repository owner is setting up the live GitHub secrets, while guaranteeing that once populated, deployments execute strictly in lockstep.
3. **Dry-Run & Pure Function Testing in Bootstrap Script:**
   - Structured `scripts/bootstrap-dedicated-cell.ts` into pure argument parsing and a core `bootstrapDedicatedCell` function accepting an injected Prisma client, enabling unit testing of production guards and dry runs without requiring live database connections.

## Deviations from the spec

None.

## Known-shaky areas

1. **Live Cloudflare Secret Provisioning:**
   - While `wrangler.toml` defines the structure, live deployment requires the owner to run `wrangler secret put DATABASE_URL --env afc-staging` and set `AFC_DIRECT_URL` in GitHub environment secrets before the AFC Worker can query the live Neon database.
2. **Custom Hostname Ingress:**
   - The custom domain routes `staging.aheedfoodcentre.co.uk` and `www.aheedfoodcentre.co.uk` require Cloudflare for SaaS custom hostname registration and SSL certificate validation (detailed in `docs/platform-admin-guide/cloudflare-saas-onboarding-runbook.md`).
