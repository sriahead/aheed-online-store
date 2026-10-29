# Move hosting to Merqify's Cloudflare account and data to a new Neon account (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Unit tests cover the pure parts: the model classification and the product selection. The migration
and grant scripts are integration-tested against **real** databases, never a mock. Old staging is
the source, and a **disposable** target is the destination: a throwaway Neon branch or a fresh
project the owner provides. The live rows (R24–R27) run only after the owner's Merqify and Neon
setup exists. Until then they are reported **unverified, with the reason**, never counted as passing.

## Setup

- **Shell guard, before any script or Prisma command:** check `DIRECT_URL` and `DATABASE_URL` one at
  a time (`if printenv "$v" >/dev/null 2>&1`), print the host only, and prefix every command with
  `env -u DIRECT_URL -u DATABASE_URL` (`CLAUDE.md`, Config & secrets).
- **Disposable target:** an env file `secrets/scratch-target.vars` (gitignored) whose `DIRECT_URL`
  names an empty database with this branch's migrations applied:
  `env -u DIRECT_URL -u DATABASE_URL DIRECT_URL=<scratch> DATABASE_URL=<scratch> npx prisma migrate deploy`.
  Read `prisma migrate status`'s datasource host first; it must be the scratch host.
- **Manual wrangler commands:** run `npx wrangler whoami` first. It must name the Merqify account,
  not "Cobrasmashbc@gmail.com's Account".

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Unit | `npx vitest run tests/worker-routes.test.ts --maxWorkers=4` passes with assertions updated to the two staging hosts. Also `rg -n "^pattern" wrangler.toml` lists exactly `aheed-staging.merqify.com` and `srimart-staging.merqify.com` under `[env.staging]`, each followed by `custom_domain = true`. |
| R1a | Unit | `ls scripts/provision-aheedsuperstore-staging.ts prisma/manifests/aheedsuperstore.json tests/staging-test-vendor-onboarding.test.ts` reports all three missing. `rg -l aheedsuperstore app components lib scripts prisma/manifests tests` prints nothing. |
| R2 | Unit | The same `rg` lists exactly `aheed.merqify.com` and `srimart.merqify.com` under `[env.production]`, each with `custom_domain = true`; the test from R1 asserts it. |
| R3 | Unit | `rg -n "APP_BASE_URL" workers/scheduler/wrangler.toml` prints exactly `https://aheed-staging.merqify.com` (staging) and `https://aheed.merqify.com` (production). |
| R4 | Unit | `rg -n "^pattern" kms/site-internal/wrangler.toml` prints exactly one line, `pattern = "docs.merqify.com"`, followed by `custom_domain = true`. |
| R5 | Unit | `rg -n "img-src" next.config.mjs` contains `https://*.merqify.com`, and `rg -c nocaped next.config.mjs` prints nothing or `0`. |
| R6 | Unit | `rg -n "nocaped" wrangler.toml workers/scheduler/wrangler.toml kms/site-internal/wrangler.toml next.config.mjs components/layout/StorefrontChrome.tsx lib/vendor-readiness-service.ts "app/(admin)/staff/platform/settings/page.tsx" \| rg -v ":\s*(#\|//\|\*\|/\*)"` prints nothing. `rg -n 'requestHeaders.get\("host"\) \?\? "' components/layout/StorefrontChrome.tsx` prints nothing. |
| R7 | Integration | `env -u DIRECT_URL -u DATABASE_URL npx tsx scripts/migrate-to-new-neon.ts --from secrets/staging.vars --to secrets/scratch-target.vars --target staging` exits 0. It prints a per-model plan and both hosts with `***` in place of the password. A `SELECT count(*) FROM "Vendor"` on the scratch target before and after the run returns `0` both times. |
| R8 | Integration | Each of these exits non-zero with a message naming the reason, and the scratch target's `Vendor` count stays `0`: (a) `--to secrets/staging.vars`, same host as `--from`; (b) a second `--apply` after R17's run, target not empty; (c) `--to secrets/production.vars`, protected host; (d) `--to` a file with no `DIRECT_URL` line. |
| R9 | Unit | `npx vitest run tests/neon-migration-plan.test.ts --maxWorkers=4` passes. Then temporarily delete one model's entry from the table: the test fails naming that model. Restore it. |
| R10 | Unit | The same test asserts each model listed in R10 is classified `skip`. Every `*Attempt` model is matched by name from the schema, not hand-listed. |
| R11 | Unit | The same test file's `selectProducts` cases pass: a non-`gen-` slug kept; `gen-0-apples` and `gen-10-rice` kept; `gen-11-rice` dropped; `gen-abc-rice` dropped. |
| R12 | Integration | After R17's `--apply` to the scratch target: `SELECT count(*) FROM "Inventory" i LEFT JOIN "Product" p ON p.id = i."productId" WHERE p.id IS NULL` returns `0`, and the same query for `ProductImage`, `ProductPriceTier`, `ProductAttributeValue` and `BundleItem` returns `0`. `SELECT count(*) FROM "Bundle" b WHERE NOT EXISTS (SELECT 1 FROM "BundleItem" bi WHERE bi."bundleId" = b.id)` returns `0`. |
| R12a | Integration | R7's dry-run output has a "dropped (missing parent)" count and a "nulled (missing parent)" count per model. R17's `--apply` completes with no Postgres `23503` (foreign-key) error. Every copied `DiscountCode` with a non-null referral owner joins to a `User` row in the target (`LEFT JOIN … WHERE u.id IS NULL` returns `0`). |
| R13 | Integration | On the scratch target after `--apply --target staging`, `SELECT slug FROM "Vendor" ORDER BY slug` returns exactly `aheed-food-centre`, `srimart`. Then re-create an empty scratch target and run `--target production --apply`: it returns exactly `aheed-food-centre`, `srimart`. |
| R14 | Integration | On each scratch target: `SELECT count(*) FROM "User" WHERE email LIKE '%@example.com'` returns `0`. `SELECT count(*) FROM "VendorMembership" m LEFT JOIN "User" u ON u.id = m."userId" WHERE u.id IS NULL` returns `0`. The non-`@example.com` user count equals the source's. |
| R15 | Integration | `SELECT host, "isCanonical" FROM "VendorDomain" ORDER BY host` on the staging-target run returns exactly the three R1 hosts, each `true`. Then `env -u DIRECT_URL -u DATABASE_URL DIRECT_URL=<scratch> DATABASE_URL=<scratch> npx tsx scripts/verify-worker-routes.ts --env staging` (or the invocation `deploy-staging.yml` uses) reports no mismatch. |
| R16 | Integration | Pick one product slug from the source (`SELECT id, slug FROM "Product" WHERE slug LIKE 'gen-10-%'`). The same query on the scratch target returns the same `id`. |
| R17 | Integration | `... --target staging --apply` exits 0, and its closing summary prints `match` for every copied model. Then delete one copied `Inventory` row on the scratch target and run the script's count check (`--verify-only` or equivalent, as built): it exits non-zero naming `Inventory`. |
| R18 | Integration | With a scratch bucket the owner provides: `--copy-images` exits 0. For one copied `ProductImage.key`, a GET of `<scratch CDN base>/<key>` returns 200. A key deliberately absent from the source, of the `products/*/main.svg` form, ends up holding the placeholder bytes, and the output names it. **Unverified, stating why**, if no scratch bucket or source S3 keys are available. |
| R19 | Integration | Against the scratch target: `scripts/grant-role.ts --env-file secrets/scratch-target.vars --email <a copied non-demo user> --platform-admin` without `--apply` prints the change and leaves `User.role` unchanged. `--email nobody@nowhere.invalid` exits non-zero. `--email demo-admin@example.com --platform-admin` exits non-zero without `--allow-demo`. |
| R20 | Integration | With `--apply`, `SELECT role FROM "User" WHERE email = '<that user>'` returns `ADMIN`. A store grant (`--vendor srimart --role STAFF --apply`) creates the membership and exactly one new `VendorRoleAuditLog` row. |
| R21 | Unit | `rg -n "^## Merqify account\|^### Merqify account" docs/developer-portal/env-setup.md` finds the heading. The section names `secrets/merqify-staging.vars`, `secrets/merqify-production.vars`, `configure-env`, `wrangler whoami`, `eu-west-2`, `BETTER_AUTH_SECRET` and `docs.merqify.com`, and has a rollback paragraph. |
| R22 | Unit | `rg -n "merqify" specs/architecture.md` shows the hosting statement naming the Merqify Cloudflare account and the new Neon projects. |
| R23 | Unit | For each `"KEY"` literal in `scripts/configure-env.mjs`, `rg -n "^KEY=" secrets/example.vars` finds it; the same for the five `S3_*` keys. |
| R24 | E2E | After the staging merge's `deploy-staging` run completes: `curl -s https://aheed-staging.merqify.com/api/health` shows `commit` equal to `git rev-parse --short origin/staging`, `db.ok: true`, `reference.reachable: true` and a non-empty `reference.sources`. **Unverified, stating why**, if the owner setup is not done. |
| R25 | E2E | `curl -s https://srimart-staging.merqify.com/` contains SriMart's store name, and `curl -s https://aheed-staging.merqify.com/` contains Aheed Food Centre's (prefix with `MSYS_NO_PATHCONV=1`). |
| R26 | E2E | Against the new staging database (env file `secrets/merqify-staging.vars`, host printed first): `SELECT count(*) FROM "Product" p JOIN "Vendor" v ON v.id = p."vendorId" WHERE v.slug = 'aheed-food-centre'` returns `245`, and `SELECT count(*) FROM "Order"` returns `0`. |
| R27 | E2E | Take one `ProductImage.key` from the new staging database. `curl -s -o NUL -w "%{http_code}" https://images-staging.merqify.com/<key>`, run in PowerShell (not Git Bash), prints `200`. |
| R28 | Gate | `git diff origin/staging -- CHANGELOG.md` shows a new `[Unreleased]` entry for `#1323`. |
| R29 | Gate | `npm run lint`, `npx tsc --noEmit`, `npm run format:check` and `npx vitest run --maxWorkers=4` (run alone) all exit 0. |
