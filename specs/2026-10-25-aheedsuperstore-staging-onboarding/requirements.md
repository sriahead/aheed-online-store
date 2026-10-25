# Requirements: Provision Aheed Superstore test vendor on staging

## R1 — Wrangler Staging Route Configuration
`wrangler.toml` declares a route entry under `[env.staging]` with `pattern = "aheedsuperstore-staging.nocaped.com"` and `custom_domain = true`.

## R2 — Worker Route Parity Verification
`scripts/verify-worker-routes.ts` parses `aheedsuperstore-staging.nocaped.com` from `wrangler.toml` under the `staging` environment without errors and flags zero missing trading vendor routes.

## R3 — Vendor Manifest Schema Compliance
A vendor manifest file for `aheedsuperstore` exists and passes `manifestSchema.parse()` in `scripts/provision-vendor.ts`, defining `slug: "aheedsuperstore"`, display name `"Aheed Superstore"`, valid `#rrggbb` branding colors, and initial host `"aheedsuperstore-staging.nocaped.com"`.

## R4 — Staging Database Tenant Isolation
Applying the vendor manifest to the target database creates records in `Vendor`, `VendorBranding`, `VendorConfig`, `VendorDeliveryArea`, and `VendorDomain` matching `slug: "aheedsuperstore"` without modifying existing records belonging to `aheed-food-centre` or `srimart`.

## R5 — Initial Empty Catalogue Invariant
Immediately following vendor provisioning, the database contains exactly zero `Product`, `Category`, and `Brand` records associated with `vendorId: "aheedsuperstore"`.

## R6 — Admin Staff Account Setup
An admin user is associated with `aheedsuperstore` in `StaffRole` with `role: "ADMIN"`, permitting authenticated access to `/staff/products/import` on `aheedsuperstore-staging.nocaped.com`.

## R7 — Production Database Protection Guard
The provisioning script imports and invokes `assertNotDeployedDatabase` or equivalent protection preventing execution against production hostnames.

## R8 — Changelog Updated
`CHANGELOG.md` records the addition of the `aheedsuperstore-staging.nocaped.com` route and test vendor provisioning under `[Unreleased]`, referencing issue `#1265`.
