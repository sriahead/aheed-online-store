---
id: merqify-platform-move-plan
title: "Move hosting to Merqify's Cloudflare account and data to a new Neon account (plan)"
audience: [dev]
type: spec
status: draft
version: "1.1.0"
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
- **Superseded 2026-10-29 (amendment 5): demo logins ARE allowed in every environment, production
  included, until go-live, when they are deleted.** The copy still skips `@example.com` users,
  because their roles on old staging are stale; each environment gets a fresh roster from
  `npm run demo:accounts -- add`. Original text: "No demo logins in the new production database."
  Staging gets its demo roster back from
  `npm run demo:accounts -- add`, which also lands `#1319`'s roles.

## Amendment (owner, 2026-10-29, after Build)

"Even `uk-location-reference` should be from the Merqify Neon account. The aim is to move
everything to Merqify and free up Nocaped." So:

- **The reference database is rebuilt** from the public datasets in a new project in the Merqify
  Neon account, rather than copied. The repo's sync script is the documented bootstrap, and a fresh
  primary also ends `#1123` (the old "direct" URL names a read replica).
- **The dev database moves** too, seeded the normal way.
- **`nocaped` addresses inside copied data are flagged, not rewritten**: two `VendorConfig`
  addresses on old staging. Inventing replacement email addresses is not ours to do.
- **`configure-env` pushes the two reference URLs, and runs wrangler against the file's own
  account.** Before this, it ran wrangler under the machine's login, which on this machine is an
  unrelated account (Cobrasmash): Worker secrets meant for Merqify would have landed there.
- **A "Freeing Nocaped" checklist** lists what can be deleted once both environments are proven,
  each item with owner approval. Requirements R28–R34; the gates are renumbered R35–R36.

## Amendment 4 (owner, 2026-10-29): platform cell plus dedicated client cells

The owner's model:
- **ShopLocal** (`shoplocal.merqify.com`) is a subscription multi-vendor platform.
- **Aheed Food Centre** at `aheedfoodcentre.co.uk` runs as an independent business, "with a
  separate database and client data, managed through Merqify". For now it is hosted in the Merqify
  account, and could later move into the client's own.

The app holds one database connection per Worker, so a separate database means **a separate
deployment of the same code**: a dedicated cell. Choosing a database per request was rejected; it
would rewrite every service.

Owner decisions (AskUserQuestion):
- the platform database holds **SriMart plus an Aheed demo copy**;
- **this slice moves the platform cell only**, and a new slice builds the Aheed cell;
- Aheed's staging will be `staging.aheedfoodcentre.co.uk`, through Cloudflare for SaaS, in that
  slice.

Consequences here:
- No code change. `VENDOR_SLUGS` already copies `aheed-food-centre` and `srimart`, which now
  makes the demo copy.
- The Neon projects are **Shoplocal**, **Shoplocal Staging** (branches `dev` and `scratch`) and
  **uk-location-reference**, all created by the owner on 2026-10-29.
- The **Aheed Food Centre** projects are reserved for the client cell.
- Requirements R34a and R34b.

## Amendment 6 (`/validate` finding, owner chose option A, 2026-10-29): a migrated target is never empty

**Found by:** `/validate`, running R7 against the scratch Neon branch after the owner applied all 79
migrations. The script refused: "the target already holds 1 store(s)".

**Cause:** `prisma/migrations/20260808130000_multitenancy_vendor_scope/migration.sql:82` inserts the
Aheed vendor (`a4ed0000-0000-4000-a000-000000000001`, slug `aheed-food-centre`). Every migrated
database has it, so the original "target holds no `Vendor`" refusal fired on every correctly prepared
target and `--apply` was unreachable. The spec's Setup ("an empty database with migrations applied")
and R7's "count is 0" could not both hold. It is the spec that was wrong, not the build.
It is also why loosening the check alone would not do: old staging ran the same migration, so its
`aheed-food-centre` very likely has the same fixed id, and copying it with its original key (R16)
would collide with the seeded row on both the primary key and the unique slug.

