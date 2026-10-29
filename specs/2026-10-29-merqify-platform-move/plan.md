---
id: merqify-platform-move-plan
title: "Move hosting to Merqify's Cloudflare account and data to a new Neon account (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-29
visibility: internal
summary: "#1323: deploys move from the Free-plan Nocaped Cloudflare account to Merqify's new account under flat merqify.com hosts, and a dry-run-first script fills a new Neon account from old staging with 10% of the products and no test orders or demo logins."
tags: [spec, hosting, cloudflare, neon, migration, merqify, security, ops]
related: [env-setup, architecture, event-gated-jobs-plan]
---

# Move hosting to Merqify's Cloudflare account and data to a new Neon account (plan)

**Goal:** get the platform deploying again (`#1323`: the Nocaped account dropped to Free and every
deploy fails with `code 100328`). Do it by moving to the **new Merqify Cloudflare account** and a
**new Neon account**, filled from the old staging database with a 10% product sample. This also
removes the production database blocker: `#1289`'s quota belongs to the old Neon project, which this
slice stops using.

## Background (verified 2026-10-29, read-only)

- **Four Cloudflare accounts are involved.**
  - **Nocaped:** today's Workers and the `nocaped.com` zone. On the Free plan, cannot deploy.
  - **Merqify:** new, holds `merqify.com`, no Workers yet.
  - **Aheed Food Centre:** a new account holding `aheedfoodcentre.co.uk`. It was created under the
    **same login as Nocaped**, **temporarily**. It moves under the Merqify login once that login may
    create accounts, after Cloudflare's 7-day wait (owner, 2026-10-29). It stays a separate account,
    which Cloudflare for SaaS requires. Untouched here.
  - **Cobrasmash:** where this machine's `wrangler login` points. It belongs to another project, so
    any manual wrangler command needs a `whoami` check first.
- **The shared `CLOUDFLARE_API_TOKEN` in `.dev.vars` and `secrets/*.vars` can read both the Nocaped
  and Aheed accounts**, because it is a token on the login that belongs to both. The new account
  gets one token per environment, **scoped to the Merqify account only**. This matters doubly
  because Aheed's account will also sit under the Merqify login, so a login-wide token would reach
  the client's account again.
- **Old staging** (`ep-empty-scene`, London, 80 migrations, 17 MB):
  - stores `aheed-food-centre` (2,045 products, of which 2,000 are the generated `gen-*` scale set),
    `srimart` (3) and `aheedsuperstore` (0, test store);
  - 128 orders, all test checkouts;
  - 14 users. Every one holding a role is an `@example.com` account, and `demo-admin` is still a
    platform ADMIN there.
- **Old production** returns Neon `HTTP 402` and cannot be read.
- `.github/workflows/deploy-staging.yml` reads `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` and
  `DIRECT_URL` from the GitHub environment, migrates, checks Worker routes against `VendorDomain`
  (`scripts/verify-worker-routes.ts`), then deploys. No `wrangler.toml` hardcodes an account ID, so
  repointing the GitHub environment secrets is what moves the deploy target.

## Owner decisions (2026-10-29, `#1323` comment)

- **Source data:** old **staging** fills **both** new databases.
- **10% of products:** every hand-seeded product plus every tenth `gen-*` product, with their stock,
  images and other per-product rows.
- **Test data stays behind:** orders, carts, payments, sessions and logs.
- **Flat hosts on `merqify.com`:** Universal SSL covers one level of subdomain.

| Purpose | Staging | Production |
|---|---|---|
| Aheed Food Centre | `aheed-staging.merqify.com` | `aheed.merqify.com` |
| SriMart (demo) | `srimart-staging.merqify.com` | `srimart.merqify.com` |
| Images (R2 custom domain) | `images-staging.merqify.com` | `images.merqify.com` |
| Internal docs (Access) | `docs.merqify.com` (one site) | |

- **Aheed Superstore is retired** (owner, 2026-10-29). It was an empty copy of Aheed Food Centre
  used to test onboarding, and the new Aheed Food Centre is itself the clean store. It is not
  copied to either database. Its route, `scripts/provision-aheedsuperstore-staging.ts`,
  `prisma/manifests/aheedsuperstore.json` and `tests/staging-test-vendor-onboarding.test.ts` are
  removed. The generic `scripts/provision-vendor.ts` and `prisma/manifests/example.json` stay.
- **No demo logins in the new production database.** Staging gets its demo roster back from
  `npm run demo:accounts -- add`, which also lands `#1319`'s roles.

## Scope (this slice)

