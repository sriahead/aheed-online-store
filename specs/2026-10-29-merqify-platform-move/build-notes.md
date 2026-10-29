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

### Amendment build (spec `51b8842`): everything moves, Nocaped is freed (R28–R34)

- **`scripts/configure-env.mjs` (R29, R30).**
  - New optional keys: `UK_LOCATION_REF_DIRECT_URL` (GitHub environment secret) and
    `UK_LOCATION_REF_DATABASE_URL` (Worker secret). Both are optional so an old file still pushes.
  - **Every `wrangler` spawn, including the `whoami` check, now runs with `CLOUDFLARE_ACCOUNT_ID`
    and `CLOUDFLARE_API_TOKEN` from the file being pushed.** It prints
    `Cloudflare target: account …<last 6>` in both the dry run and the real run.
  - **Why this matters:** before the change it ran wrangler under the machine's stored login, which
    on this machine is the unrelated Cobrasmash account, so Merqify's Worker secrets would have been
    written there. The dry run was checked with dummy files, with and without the reference keys.
- **`scripts/migrate-to-new-neon.ts` (R31).** The plan prints "WARNING: copied values still naming
  nocaped". Against old staging that is `VendorConfig.senderEmail: 2`. The third sender address and
  the one `contactEmail` hit belong to the retired superstore and are not copied.
- **`prisma/seed.ts` and `prisma/manifests/example.json` (R32).** Sender emails are now
  `orders@aheed.merqify.com` and `orders@srimart.merqify.com`, and the example host is
  `example-grocer.merqify.com`. The invalid fixture and the test's replace regex follow.
  `secrets/example.vars` explains `RESEND_FROM_EMAIL` and the two optional reference keys.
- **Runbook (R28, R33, R34).** `env-setup.md` "Merqify account" gains:
  - four Neon projects in the owner list;
  - the account-override rule for `configure-env` and for hand-set secrets;
  - a "Reference database (rebuilt, not copied)" section: `ref:migrate` with **both** reference
    variables set to the new primary (the reference schema declares `url` and `directUrl`), the two
    `sync-reference-data.ts` sources, `verify-reference-coverage.ts`, and the
    `pg_is_in_recovery()` check for `#1123`;
  - cut-over step 9, replacing the copied `nocaped` addresses;
  - a "Dev database" section: migrate, `db:seed`, `demo:accounts`, and `.env` plus `.dev.vars`;
  - the "Freeing Nocaped" table: every resource, each removed only after both environments are
    validated and with owner approval. It also notes that `protected-hosts.ts` reads exactly
    `secrets/staging.vars` and `secrets/production.vars`, so those files should eventually hold the
    Merqify values.

### Amendment 2 (from the environment-variable audit): gaps 1–3

- **Gap 1 (R30a).** `configure-env` now also pushes `S3_*` and `CDN_BASE_URL` to the GitHub
  environment, for `production` only (`PRODUCTION_GITHUB_ALSO`).
  - Why: `fill-product-images.yml` runs daily under `environment: production` and reads those six
    from GitHub. GitHub production holds old Nocaped values today, so after the move it would have
    kept writing into the old bucket.
  - Checked: the production dry run lists all six as GitHub secrets, and the staging dry run lists
    none.
- **Gap 2 (R33, R34).** Dev also used Nocaped R2: bucket `aheed-images-dev` behind
  `images.dev.aheedfoodcentre.nocaped.com`. The runbook now:
  - creates a Merqify `aheed-images-dev` bucket at `images-dev.merqify.com`;
  - lists the new dev keys for `.env`/`.dev.vars`;
  - puts the old dev bucket in "Freeing Nocaped".

  While editing, the runbook's Development section showed a pairing nobody had carried over:
  **staging and production image hosts have a hotlink (referer) rule, and the dev host has none** so
  images load under `localhost`. The owner list now asks for the same pairing on the Merqify hosts,
  and the Development table shows old and new hosts side by side.
- **Gap 3.** Corrected the false "`secrets/staging.vars` lacks the S3 keys" in `plan.md`, this file
  and the runbook. All five are present (bucket `aheed-images-staging`).

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
- **Image copy (R18) reads the old bucket with the `S3_*` keys already in `secrets/staging.vars`.**
  - **Corrected 2026-10-29:** an earlier note here said the file lacked them. That came from a key
    listing whose pattern skipped names containing a digit. The env-file audit shows all five
    present, with bucket `aheed-images-staging`.
  - It still needs the old Nocaped R2 to answer. R2 returned 403 on public reads when `#1323` was
    opened, but the S3 API with these keys was not tested.
  - If the source reads fail, generated `webp` images are reported missing, and placeholders are
    restored.
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
- **`wrangler secret put` against a Worker that does not exist yet in the Merqify account** may
  prompt to create it, or fail, because `configure-env` pipes the value through stdin. If it
  reports no such Worker, run `deploy-staging` once (it creates the Worker; the app will error
  without its secrets, which is harmless on a new host), then re-run `configure-env`. Untested.
- **The reference rebuild depends on the public dataset downloads** in `sync-reference-data.ts`
  (Code-Point Open, OS Open Names) still being reachable. This was not exercised in this build.
- **Old staging's `localhost` `VendorDomain` row** is deliberately not copied. Local preview against
  a new database has to add its own.