**Options considered (owner chose A):**
- **A. Accept a `seeded-only` target, delete the seeded row at `--apply`, then insert the copied
  vendor.** Keeps R16 for the vendor. Adopted.
- **B.** Accept it and update the seeded row in place instead of inserting. Rejected: the update would
  need its own column list kept in step with the schema, where delete-then-insert reuses the
  existing insert path.

**Design (R8a–R8d):**
- A pure `classifyTargetVendors` returns `empty`, `seeded-only` or `occupied`. It matches the seeded
  row on **both** id and slug, so a lookalike never passes.
- **A guard that the row owns nothing** (R8b) comes before the delete. The migrations insert only
  that one `Vendor` row (their later `UPDATE`s match zero rows on a fresh database), but many foreign
  keys to `Vendor` cascade, so a bare delete on a target someone had started to populate would drop
  their rows without a word. The guard's model list comes from the schema, not a hand-written list.
- The delete happens in `--apply` only. Dry run and `--verify-only` write nothing.
- The runbook says a target is *freshly migrated*, and a failed apply is *reset*, not re-run (R8d).

**Deliberately not done:**
- **No atomic apply.** The delete and the inserts are separate statements over the HTTP-capable
  adapter, so a failure partway leaves a partial target. Recovery is a reset of the disposable
  branch (R8d). Wrapping the run in one interactive transaction on `getPrismaWs()` is a larger
  change, and a new target has nothing to lose.
- **No change to what is copied.** `VENDOR_SLUGS`, the model table, R12–R18 and the grant tool are
  untouched. The scratch branch and its owner-run reset are unchanged from the handoff.

**Process note:** this amendment was written on **Sonnet 5.5**, not Opus 5, at the owner's explicit
request ("Proceed on Sonnet, run /spec"), after the model mismatch was flagged under `CLAUDE.md`'s
rule. The change is small, but it is a wrong-model Spec stage; the adversarial pass below is the
compensation, and `/build` should be run on Opus 5 if the owner switches.

**Adversarial pass (checked before presenting):**
- *Does R8c contradict R13/R16?* No: both are tightened, and the vendor's id is asserted equal to the
  source's.
- *Does R17's count check still hold?* Yes: `Vendor` is planned at two and counted at two.
- *Does `--verify-only` still work on a filled target?* Yes: it skips the vendor-state refusal as
  before and deletes nothing (R8c).
- *Can a hand-emptied target pass?* Yes, as `empty`; R8d warns against it, because hand-emptying
  cascades in the other direction, but the script does not forbid it.
- *Is a seeded row with an edited name still `seeded-only`?* Yes (id and slug match). R8b still
  protects any dependents, and the name is replaced by the source's. No requirement depends on the
  old name.
- *Production target:* identical, since the same migration runs there. Not exercised in this
  slice's validation (staging only).

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
   - **Refusals:** `--from` and `--to` are the same host; the target holds any `Vendor` other than
     the migration-seeded one (Amendment 6), or that one has dependent rows; the target host is
     protected (`scripts/lib/protected-hosts.ts`).
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
  (`#1310`), **the email provider change** (Resend retired in favour of a provider-agnostic
  `EmailService` with Cloudflare Email Service, `#1217`; this slice only carries the Resend values
  as a stopgap, owner 2026-10-29), a **`merqify.com` marketing site** (the bare
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
  - the new Neon staging, production, reference and dev projects in London (amendment: the
    reference database moves too);
  - a fresh `BETTER_AUTH_SECRET` per environment;
  - a Cloudflare Access application for `docs.merqify.com`;
  - the Stripe webhook and Google redirect URIs re-registered for the new hosts;
  - working source-bucket S3 keys for `--copy-images`. Corrected 2026-10-29: `secrets/staging.vars`
    already holds them; the earlier "lacks" came from a key listing that skipped names with digits;
  - a dev R2 bucket and CDN host in Merqify (`images-dev.merqify.com`), replacing Nocaped's
    `aheed-images-dev` (amendment 2).
- **Revoking the shared token** happens after cut-over, by the owner.
