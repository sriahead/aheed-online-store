# Changelog

All notable changes to the Aheed Online Store are recorded here. Format based on
[Keep a Changelog](https://keepachangelog.com/). Per SDD Gate 4, this file is updated **before**
every branch merges.

## [Unreleased]

### Added
- **P0 — Design-system tokens** (`specs/design-system.md`, `specs/2026-08-06-design-system/`),
  closing the last item deferred from the P0 foundation slice below. Encodes the Aheed brand kit
  as real tokens rather than leaving Tailwind uninstalled:
  - Tailwind CSS v4, CSS-first `@theme` config (no `tailwind.config.ts` — v4's own recommended
    default; `docs/repo-structure.md`'s sketch of a JS config is stale, same as its now-wrong P6
    tag on `tsconfig.json`).
  - `design-system/tokens/tokens.css` — primitive brand-kit colors (`--color-brand-*`) layered
    under semantic tokens (`--color-primary`/`--color-action`/`--color-accent`/`--color-danger`/
    `--color-surface-muted`) plus radius tokens, so components read the semantic layer, never a
    raw hex. Two hover/active shades are derived (not brand-sourced) and commented as such.
  - Poppins loaded via `next/font/google` (self-hosted at build, no runtime request — matters on
    Workers), one family at two weights (400/600), not two families.
  - `app/globals.css`/`app/page.tsx` restyled with the tokens to prove they flow live, not just
    sit as unused config; the old hand-rolled `.card`/`.ok`/`.bad` CSS is gone.
  - Deliberately deferred: real logo source files (the brand kit is a reference image, not
    exportable assets), `components/`/`design-system/{components,patterns,pages,guidelines}/`
    (nothing consumes tokens yet), dark mode, and the hex/px-banning eslint rule (P6-tagged).
- **P0 — Foundation & scaffolding (first slice).** Hardens what M0 proved, scoped to what wasn't
  already built during M0's infrastructure work (`specs/2026-08-06-p0-foundation/`):
  - Local SDD git hooks (`hooks/pre-commit` — Gate 2 spec-before-code, `hooks/pre-push` — Gate 4
    changelog-before-merge), activated by the `core.hooksPath` wiring `scripts/bootstrap.sh`
    already had. Fast local feedback only — `gates.yml` in CI remains the real enforcement.
  - Prettier (`.prettierrc.json`, `.prettierignore`, `npm run format`/`format:check`), wired into
    `gates.yml`. Deliberately excludes `.md`/`.mdx` — Prettier's markdown table reformatting pads
    every cell to align columns, which wrecks readability on long-prose cells.
  - `app/robots.ts`, `app/sitemap.ts`, `app/manifest.ts` — the Next.js App Router convention for
    SEO/PWA metadata (route files under `app/`, not static files under `public/`). `robots.ts` is
    host-aware: only the production domain allows crawling, staging always disallows. No brand
    icon assets exist yet, so `manifest.ts` ships an empty `icons` array rather than fabricated
    placeholders — a real follow-up needing actual brand input.
  - `tests/setup.ts`, wired into `vitest.config.mts`'s `setupFiles` — loads `.env` for tests that
    read `process.env`.
  - Deliberately out of scope: design-system tokens (no `specs/design-system.md` spec exists yet),
    `lib/repositories/` (nothing to wrap until P1's catalogue models exist), and GitHub
    branch-protection rules on `main`/`staging` (a real gap, flagged as a follow-up recommendation).
- **KMS — front-matter schema & validator (foundation slice).** First piece of the knowledge-
  management system design (`specs/2026-08-06-kms/plan.md`): `kms/schema/frontmatter.ts` (the Zod
  contract — `id`, `title`, `audience`, `type`, `status`, `version`, `updated`, `visibility`,
  `summary`, `tags`; `visibility` has no default, so a doc can never silently become public) and
  `kms/schema/validate.ts` (`npm run kms:validate` — walks all `.md`/`.mdx`, hard-fails on invalid
  front-matter, warns on missing front-matter without blocking). `ARTIFACT_INDEX.md` moved to the
  repo root per the design's folder structure. Deliberately deferred to follow-up work: the index
  generator, the internal/public site assembly, CI gate wiring, and backfilling front-matter onto
  existing docs — see `specs/2026-08-06-kms/requirements.md` R8.
- **KMS — index generator, assembly & internal site** (`specs/2026-08-06-kms-site/`), the deferred
  follow-up to the schema/validator foundation slice above:
  - `kms/scripts/build-index.ts` (`npm run kms:build-index`) walks front-matter docs and regenerates
    `ARTIFACT_INDEX.md` grouped by track; deterministic output aside from its `Last build:` timestamp.
  - `kms/scripts/assemble.ts --visibility internal|public` (`npm run kms:assemble:internal`/`:public`)
    copies single-source docs into a site's `content/` by `visibility`, so doc bodies are never
    duplicated by hand. Both scripts share new `kms/schema/repo.ts` (walk/parse helpers factored out
    of `validate.ts`).
  - `kms/site-internal/` — a standalone Next.js + Nextra 4 app (own `package.json`, own toolchain,
    excluded from the root's lint/typecheck via `eslint.config.mjs`/`tsconfig.json`) serving
    assembled docs under `/dev`, with `/staff` stubbed. Its `wrangler.toml` targets a separate Worker
    (`aheed-kms-internal`) with `workers_dev = false` and the custom-domain route commented out —
    not internet-reachable until the human provisions DNS + a Cloudflare Access application gating it
    (zero-trust; the site has no auth of its own).
  - `.github/workflows/deploy-docs-internal.yml` mirrors `deploy-staging.yml`'s build-then-deploy
    pattern, triggered on push to `staging`/`main`. Safe to run before Cloudflare-side provisioning
    exists (no public route to expose), but won't do anything useful until it does.
  - The public site (track 3) stays stubbed — no storefront exists yet to document.
### Milestone
- **M0 — Walking Skeleton closed.** `/api/health` returns `db.ok: true` on both staging and
  production; `gates`, `deploy-staging`, and `deploy-production` all green end-to-end. Proceeding
  to P0 per `specs/roadmap.md`.

### Fixed
- `kms/scripts/assemble.ts`, `kms/scripts/build-index.ts`, `kms/site-internal/tsconfig.json`
  reformatted to satisfy `prettier --check` — missed locally because a Windows checkout
  (`core.autocrlf=true`) masks real formatting diffs behind line-ending noise; `gates` runs on
  Linux/LF and caught it. No logic changes. (Landed on `staging` via PR #10; this entry was
  originally missed there — see #11.)
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
