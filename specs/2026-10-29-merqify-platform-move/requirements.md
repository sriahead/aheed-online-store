# Move hosting to Merqify's Cloudflare account and data to a new Neon account (requirements / acceptance criteria)

This closes `#1323`. Deploys move from the Free-plan Nocaped Cloudflare account to the new Merqify
account under flat `merqify.com` hosts. A dry-run-first script fills a new Neon account from the old
**staging** database with a 10% product sample. It copies no test orders and no demo logins; amendment 5 re-adds a fresh demo roster in every environment, production included, until go-live. This applies in
production. A grant tool gives the owner an admin login in a database that would otherwise have
none. Staging is cut over and verified live; production follows at promotion, with owner approval.
Narrative, decisions and exclusions: `plan.md`.

## Host configuration

R1. `wrangler.toml` `[env.staging]` declares exactly two routes, each `custom_domain = true`:
    `aheed-staging.merqify.com` and `srimart-staging.merqify.com`.
R1a. Aheed Superstore is retired. These files no longer exist:
     - `scripts/provision-aheedsuperstore-staging.ts`;
     - `prisma/manifests/aheedsuperstore.json`;
     - `tests/staging-test-vendor-onboarding.test.ts`.

     No file under `app/`, `components/`, `lib/`, `scripts/`, `prisma/manifests/` or `tests/`
     contains `aheedsuperstore`, except `app/(admin)/staff/runbook/docs.ts`. That file is generated
     by `kms:build-index` from historical specs and docs, which are not rewritten, and
     `kms:check-generated` keeps it current (corrected after the first `/validate`).
R2. `wrangler.toml` `[env.production]` declares exactly two routes, each `custom_domain = true`:
    `aheed.merqify.com` and `srimart.merqify.com`.
R3. `workers/scheduler/wrangler.toml` sets `APP_BASE_URL` to `https://aheed-staging.merqify.com`
    under `[env.staging.vars]` and to `https://aheed.merqify.com` under `[env.production.vars]`.
R4. `kms/site-internal/wrangler.toml` declares exactly one route, `docs.merqify.com` with
    `custom_domain = true`.
R5. The `Content-Security-Policy` in `next.config.mjs` lists `https://*.merqify.com` in `img-src` and
    no `nocaped` host anywhere.
R6. No non-comment line of these files contains `nocaped`:
    - `wrangler.toml`, `workers/scheduler/wrangler.toml`, `kms/site-internal/wrangler.toml` and
      `next.config.mjs`;
    - `components/layout/StorefrontChrome.tsx` and `lib/vendor-readiness-service.ts`;
    - `app/(admin)/staff/platform/settings/page.tsx`.

    `StorefrontChrome.tsx` contains no hardcoded hostname fallback. With no `host` header, the
    rewards base URL is built from an empty host, and no request is sent to another store's host.

## Migration script: `scripts/migrate-to-new-neon.ts`

R7. The script takes `--from <env-file>`, `--to <env-file>` and `--target staging|production`, and
    reads `DIRECT_URL` from each file (never from the process environment). Without `--apply` it
    writes nothing to either database. It prints, per model, the number of rows it would copy and
    the reason for each skipped model, and both hosts with their passwords masked. It also prints the
    target's vendor state, `empty` or `seeded-only` (R8a), and for `seeded-only` a line saying that
    `--apply` will replace the migration-seeded vendor (R8c).
R8. The script exits non-zero before any write in each of these cases:
    - the `--from` and `--to` hosts are equal;
    - the target's vendor state is `occupied` (R8a), or the seeded vendor has dependent rows (R8b);
    - the target host is refused by `scripts/lib/protected-hosts.ts`;
    - either file lacks `DIRECT_URL`.
R8a. (Amendment 6, from `/validate`: a migrated database is never empty.) Every migrated database
     holds one `Vendor` inserted by `prisma/migrations/20260808130000_multitenancy_vendor_scope/`,
     with `id` `a4ed0000-0000-4000-a000-000000000001` and `slug` `aheed-food-centre`. A pure,
     exported `classifyTargetVendors` takes the target's `Vendor` rows (`id`, `slug`) and returns:
     - `empty` for zero rows;
     - `seeded-only` for exactly one row whose `id` **and** `slug` both equal the values above;
     - `occupied` for anything else, including one row matching only the `id` or only the `slug`,
       and any set of two or more rows.

     The script proceeds on `empty` and `seeded-only` and refuses on `occupied`.
