# Changelog

All notable changes to the Aheed Online Store are recorded here. Format based on
[Keep a Changelog](https://keepachangelog.com/). Per SDD Gate 4, this file is updated **before**
every branch merges.

## [Unreleased]

### Milestone
- **M0 — Walking Skeleton closed.** `/api/health` returns `db.ok: true` on both staging and
  production; `gates`, `deploy-staging`, and `deploy-production` all green end-to-end. Proceeding
  to P0 per `specs/roadmap.md`.

### Fixed
- **M0 infrastructure fixes to actually reach `db.ok: true` in production:**
  - `PrismaNeon` adapter takes a `PoolConfig` (`{ connectionString }`), not a `Pool` instance.
  - `prisma/schema.prisma` generator now sets `engineType = "client"` — the default `"library"`
    engine calls `fs.readdir` at runtime, unsupported by workerd's `nodejs_compat` polyfill.
  - `lib/db.ts` imports `PrismaClient` from `@prisma/client/wasm` explicitly, not the bare
    `@prisma/client` specifier — Next's Node-based build tracer otherwise resolves the `"node"`
    export condition (`fs.readFileSync`-based loader) even though the code runs in workerd.
  - `package-lock.json` resynced with `package.json` (`npm ci` was failing in CI); restored the
    `allowScripts` allowlist needed for native postinstall scripts under npm 11+.
  - Wired up the GitHub Actions deploy pipeline: created the missing `staging` environment,
    populated `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`DIRECT_URL` secrets on both
    environments, set the Worker's own runtime `DATABASE_URL` secret (`wrangler secret put`),
    enabled R2 and created the image buckets. Disabled the competing Cloudflare Workers Builds
    git integration, which was misconfigured (wrong build command, no `--env`, skipped migrations)
    and racing against the correct GitHub Actions pipeline.

### Changed
- **Upgraded to Next 16 / vitest 4** (deliberate major-version adoption, not incremental):
  - `next lint` (removed in Next 16) replaced with plain `eslint .`; migrated `.eslintrc.json` to
    flat config (`eslint.config.mjs`) using `eslint-config-next/core-web-vitals`.
  - `dev`/`build` scripts pin `next ... --webpack` — Turbopack (Next 16's default) can't resolve
    `@prisma/client/wasm`'s subpath export (`Module not found`), even though webpack and the
    package's `exports` map both handle it fine.
  - `vitest.config.ts` → `vitest.config.mts` (vitest 4's native config loader warns on ESM syntax
    in a file loaded as CommonJS).
  - `tsconfig.json`: `jsx` → `"react-jsx"` (Next 16 requires the automatic runtime); added
    `.next/dev/types/**/*.ts` to `include`.
  - Restored `@neondatabase/serverless` to an exact pin (`0.10.4`, no caret) and
    `@opennextjs/cloudflare` to `^1.20.2` — both had drifted to older/looser ranges outside this
    change.

### Added
- **Milestone 0 — Walking Skeleton.** Minimal end-to-end app to validate the pivoted
  infrastructure before feature work: `HealthCheck` model, `/` page and `/api/health` route that
  read it back through Prisma → Neon.
  - Next.js on **Cloudflare Workers** via `@opennextjs/cloudflare` (`open-next.config.ts`,
    `wrangler.toml` with `staging`/`production` envs + custom domains + `nodejs_compat`).
  - `lib/config` (zod env with `getCloudflareContext()` fallback), `lib/db` (Neon serverless driver
    adapter, lazy singleton), `lib/storage` (S3-compatible port via `aws4fetch`, keys-not-URLs).
  - GitHub Actions: `gates.yml` (lint/typecheck/test + CHANGELOG check), `deploy-staging.yml`
    (auto), `deploy-production.yml` (manual approval via `production` environment). Migrations run
    in CI against `DIRECT_URL`; runtime uses pooled `DATABASE_URL`.
  - SDD assets: feature/bug issue forms, PR template, gate labels; M0 spec
    (`specs/2026-08-05-m0-walking-skeleton/`) and `docs/walking-skeleton-runbook.md`.
- SDD constitution + `specs/architecture.md` (Cloudflare Workers + Neon design, migration strategy).

### Changed
- Roadmap now begins with **Milestone 0 (Walking Skeleton)** ahead of P0, so infrastructure is
  proven end-to-end before scaffolding features.
- Hosting pivoted from GCP Cloud Run + Cloud SQL to **Cloudflare Workers + Neon** (revised ADR-001);
  object storage via the **S3-compatible API only** (ADR-003).

### Notes
- No feature code beyond the skeleton. Auth, catalogue, cart, checkout, and the design system
  arrive in P1+ behind their specs and gates.
