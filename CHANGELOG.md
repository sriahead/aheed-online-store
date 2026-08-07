# Changelog

All notable changes to the Aheed Online Store are recorded here. Format based on
[Keep a Changelog](https://keepachangelog.com/). Per SDD Gate 4, this file is updated **before**
every branch merges.

## [Unreleased]

### Added
- **`docs/onboarding.md` refreshed** — was still framed around M0-only ("Feature work (P0+) starts
  only after M0 is green"), badly stale now that M0/P0/KMS/design-system have shipped and P1a is
  in flight. Updated: current phase status (pointing at `specs/roadmap.md`'s change log as the
  source of truth, not duplicating it), `.env` vs `.dev.vars` distinction, the `npm run preview`
  vs `npm run dev` DB-touching gotcha surfaced immediately rather than buried in `CLAUDE.md`, the
  seven-stage SDD workflow + slash commands, and a pointer to the internal docs site. Verified no
  real duplication with `kms/site-internal/`'s content — that site auto-assembles from `specs/`,
  `docs/`, and `CLAUDE.md` (confirmed all 20 backfilled docs, including this one, assemble
  correctly), nothing hand-duplicated there. Its one stale line (`content/dev/index.mdx` said
  pages were "populated once those docs carry real front-matter" — no longer true post-backfill)
  fixed to point at the now-real content instead.
- **SDD — backfill missing `plan.md` files + prevent future drift.** 4 slices had drifted to a
  two-file (`requirements.md`/`validation.md`) pattern, missing `plan.md` — unintentional; started
  with the design-system slice and got entrenched when `specs/sdd-workflow.md`'s own `/spec` stage
  only mentioned the other two. Fixed:
  - `specs/templates/feature-spec/{plan,requirements,validation}.md` — scaffolded for the first
    time (`docs/repo-structure.md` documented this directory but it never existed), so future
    slices copy a real template instead of improvising from "the most recent slice."
  - `plan.md` backfilled for `design-system`, `kms-backfill`, `kms-gates`, `kms-site` — the
    narrative (goal, scope, deliberately-excluded, rationale) that front-matter now lives on,
    moved off `requirements.md` to match the established one-entry-per-slice precedent.
  - `kms/schema/repo.ts`'s `walk()` now excludes `specs/templates/` — the template's placeholder
    front-matter (`id: REPLACE-ME-...`) would otherwise hard-fail `kms:validate` once gate-wired.
  - `specs/sdd-workflow.md` and `.claude/commands/spec.md` now require all three files for every
    new slice, not just two.
  - `specs/2026-08-06-p1-auth/plan.md` lands separately, directly on PR #24's branch (doesn't
    exist on `staging` yet).
- **KMS — front-matter backfill** (`specs/2026-08-06-kms-backfill/`), closing the last deferred
  item from the KMS foundation slice (`specs/2026-08-06-kms/requirements.md` R8).
  `ARTIFACT_INDEX.md` now indexes 19 docs instead of 1: `CLAUDE.md`, all three `docs/*.md`, the 9
  persistent `specs/` docs (architecture, mission, roadmap, tech-stack, design-system,
  sdd-workflow, and the 3 ADRs), and one representative file per dated slice folder. Matches the
  precedent already set by `specs/2026-08-06-kms/plan.md`: one indexed entry per meaningful
  doc/slice, not every acceptance-criteria file — sibling `requirements.md`/`validation.md` files
  stay deliberately un-indexed. `specs/2026-08-06-p1-auth/requirements.md` is excluded from this
  slice (doesn't exist on `staging` yet, only on PR #24) — its front-matter lands with that PR
  instead.
- **P1a — `plan.md`** added (`specs/2026-08-06-p1-auth/plan.md`) — part of backfilling the
  `plan.md` file every slice is now required to have (issue #27); this one lands directly on this
  branch since the spec folder doesn't exist on `staging` yet.
- **P1a — Email/password auth, RBAC, account shell** (`specs/2026-08-06-p1-auth/`), split from the
  full P1 roadmap line since Google Sign-In needs a Google Cloud Console OAuth client only the
  human can create (tracked as P1b, issue #23):
  - **Prisma**: `User` (`role` enum — `CUSTOMER`/`STAFF`/`ADMIN`, default `CUSTOMER`), `Session`,
    `Account`, `Verification` — Better Auth's standard relational shape, no `Json` columns,
    explicit FKs. Migration applied directly to Neon staging (`prisma migrate dev` — confirmed
    with the user, no separate local Postgres exists); CI's `prisma migrate deploy` no-ops on it.
  - `lib/auth.ts` — Better Auth server instance (Prisma adapter, email/password, required email
    verification, password reset). `role` added via `additionalFields` with `input: false` so a
    signup request can never set its own role. No Google/OAuth provider — P1a is email/password
    only. `lib/auth-rbac.ts` — `requireRole()` gates a route/action to one or more roles, returning
    401/403 (never a silent pass-through) rather than throwing.
  - `lib/email.ts` — new `EmailService` port + Resend adapter via plain `fetch` (no SDK, same
    Workers-bundle-size reasoning as `lib/storage.ts`'s `aws4fetch` choice). Degrades to a logged
    no-op, not a crash, when `RESEND_API_KEY` is unset.
  - `app/api/auth/[...all]/route.ts`, and UI under a new `app/(storefront)/` route group:
    `/login`, `/register`, `/forgot-password`, `/reset-password`, a protected `/account` shell.
  - **Prerequisite fix, found stress-testing this slice against the real Workers runtime**
    (`npm run preview`, not `next dev` — see below): `lib/db.ts`'s `getPrisma()` cached a Prisma/
    Neon client across requests, which Cloudflare Workers forbids (I/O objects can't cross request
    boundaries) — rapid sequential requests failed ~1-in-3 times with `"Cannot perform I/O on
    behalf of a different request."` Pre-existing since M0 (affects `/api/health` too, just never
    caught — validation never hammered it with back-to-back requests). Fixed: `getPrisma()` and
    `getAuth()` now construct fresh per call rather than caching across requests, matching Neon's
    own recommended pattern for serverless/edge. Stress-tested clean afterwards.
  - `eslint.config.mjs` now excludes `.wrangler/**` (missed alongside `.next/**`/`.open-next/**` —
    running `npm run preview` locally left bundled worker output that `npm run lint` was linting
    as source, producing dozens of bogus errors from third-party code).
  - **Gate 3 fix, found validating locally against the `gates` CI job's actual env**: `lib/email.ts`'s
    `getEmailService()` called the shared `getEnv()`, which requires `DATABASE_URL`/
    `BETTER_AUTH_SECRET` — unrelated to email — so `tests/email.test.ts` failed in any environment
    without those two set (including CI, which never provides them for the test step). Split a
    narrow `getEmailEnv()`/`emailSchema` out of `lib/config.ts` covering only
    `RESEND_API_KEY`/`RESEND_FROM_EMAIL`; `getEmailService()` now depends on that instead.
  - **Still needed from the human before this is live end-to-end**: `RESEND_API_KEY` (a Resend
    account/key — verification and password-reset emails currently log-and-skip, don't send) and
    `BETTER_AUTH_SECRET`/`RESEND_API_KEY` set via `wrangler secret put` on staging/production.
  - **Discovered while validating, not fixed (documented for awareness)**: `@prisma/client/wasm`
    cannot load under plain `next dev` (Node.js runtime, not workerd) — any DB-touching route
    silently shows an error state under `npm run dev`. Always use `npm run preview` (OpenNext +
    local Workers runtime) to validate DB-touching code; `next dev` is UI-only from now on.
- **KMS — gate wiring** (`specs/2026-08-06-kms-gates/`), closing the last deferred item from the
  KMS design (`specs/2026-08-06-kms/plan.md` §2, `requirements.md` R8). `gates.yml` now runs
  `kms:validate` and an `ARTIFACT_INDEX.md` staleness check (regenerated and diffed with the
  `Last build:` timestamp normalized out, so the check is meaningful rather than always failing).
  Includes two prerequisite bug fixes found while grounding — wiring the validator as originally
  sketched would have broken every future PR:
  - `kms/schema/repo.ts`'s `walk()` now excludes `kms/site-*/content/` (assembled/generated site
    output) — it was indexing the same doc twice (source path + assembled copy) and wasn't even
    deterministic in CI, since that gitignored directory doesn't exist on a fresh checkout.
  - `kms/schema/validate.ts` now distinguishes "no front-matter" from "front-matter present but
    missing `visibility`" (the schema's own required, no-default field) — the latter is reported
    informationally, not hard-failed. Fixes false-positive failures on `.claude/commands/*.md`
    (Claude Code's own `description:` frontmatter) and Nextra's `title:`-only stub pages.
- **SDD workflow, generalized as keywords + slash commands** (`specs/sdd-workflow.md`,
  `.claude/commands/`). Expands CLAUDE.md's four gates (Propose/Spec/Validate/Changelog) into seven
  stages — **Orient → Propose → Spec → Build → Validate → Document → Ship** — each also an
  invokable slash command, generalized from patterns and failure modes actually hit running the
  process across the KMS and design-system-tokens slices (stale planning-doc traps, Windows
  `core.autocrlf` giving false `prettier --check` positives against real CI, PRs merging before a
  fast-follow commit landed, a Gate-4 CHANGELOG check whose diff base moves between pushes).
  `CLAUDE.md`'s gate section now points to it.
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
