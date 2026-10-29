# Move hosting to Merqify's Cloudflare account and data to a new Neon account (requirements / acceptance criteria)

This closes `#1323`. Deploys move from the Free-plan Nocaped Cloudflare account to the new Merqify
account under flat `merqify.com` hosts. A dry-run-first script fills a new Neon account from the old
**staging** database with a 10% product sample, and with no test orders and no demo logins in
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
     contains `aheedsuperstore`.
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
    the reason for each skipped model, and both hosts with their passwords masked.
R8. The script exits non-zero before any write in each of these cases:
    - the `--from` and `--to` hosts are equal;
    - the target database already contains at least one `Vendor` row;
    - the target host is refused by `scripts/lib/protected-hosts.ts`;
    - either file lacks `DIRECT_URL`.
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
    - rows belonging to any other vendor are never copied.
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
    `id` in the source.
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
     `secrets/example.vars` says `RESEND_FROM_EMAIL` is an address on a Resend-verified
     `merqify.com` domain.
R33. The runbook has a "Dev database" step: a new dev project in the Merqify Neon account,
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

## Gates

R35. `CHANGELOG.md` updated (Gate 4).
R36. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