R8b. Before any write, for a `seeded-only` target, the script counts the rows that reference the
     seeded vendor in **every model with a foreign key to `Vendor`**, and exits non-zero naming the
     first model with a non-zero count. The model list is derived from `prisma/schema.prisma`
     (`parseForeignKeys`), never hand-written, because many of the foreign keys to `Vendor` cascade on
     delete (`onDelete: Cascade` in the schema) and removing a vendor that owns rows would delete them silently.
R8c. With `--apply` on a `seeded-only` target, the script deletes the seeded vendor row **before
     inserting any copied row**, then inserts as before. A dry run and `--verify-only` delete
     nothing. After `--apply`, the target holds each copied vendor once: the seeded row is replaced
     by the source's `aheed-food-centre`, not duplicated alongside it.
R8d. The "Merqify account" section of `docs/developer-portal/env-setup.md` says that a target is a
     **freshly migrated** database holding only the migration-seeded vendor, never a hand-emptied
     one, and that a failed `--apply` leaves a partial target that is **reset** (Neon "Reset from
     parent" on `scratch`, then `migrate deploy`), not re-run.
R9. A committed classification table assigns every `model` in `prisma/schema.prisma` exactly one of
    `copy`, `copy-filtered` or `skip`. `tests/neon-migration-plan.test.ts` parses the schema and
    fails when a model is missing from the table, listed twice, or listed but absent from the
    schema.
R10. These models are `skip`:
    - `Session`, `Verification`, `HealthCheck`;
    - `Cart`, `CartItem`, `Order`, `OrderItem`, `Payment`, `OrderStatusEvent`;
    - `PaymentReconciliation`, `PaymentBindingRefusal`, `DiscountRedemption`;
    - `LoyaltyLedgerEntry`, `LoyaltyAccount`, `MarketingConsentEvent`;
    - every `*Attempt` model, `ErrorEvent`, `SearchQueryLog`, `AiUsageEvent`;
    - `AssistantConversation`, `ProductRestrictionAuditLog`, `VendorRoleAuditLog`,
      `NetContentSuggestion`, `DeliveryRefusalCount`;
    - `Review`, `Favourite`, `CustomerFeedback`, `ShoppingList`, `ShoppingListItem`;
    - `Address`, `CustomerAddress`.
R11. A pure, exported `selectProducts` keeps every product whose slug does not start with `gen-`.
    Generated slugs have the form `gen-<index>-<noun>`, with index 0 to 1999
    (`prisma/generate-catalogue.ts`). A `gen-` product is kept only when the integer between `gen-`
    and the next `-` is divisible by 10, which keeps 200 of the 2,000. Unit tests cover:
    - a non-`gen-` slug;
    - `gen-0-apples`, `gen-10-rice` and `gen-11-rice`;
    - `gen-abc-rice`, whose index is not an integer, which is excluded.
R12. `Inventory`, `ProductImage`, `ProductPriceTier` and `ProductAttributeValue` rows are copied
    only for selected products. A `BundleItem` is copied only when its product is selected, and a
    `Bundle` left with no copied items is not copied.
R12a. Generalising R12, rows are handled by what their foreign keys point at:
     - a row whose **required** foreign key points at a row that is not copied is not copied;
     - a **nullable** foreign key pointing at a row that is not copied is written as `NULL`;
     - an example is a `DiscountCode` whose referral owner is a skipped `@example.com` user.

     The dry run prints, per model, the number of rows dropped and the number of keys nulled for
     this reason, and `--apply` raises no foreign-key violation.
R13. Vendors:
    - with either `--target`, exactly `aheed-food-centre` and `srimart` and their vendor-owned rows
      are copied;
    - rows belonging to any other vendor are never copied;
    - (Amendment 6) the seeded vendor of R8a is not one of "their vendor-owned rows": it is
      replaced (R8c), so the target ends with exactly those two vendors and no other.
R14. Users:
    - a `User` is copied only when its email does not end in `@example.com`;
    - its `Account` rows are copied with it;
    - a `VendorMembership` is copied only when both its user and its vendor are copied.

    After `--apply`, the target holds zero users with an `@example.com` email.
R15. No `VendorDomain` row is copied from the source. After `--apply` the target's `VendorDomain`
    rows are exactly the hosts in R1 (staging) or R2 (production), each linked to its vendor and
    marked canonical. `scripts/verify-worker-routes.ts` against the target and that environment's
    routes reports no mismatch.
R16. Copied rows keep their source primary keys: a copied product's `id` in the target equals its
    `id` in the source, and so does each copied vendor's, including `aheed-food-centre`'s, whether
    or not the source's id is the seeded one.
R17. After `--apply` the script counts every copied model in the target. It exits 0 only when each
    count equals the planned count it printed.
R18. With `--copy-images`, every R2 object key referenced by a copied row is read from the source
    bucket and written to the destination bucket under the same key. The script reads the
    `S3_*` values of each file. A missing source object for a `products/*/main.svg` key is replaced
    with `prisma/seed-assets/placeholder-product.svg`. Every other missing key is listed in the
    output with a count, and the exit code is 0 only when that count is 0 or every missing key was
    a placeholder.

## Grant tool: `scripts/grant-role.ts`

R19. `scripts/grant-role.ts --env-file <f> --email <e>` with either `--platform-admin`, or
     `--vendor <slug> --role ADMIN|STAFF`:
     - writes nothing without `--apply`, and prints the change it would make;
     - exits non-zero when no user has that email;
     - exits non-zero for an `@example.com` email unless `--allow-demo` is passed.
R20. With `--apply`:
     - `--platform-admin` sets `User.role` to `ADMIN`;
     - a store grant creates or updates that user's `VendorMembership` and writes one
       `VendorRoleAuditLog` row for the change.

## Documentation

R21. `docs/developer-portal/env-setup.md` has a section headed "Merqify account" that lists:
     - the owner's resources: Workers Paid, two R2 buckets with S3 keys and custom domains,
       per-environment scoped tokens, two Neon projects in `eu-west-2`, a fresh
       `BETTER_AUTH_SECRET` per environment, a Cloudflare Access application for
       `docs.merqify.com`, and the Stripe webhook and Google redirect URIs for the new hosts;
     - the files `secrets/merqify-staging.vars` and `secrets/merqify-production.vars`, and the
       `npm run configure-env -- <env> --file <path>` command;
     - the `npx wrangler whoami` check before any manual wrangler command;
     - the ordered staging and production cut-over steps;
     - rollback.
R22. `specs/architecture.md` states that the Workers run in the Merqify Cloudflare account under
     `merqify.com` hosts, and that the Neon databases are new projects in the new Neon account.
R23. `secrets/example.vars` names every key that `scripts/configure-env.mjs` pushes, plus
     `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` and `S3_REGION`.

## Live staging cut-over (needs the owner's setup)

R24. After the CI deploy of this slice's `staging` merge, `https://aheed-staging.merqify.com/api/health`
     returns:
     - `commit` equal to the merge commit's short SHA;
     - `db.ok: true` and `reference.reachable: true`;
     - a non-empty `reference.sources`.
R25. `https://srimart-staging.merqify.com/` serves SriMart's storefront, and
     `https://aheed-staging.merqify.com/` serves Aheed Food Centre's.
R26. The new staging database holds 245 `aheed-food-centre` products and zero `Order` rows.
R27. One product image URL under `https://images-staging.merqify.com/` returns HTTP 200.

## Amendment (owner, 2026-10-29): everything moves to Merqify, Nocaped is freed

The aim is that nothing the platform uses remains in the Nocaped Cloudflare account or the old Neon
account, including the `uk-location-reference` database and the dev database.

R28. The "Merqify account" section of `docs/developer-portal/env-setup.md` covers the reference
     database:
     - it is **rebuilt** in a new reference project in the Merqify Neon account (`eu-west-2`), one
       project shared by staging and production as today;
     - the steps are `npm run ref:migrate` against its direct URL, then
       `scripts/sync-reference-data.ts --source code-point-open` and `--source os-open-names`;
     - `UK_LOCATION_REF_DIRECT_URL` must name the project's **primary** (`pg_is_in_recovery()` is
       false), which closes `#1123`'s replica problem.
