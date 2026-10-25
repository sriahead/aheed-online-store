# Provision Aheed Superstore test vendor on staging (build notes)

Written at the end of Build, before the Clear.

## What changed and why

1. **`wrangler.toml` Staging Route:**
   - Added `[[env.staging.routes]]` declaring `pattern = "aheedsuperstore-staging.nocaped.com"` with `custom_domain = true`.
   - Single-label subdomain under the active `nocaped.com` Cloudflare zone ensures automatic TLS certificate issuance via Cloudflare Worker Custom Domains.

2. **Vendor Manifest (`prisma/manifests/aheedsuperstore.json`):**
   - Implemented strict manifest conforming to `manifestSchema` in `scripts/provision-vendor.ts`.
   - Defines vendor identity (`aheedsuperstore`), display name `"Aheed Superstore"`, WCAG AA-compliant branding colors, delivery prefixes (`MK1..MK10`), and domain `aheedsuperstore-staging.nocaped.com`.

3. **Staging Provisioning Script (`scripts/provision-aheedsuperstore-staging.ts`):**
   - Created safe, idempotent provisioning script with strict production refusal guard (`assertNotProduction`).
   - Defaults to dry run; when passed `--apply`, upserts vendor identity, branding, delivery config, and domain mapping, links demo admin accounts to `aheedsuperstore` for panel login, and verifies the 0-product / 0-category invariant.

4. **Automated Unit & Guard Tests (`tests/staging-test-vendor-onboarding.test.ts`):**
   - Verifies route pattern parsing, manifest schema validation, and production host rejection.

5. **Changelog & Documentation:**
   - Updated `CHANGELOG.md` under `[Unreleased]` $\rightarrow$ `### Added` referencing issue `#1265`.

## Decisions taken during the build

- **Dedicated Staging Provisioning Script:** Rather than modifying the general `scripts/provision-vendor.ts` which has a global `assertNotDeployedDatabase` guard refusing all deployed databases with no override, we created `scripts/provision-aheedsuperstore-staging.ts`. This follows the repo's pattern seen in `scripts/remove-vendor-domains.ts` and `scripts/apply-department-changes.ts`, accepting `--env-file secrets/staging.vars` and strictly refusing production.
- **Admin Account Association:** Linked `demo-admin@example.com` and `demo-store-admin@example.com` to the new vendor via `VendorMembership` with `role: "ADMIN"`, enabling immediate staff panel testing at `/staff/products/import` with existing demo passwords.

## Deviations from the spec

None.

## Known-shaky areas

- **Custom Domain Certificate Propagation Timing:** When `wrangler deploy --env staging` runs, Cloudflare automatically provisions the Custom Domain and DNS record. DNS propagation and SSL certificate issuance typically take 1–3 minutes after deployment finishes.
- **Database Provisioning Execution:** The database writes are executed via `scripts/provision-aheedsuperstore-staging.ts --env-file secrets/staging.vars --apply`, which targets the live staging Neon database.