1. **Host configuration:**
   - routes in `wrangler.toml`, `workers/scheduler/wrangler.toml` (`APP_BASE_URL`) and
     `kms/site-internal/wrangler.toml`;
   - the image CSP in `next.config.mjs`;
   - the hardcoded fallback host in `components/layout/StorefrontChrome.tsx`;
   - three `nocaped` reference values in `lib/vendor-readiness-service.ts`;
   - the "Subdomain Family SSO (.nocaped.com)" label in `app/(admin)/staff/platform/settings/page.tsx`.
2. **`scripts/migrate-to-new-neon.ts`:** a dry-run-first copy from one database to another, with
   explicit `--from` and `--to` env files and `--target staging|production`.
   - **Model classification:** every Prisma model is classified once in a committed table as copy,
     copy-filtered or skip. A test fails when a model is added without a classification, so a future
     table cannot be silently dropped from, or leaked into, a migration.
   - **Primary keys are kept**, so foreign keys and the image keys built from product IDs stay valid.
     This is what lets images be copied key for key, unlike `scripts/copy-product-images.ts`, whose
     environments had different IDs.
   - **`VendorDomain` is rewritten** to the table above, and old hosts are not copied.
   - **Refusals:** `--from` and `--to` are the same host; the target already has a `Vendor` row;
     the target host is protected (`scripts/lib/protected-hosts.ts`).
   - **After `--apply`,** the script re-counts every copied model against its plan and exits
     non-zero on any difference.
   - **`--copy-images`** copies every R2 object the copied rows reference from the source bucket to
     the destination bucket. A placeholder key whose source object is missing gets the placeholder
     SVG instead. Each missing key is reported, never silently skipped.
3. **`scripts/grant-role.ts`:** a dry-run-first grant of platform ADMIN, or a store ADMIN or STAFF
   membership, to an **existing** user. Without it the new production database has no admin, since
   every role-holder on old staging is an `@example.com` account the migration skips.
   - Store grants write `VendorRoleAuditLog`, as the staff UI does.
   - It refuses `@example.com` addresses unless `--allow-demo` is passed.
4. **Docs:**
   - `docs/developer-portal/env-setup.md` gets a "Merqify account" section: the owner checklist,
     `secrets/merqify-staging.vars` and `secrets/merqify-production.vars` pushed with
     `npm run configure-env -- <env> --file <path>`, the `wrangler whoami` guard, the ordered
     cut-over, and rollback;
   - `specs/architecture.md` gets the hosting statement;
   - `secrets/example.vars` gets the keys the new files need;
   - plus the handoff and the CHANGELOG.
5. **Staging cut-over, done live once the owner's setup exists:** secrets pushed, the migration
   dry run reviewed then applied, images copied, the CI deploy succeeding on the new account, and
   health checked on the new hosts.

## Deliberately excluded

- **Aheed's own domain** (`www.aheedfoodcentre.co.uk` through Cloudflare for SaaS) and **the
  client's real catalogue and files.** Both come in later slices, as the owner directed.
- **Production cut-over:** it rides the `staging → main` promotion and needs owner approval at each
  step. The runbook covers it; this slice validates staging only.
- **Old production's data** (unreadable, `#1289`), **Stripe live keys** (`#113`), **Connect**
  (`#1310`), **Resend domain verification** (`#104`), a **`merqify.com` marketing site** (the bare
  domain matches no store and goes to `/coming-soon`), **deleting anything in the Nocaped account**,
  **new demo stores**, and **`JOB_SIGNALS` KV namespaces** (`#1325`; optional, and the same
  commented placeholders apply).
- **Generated runbook copies** (`app/(admin)/staff/runbook/docs.ts`) refresh from the docs through
  `kms:build-index`, and `lib/running-costs.ts` keeps `nocaped.com` as a cost while the domain is
  held.

## Rollback

The Nocaped Workers keep serving their last build, and the old Neon projects and the old
`secrets/*.vars` files are untouched.

- **Before the new account works:** change nothing back; the failed deploy simply changes nothing.
- **After cut-over:** restore the previous GitHub environment values by re-running
  `npm run configure-env -- staging` with the old file. Revert this slice's config commit only if a
  deploy to Nocaped is wanted again, which still needs Workers Paid there.

## Open items carried forward

- **Owner, before staging cut-over:**
  - confirm Merqify is on Workers Paid; create the two R2 buckets with S3 keys and their custom
    domains;
  - per-environment scoped API tokens;
  - the new Neon staging and production projects in London, with the reference database new or
    kept;
  - a fresh `BETTER_AUTH_SECRET` per environment;
  - a Cloudflare Access application for `docs.merqify.com`;
  - the Stripe webhook and Google redirect URIs re-registered for the new hosts;
  - the source bucket's S3 keys, which `secrets/staging.vars` lacks today, for `--copy-images`.
- **Revoking the shared token** happens after cut-over, by the owner.
