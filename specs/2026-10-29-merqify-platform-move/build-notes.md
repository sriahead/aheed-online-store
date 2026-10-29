# Move hosting to Merqify's Cloudflare account and data to a new Neon account (build notes)

Written at the end of Build, **before** the Clear. Spec committed `418235b`; implementation
`2c16f31` on `feature/merqify-platform-move`. That branch was cut from `docs/carry-forward-1324`, so
it also carries `#1324`'s Document commit (`237bd37`: roadmap row 1.186.0, handoff).

## What changed and why

- **Hosts (R1–R6).**
  - `wrangler.toml` staging has two routes (`aheed-staging`, `srimart-staging`) and production two
    (`aheed`, `srimart`), all on `merqify.com`.
  - `workers/scheduler/wrangler.toml` points `APP_BASE_URL` at the Aheed host of each environment.
  - `kms/site-internal/wrangler.toml` routes `docs.merqify.com`; its comment now says the Access
    application must exist before the secrets are repointed.
  - `next.config.mjs` `img-src` is `https://*.merqify.com`.
  - `StorefrontChrome.tsx` has no fallback host: an empty host makes the referral link merely
    unusable, never another store's address.
  - `lib/vendor-readiness-service.ts`:
    - the domain reference is `aheed.merqify.com`;
    - the email reference is a neutral description, not an invented address;
    - "Client Apex Domain DNS" shows the store's own mapped host instead of a hardcoded superstore
      host.
  - The platform settings page's "Subdomain Family SSO (.nocaped.com)" label was **already wrong**:
    `AUTH_COOKIE_FAMILY_DOMAIN` is unset everywhere, so cookies are host-only. It now says
    "Host-only (one session per store host)".
- **Aheed Superstore retired (R1a).** Deleted its provisioning script, its manifest and
  `tests/staging-test-vendor-onboarding.test.ts`. One literal in
  `tests/vendor-manifest-placeholders.test.ts` became `store.localhost:8787`.
- **`scripts/lib/neon-migration-plan.ts`** holds every decision about which rows travel, as pure
  data and functions:
  - `MODEL_PLAN` classifies all 69 models;
  - `VENDOR_SLUGS` and `VENDOR_HOSTS`;
  - `isDemoEmail`, `isSelectedProductSlug` and `selectProducts`;
  - `IMAGE_KEY_FIELDS`, the nine key columns found in the schema;
  - `isPlaceholderKey`;
  - `parseForeignKeys`, `insertOrder` and `applyForeignKeys`.

  `tests/neon-migration-plan.test.ts` (R9–R11, R12a and R14 at unit level) parses
  `prisma/schema.prisma` itself.
- **`scripts/migrate-to-new-neon.ts` (R7–R18).**
  - It reads both `DIRECT_URL`s from the env files, prints them with `***` for the password, and
    refuses before any write in these cases: the same host, a protected target
    (`assertNotDeployedDatabase`), a target that already holds a `Vendor`, or a file with no
    `DIRECT_URL`.
  - It builds the plan from the source alone, then on `--apply` inserts with `createMany` in chunks
    of 500, in foreign-key order, keeping the original ids.
  - It writes the two generated `VendorDomain` rows and re-counts every model.
  - `--verify-only` re-plans and compares without writing and without the empty-target refusal.
  - `--copy-images` copies every key the copied rows reference. A missing `products/*/main.svg` gets
    the placeholder; any other missing key fails the run.
- **`scripts/grant-role.ts` (R19, R20).** Grants platform ADMIN, or upserts a store membership and
  writes one `VendorRoleAuditLog` row in one transaction with `actorId: null`. It refuses a missing
  user and an `@example.com` address unless `--allow-demo` is passed.
