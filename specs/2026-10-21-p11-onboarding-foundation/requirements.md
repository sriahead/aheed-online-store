# P11 onboarding foundation (requirements / acceptance criteria)

Closes `#490`, `#1198` and `#1197` — the first slice of `P11 — Repeatable Vendor Onboarding`. It
makes two hand-edit hazards impossible instead of documented (a bulk script pointed at a deployed
database; a `wrangler.toml` edit that silently tears down a trading vendor's custom domain) and
extracts the vendor-level provisioning functions out of `prisma/seed.ts` so a third vendor is a
manifest file rather than a code edit. **No schema change.** The client-specific Excel adapter is
`#1201` and is out of scope; a vendor provisioned here has zero products, which is expected.
Reasoning, rejected alternatives and the full exclusion list are in `plan.md`.

## `#490` — shared host guard

R1. `scripts/lib/protected-hosts.ts` exists and exports `normalizeHost(url: string): string | null`,
    `protectedHosts(): { hosts: Set<string>; readFiles: string[] }`, and
    `assertNotDeployedDatabase(connectionString: string | undefined): void`.

R2. `assertNotDeployedDatabase` throws in each of these three cases, and accepts no parameter or
    environment variable that suppresses any of them: (a) the connection string is empty or
    undefined; (b) neither `secrets/staging.vars` nor `secrets/production.vars` can be read; (c) the
    normalised host of the connection string appears in either of those files.

R3. `normalizeHost` returns the same string for a Neon pooled host and its direct counterpart — the
    `-pooler.` segment is stripped — and returns `null` for a string with no `@host` part.

R4. `protectedHosts` extracts hosts from both the `KEY=value` and the `KEY = "value"` spaced forms of
    `DATABASE_URL` and `DIRECT_URL` (`#505`).

R5. `scripts/verify-repository-injection.ts` imports `normalizeHost` and `protectedHosts` from
    `scripts/lib/protected-hosts.ts` and declares no local copy of either; the file contains no
    second definition of `function normalizeHost` or `function protectedHosts`.

R6. `prisma/seed.ts` calls `assertNotDeployedDatabase` on its generated-catalogue path before the
    first generated write, so a run with `SEED_SCALE_PRODUCTS` set and a `DIRECT_URL` whose host is
    named in `secrets/staging.vars` or `secrets/production.vars` exits non-zero and creates no rows.

R7. A plain `npm run db:seed` with no `SEED_SCALE_PRODUCTS` set is not blocked by R6's guard against
    a dev host, and still completes successfully against a dev database.

## `#1198` — route list verified against trading vendors

R8. `scripts/verify-worker-routes.ts` exists, accepts `--env <name>`, and exits non-zero with a
    usage message when `--env` is absent.

R9. It reads every `VendorDomain.host` over `process.env.DIRECT_URL`, and reads the `pattern` values
    of every `[[env.<name>.routes]]` table in `wrangler.toml` for the `--env` given, without adding
    any new entry to `package.json`'s `dependencies` or `devDependencies`.

R10. It exits non-zero and prints every offending host by name when a routable `VendorDomain.host`
     has no matching route `pattern` for that environment.

R11. A `VendorDomain.host` is treated as **not** routable, and excluded from R10's comparison, when
     it contains a `:` port separator or its host part ends in `localhost`. A dev database seeded
     with `localhost:8787` and `srimart.localhost:8787` therefore produces exit code 0.

R12. A route `pattern` in `wrangler.toml` with no matching `VendorDomain` row prints a warning line
     containing that pattern and does **not** change the exit code.

R13. `npx tsx scripts/verify-worker-routes.ts --env <name> --write` prints a `[[env.<name>.routes]]`
     block containing one `pattern` entry per routable host plus `custom_domain = true`, and exits 0.

R14. `.github/workflows/deploy-staging.yml` and `.github/workflows/deploy-production.yml` each run
     `scripts/verify-worker-routes.ts` with that environment's `DIRECT_URL`, in a step positioned
     **after** the `prisma migrate deploy` step and **before** the `wrangler deploy` step. The
     existing relative order of the build step and the migrate step is unchanged in both files.

R15. `tests/worker-routes.test.ts` covers, against fixture inputs rather than a live database: a
     missing host producing a failure, a `localhost`/ported host producing a pass, a stale pattern
     producing a warning without failure, and the `--write` output shape.

## `#1197` — manifest-driven vendor provisioning

R16. `prisma/provision-vendor.ts` exists and exports `upsertVendorSatellites`, `upsertVendorDomain`,
     `seedFulfilmentSchedule` and the `VendorSatellites` type, with each function taking a
     `PrismaClient` as its first parameter.

R17. `prisma/seed.ts` imports those three functions from `prisma/provision-vendor.ts` and contains no
     local definition of any of them.

R18. Running `npm run db:seed` twice in succession against a dev database leaves the row counts of
     `Vendor`, `VendorBranding`, `VendorConfig`, `VendorDeliveryArea`, `VendorFulfilmentSlot`,
     `VendorLoyaltyTier`, `DiscountCode` and `VendorDomain` unchanged between the first and second
     run.

R19. `scripts/provision-vendor.ts <manifest-path>` calls `assertNotDeployedDatabase` before
     constructing a Prisma client, then creates or updates exactly these rows for the manifest's
     vendor: `Vendor`, `VendorBranding`, `VendorConfig`, `VendorDeliveryArea`,
     `VendorFulfilmentSlot`, `VendorLoyaltyTier`, `VendorDomain`, and the footer defaults via
     `seedFooterDefaults`. It writes no `Category` and no `Product` rows.

R20. The manifest is parsed by a zod schema using the already-installed `zod` dependency. A manifest
     missing a required field, or carrying a field of the wrong type, causes a non-zero exit whose
     output names the failing field path, and no database row is created or modified. The fixture
     `tests/fixtures/vendor-manifest-invalid.json` is committed and exercises that path.

R20a. `scripts/provision-vendor.ts` accepts a `--validate-only` flag that parses the manifest,
     reports the result and exits without constructing a Prisma client or writing any row.

R20b. The manifest schema requires these top-level keys, and rejects unknown ones: `id` (a UUID),
     `slug`, `name`, `host`, `branding`, `config`, `deliveryPrefixes`, `loyaltyTiers`,
     `discountCodes`, `footer`. `id` is supplied by the manifest rather than generated, so that
     provisioning upserts by primary key and R21's re-run is a no-op.

R21. Running `scripts/provision-vendor.ts` twice with the same manifest against a dev database
     leaves the row counts from R18's table unchanged between the first and second run.

R22. `prisma/manifests/example.json` is committed and validates against R20's schema, and
     `prisma/manifests/README.md` states that a real client's manifest is not committed to this
     repository.

## Documentation

R23. `specs/decisions/ADR-004-multi-tenancy.md` carries a dated implementation note that states all
     four of: adding a vendor host requires a `wrangler.toml` change and a deploy, so decision 7's
     "no code change, no deploy" does not hold for a host; Worker Custom Domains cannot be wildcards;
     a wildcard route and Universal SSL each cover only one subdomain label, so decision 3's
     single-wildcard claim does not hold for a host more than one label deep; and
     `scripts/verify-worker-routes.ts` is the control that makes an omission non-silent.

R24. `docs/developer-portal/sdd/operator-runbook.md` documents the procedure for adding a vendor
     host, including the tear-down hazard (a `wrangler deploy` that omits an existing host removes
     that host's custom domain) and the `--write` command.

R25. `docs/developer-portal/env-setup.md`'s per-vendor host-mapping section names
     `scripts/provision-vendor.ts` as the route for a third vendor onward, and states that the Aheed
     and SriMart fixtures stay in `prisma/seed.ts` on purpose.

R26. `npm run kms:validate` exits 0 with `invalid front-matter (failing): 0`, `npm run kms:build-index`
     leaves `ARTIFACT_INDEX.md` containing a row for `p11-onboarding-foundation-plan`, and a real
     Next build of `kms/site-internal` succeeds after `npm run kms:assemble:internal`.

## Gates

R27. `CHANGELOG.md` is updated on this branch under `## [Unreleased]`, naming `#490`, `#1198` and
     `#1197` and the slice folder `specs/2026-10-21-p11-onboarding-foundation/` (Gate 4).

R28. `npm run lint`, `npm run typecheck`, `npm run format:check` and `npx vitest run --maxWorkers=4`
     all exit 0 after this slice.