R29. `scripts/configure-env.mjs` pushes, when present and without requiring them (an old file
     without them still works):
     - `UK_LOCATION_REF_DIRECT_URL` as a GitHub environment secret;
     - `UK_LOCATION_REF_DATABASE_URL` as a Worker secret.

     `--dry-run` lists both when present.
R30. `scripts/configure-env.mjs` runs every `wrangler` command with `CLOUDFLARE_ACCOUNT_ID` and
     `CLOUDFLARE_API_TOKEN` set from the **file being pushed**, never from the local wrangler login
     or the shell. It prints the last six characters of that account ID, in both the dry run and the
     real run, before pushing anything.
R30a. (Amendment 2, from the env audit.) For `production` only, `scripts/configure-env.mjs` also
      pushes `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` and
      `CDN_BASE_URL` as GitHub environment secrets, in addition to the Worker secrets.
      `.github/workflows/fill-product-images.yml` (daily, `environment: production`) reads those six
      from GitHub, so without this it would keep writing to the old bucket. For `staging` they are
      not pushed to GitHub.
R31. The migration script's plan output lists, as warnings, every copied text value containing
     `nocaped`, with its model, field and count. The values are copied unchanged, and the runbook
     says where to replace them after the cut-over.
R32. `prisma/seed.ts` and `prisma/manifests/example.json` contain no `nocaped`.
     (Amendment 3, owner 2026-10-29: Resend is retired; email becomes provider-agnostic with
     Cloudflare Email Service, `#1217`.) `secrets/example.vars` and the runbook say the two
     `RESEND_*` values are copied unchanged as a stopgap, that nothing new is registered with
     Resend, and that `#1217` replaces both keys. Resend is in the "Freeing Nocaped" table, to be
     removed after `#1217` is live.