- **Docs.**
  - `env-setup.md` 1.23.0 has a new "Merqify account" section (R21): the account-check guard, the
    owner checklist, the files and command, the eight staging cut-over steps, the production order,
    and rollback.
  - `architecture.md` 1.44.0 has a "Where it runs" paragraph (R22).
  - `secrets/example.vars` gains `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, comments for the new
    hosts and `merqify-*` file names (R23).
- **Tests.** `tests/worker-routes.test.ts` gains a "repository Worker config (#1323)" block that
  reads the **real** `wrangler.toml`, scheduler and docs configs. The old tests only checked a
  fixture, so R1–R5 had no test against the real files before.

## Decisions taken during the build

- **The schema text is the source of foreign keys, not `Prisma.dmmf`.** With
  `engineType = "client"` the runtime data model came back with **zero relations and zero `@id`
  fields across all 69 models** (measured), so a copy driven by it would have inserted children
  before parents. `parseForeignKeys` reads `@relation(fields:…, references:…)` and treats a key as
  required when none of its scalars is `?`.
  - The result has 112 foreign keys.
  - `Category.parentId` is the only self-reference. Rows are inserted parents-first in repeated
    passes.
  - Two keys are composite with `vendorId` (`Product` → `Category`, `ProductAttributeValue` →
    `VendorAttribute`/`VendorAttributeOption`). The copied-value check runs per column, which is
    sufficient because the ids are unique.
- **`Bundle` is decided before products are inserted.** A bundle references no product, so
  foreign-key order puts it first, while its survival depends on its items' products. The sample is
  computed up front from `Product` and `BundleItem`.
- **`VendorDomain` is classified `skip`** (it is not copied) and generated afterwards. The spec's
  three classes have no "regenerate" class, and adding one would have widened the R9 table for one
  model.
- **The grant tool writes its own two rows instead of calling `applyVendorRole`.** That function
  needs an acting `User` row for the audit, and a one-off operator grant has none. `actorId: null`
  is allowed by the schema (`onDelete: SetNull`) and marks the change as made outside the app.
- **The grant tool applies no protected-host guard.** It must be usable on the new production
  database, and if the `merqify-*` files are later renamed to `staging.vars` / `production.vars`, a
  guard would block exactly the case it exists for. It prints the host and needs `--apply`.
- **The new files sit beside the old ones** (`secrets/merqify-*.vars`, pushed with
  `configure-env --file`) rather than replacing them, so rollback is one command.
- **The docs site's Access dependency is handled by the runbook, not code.** The order is
  "Access application first" (step 2 of the owner list), and the comment in the docs `wrangler.toml`
  says the same. An automated pre-deploy guard would be new scope, so it is filed as a follow-up.

## Deviations from the spec

- **R1a's "no file under `app/` contains `aheedsuperstore`" is not met by
  `app/(admin)/staff/runbook/docs.ts`.** That file is **generated** by `kms:build-index` from
  historical specs and docs (`specs/2026-10-22-aheedsuperstore-onboarding/`,
  `specs/2026-10-25-aheedsuperstore-staging-onboarding/`, the handoff, the roadmap), which must not
  be rewritten. `plan.md` already excludes the generated runbook copies, and R1a should have carved
  the file out. Every hand-written file passes:
  `rg -l aheedsuperstore app components lib scripts prisma/manifests tests` lists only that file.
- **R17's second half ("delete one row, then `--verify-only` exits non-zero") is implemented as
  `--verify-only`.** The spec said "or equivalent, as built". `--verify-only` re-plans from the
  source and compares counts. It skips the empty-target refusal and writes nothing.

## Known-shaky areas

- **No `--apply` has run yet.** The refusals (R8a–d) and the full plan were run against the real
  old staging database, read-only:
  - 6 users kept and 8 dropped; 2 stores;
  - 248 products (Aheed 245 + SriMart 3) and 248 inventory rows;
  - 237 product images, 49 categories, 59 category assets, 5 bundles with 14 items, and 15 discount
    codes, one with its demo referral owner nulled;
  - **0 store memberships**, because every one belongs to a demo account;
  - two generated hosts.

  The `createMany` path, the parents-first `Category` insert and the re-count have **not** touched a
  real target. Validate R12–R17 against a disposable database (a fresh Neon project, or a branch of
  the new staging project) before the real one.
- **`createMany` on the Neon WebSocket adapter with original ids** is untested here. Values Prisma
  returns from `findMany` (DateTime, enums, Decimal if any) go straight back into `createMany`.
  Watch for a type complaint on the first real run.
- **Image copy (R18) needs source S3 keys that `secrets/staging.vars` does not hold.** It also needs
  the old Nocaped R2 to answer, and it returned 403 on public reads at `#1323`'s opening. If the
  source reads fail, generated `webp` images are reported missing. Placeholders are restored.
- **The image `contentType` comes from the key's extension.** The source's own `content-type` header
  is not carried over.
- **`R24`–`R27` (live staging) cannot run until the owner's setup exists**: the Merqify account on
  Workers Paid, buckets, scoped tokens, the Access application, and the new Neon projects. Report
  them unverified until then.
- **The docs site's public exposure.** If the staging environment's Cloudflare secrets are repointed
  before the Access application exists, the next push to `staging` publishes internal docs on
  `docs.merqify.com`.
- **Merging to `staging` before the secrets move.** `deploy-staging` and `deploy-docs-internal` would
  try to deploy merqify routes **into the Nocaped account**. The app deploy already fails there
  (`code 100328`). The docs deploy dropping its old `docs.internal…nocaped.com` route may tear down
  the old docs custom domain, or fail on a zone it cannot see. Either way nothing reaches a merqify
  host. Prefer moving the secrets (runbook steps 1–5) before merging.
- **Old staging's `localhost` `VendorDomain` row** is deliberately not copied. Local preview against
  a new database has to add its own.
