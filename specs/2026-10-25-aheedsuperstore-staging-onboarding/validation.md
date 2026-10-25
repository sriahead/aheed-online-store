# Validation: Provision Aheed Superstore test vendor on staging

| Req | How to verify |
| :--- | :--- |
| **R1** | `Select-String -Path "wrangler.toml" -Pattern 'pattern = "aheedsuperstore-staging.nocaped.com"'` matches under `[env.staging]`. |
| **R2** | Run `npx tsx -e "import { parseRoutePatterns } from './scripts/verify-worker-routes'; import { readFileSync } from 'node:fs'; const routes = parseRoutePatterns(readFileSync('wrangler.toml', 'utf8'), 'staging'); console.log(routes.includes('aheedsuperstore-staging.nocaped.com'));"` and confirm stdout prints `true`. |
| **R3** | Run `npx tsx scripts/provision-vendor.ts prisma/manifests/aheedsuperstore.json --validate-only` and verify it exits 0 with `manifest is valid`. |
| **R4** | Run unit/integration tests asserting tenant isolation and vendor domain resolution: `npx vitest run tests/tenant.test.ts`. |
| **R5** | Verify via automated test or query that `prisma.product.count({ where: { vendorId: 'aheedsuperstore' } })` equals 0 and `prisma.category.count({ where: { vendorId: 'aheedsuperstore' } })` equals 0. |
| **R6** | Verify via test that a user with `StaffRole` for `aheedsuperstore` and `ADMIN` tier is resolved by `requireVendorRole("ADMIN")` when visiting `/staff/products/import`. |
| **R7** | Verify that `scripts/provision-vendor.ts` includes `assertNotDeployedDatabase` and aborts if `DATABASE_URL` matches production. |
| **R8** | Run `git diff origin/staging...HEAD -- CHANGELOG.md` and verify an entry exists referencing `#1265`. |