R33. The runbook has a "Dev database" step: a new dev database in the Merqify Neon account (a `dev`
     branch of Shoplocal Staging, per R34a),
     `prisma migrate deploy` then `npm run db:seed` against it, and `.env` and `.dev.vars` both
     pointed at it. (Amendment 2) The step also replaces the dev images bucket: an
     `aheed-images-dev` bucket in the Merqify account with `CDN_BASE_URL`
     `https://images-dev.merqify.com`, and its `S3_*` values in both files.
R34. The runbook has a "Freeing Nocaped" checklist. It names every resource in the Nocaped
     Cloudflare account and the old Neon account the platform used:
     - the Workers `aheed-store-staging`, `aheed-store-production`, `aheed-scheduler-staging`,
       `aheed-scheduler-production` and `aheed-kms-internal`;
     - the R2 buckets (`aheed-images-dev`, `-staging` and `-production`), the Access application
       and the login-wide API token;
     - the dev, staging, production and reference Neon projects;
     - the Stripe webhook endpoints and Google redirect URIs on `nocaped.com` hosts;
     - the Resend domain;
     - the `nocaped.com` zone.

     It states that each is removed only after both environments are validated on Merqify, and
     only with the owner's approval.

## Amendment 4 (owner, 2026-10-29): a platform cell and dedicated client cells

ShopLocal (`shoplocal.merqify.com`) is the multi-vendor platform. A client that runs as an
independent business gets a **dedicated cell**: the same code deployed as its own Workers, with its
own Neon projects, bucket and secrets. The first is Aheed Food Centre (`aheedfoodcentre.co.uk`),
built in its own slice. This slice moves **the platform cell only**. In it, `aheed-food-centre` is
the **demo copy** shown on ShopLocal, beside SriMart.

R34a. The runbook names the Neon projects this slice uses:
      - **Shoplocal** is the production platform database;
      - **Shoplocal Staging** is the staging platform database, with branches `dev` (local work)
        and `scratch` (validation);
      - **uk-location-reference** is shared by every cell (public data, no client data).

      The runbook also says the **Aheed Food Centre** and **Aheed Food Centre Staging** projects
      belong to the Aheed dedicated cell and are not used here. The dev database is the `dev`
      branch, not a separate project, and R33 applies to that branch.
R34b. `specs/architecture.md`'s "Where it runs" names the platform cell and dedicated client cells
      (one database per Worker; a client cell is a separate deployment of the same code), and the
      shared reference database.

## Amendment 5 (owner, 2026-10-29): demo logins until go-live

R34c. The runbook says demo logins are allowed in every environment and every cell, production
      included, until go-live, and that they are deleted at go-live with
      `npm run demo:accounts -- remove` (`#1332`). Both the staging and the production cut-over
      steps run `npm run demo:accounts -- add` against the new database. R14 is unchanged: the
      **copy** never carries an `@example.com` user, because their roles on old staging are stale
      and the roster is re-created fresh.

## Amendment 6 (from `/validate`, owner chose option A, 2026-10-29): a migrated target is never empty

`/validate` found that R7, R8 and the validation Setup assumed a target with zero `Vendor` rows,
which no database that has had `prisma migrate deploy` ever is. R8, R8a–R8d, R13 and R16 above carry
the change. Nothing else in the migration changes: `VENDOR_SLUGS`, the copy order, R12–R12a, R14,
R15, R17 and R18 are as written.

## Gates

R35. `CHANGELOG.md` updated (Gate 4).
R36. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
