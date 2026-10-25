---
id: aheedsuperstore-staging-onboarding-plan
title: "Provision Aheed Superstore test vendor on staging (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-25
visibility: internal
summary: "Plan for issue #1265: provision Aheed Superstore test vendor on staging (aheedsuperstore-staging.nocaped.com) with Cloudflare route, isolated tenant configuration, staff admin access, and empty initial catalogue."
tags: [onboarding, multi-tenancy, staging, cloudflare, p11]
related: [client-onboarding-prerequisites, adr-004-multi-tenancy, adr-007-storefront-scope-restrictions-stock-states]
---

# Provision Aheed Superstore test vendor on staging (plan)

Issue [#1265](https://github.com/sriahead/aheed-online-store/issues/1265). Approved by the owner on 2026-10-25.

**Goal:** Enable the store owner to experience the complete, real-world onboarding workflow for a new vendor on a live, hosted staging environment (`https://aheedsuperstore-staging.nocaped.com`) without affecting trading vendors or production data.

## Narrative & Scope

The platform is built on multi-tenancy ([ADR-004](file:///E:/GitRepositories/aheed-online-store/docs/developer-portal/client-onboarding-prerequisites.md#L27-L40)). Staging currently serves two vendors (`staging.aheedfoodcentre.nocaped.com` and `srimart-staging.nocaped.com`) through a single Cloudflare Worker deployment by resolving the request `Host` header against the `VendorDomain` table.

This slice adds **Aheed Superstore** as the third tenant on staging:

1. **Routing & Cloudflare Custom Domain (`wrangler.toml`):**
   - Add `[[env.staging.routes]]` with `pattern = "aheedsuperstore-staging.nocaped.com"` and `custom_domain = true`.
   - Single-label subdomain under the active `nocaped.com` zone allows Cloudflare to automatically issue a valid edge TLS certificate upon deployment.

2. **Tenant Provisioning (`prisma/manifests/` & database):**
   - Define a manifest for `aheedsuperstore` (`slug: "aheedsuperstore"`, display name `"Aheed Superstore"`).
   - Set up branding with WCAG AA compliant contrast colors, test delivery prefixes (`MK`), and `VendorDomain(host: "aheedsuperstore-staging.nocaped.com")`.
   - Provision records into `Vendor`, `VendorBranding`, `VendorConfig`, `VendorDeliveryArea`, and `VendorDomain`.
   - Invariant: Zero initial catalogue rows (`Product`, `Category`, `Brand` are completely empty).

3. **Staff Admin Setup:**
   - Provision an admin staff account associated with the new `aheedsuperstore` vendor ID, enabling immediate access to `/staff/products/import`.

4. **Safeguards & Protections:**
   - Zero writes to any production database.
   - `scripts/verify-worker-routes.ts` ensures `wrangler.toml` routes match active vendor domains.
   - Any catalogue files uploaded by the owner at `/staff/products/import` default to hidden (`isActive: false`), stock `UNKNOWN`, quantity `0`, and enforce ADR-007 classifications.

## Deliberately Excluded

- **Production Deployment:** This slice targets staging only (`aheedsuperstore-staging.nocaped.com`). Production remains untouched.
- **Automated Active Catalogue Import:** No automatic stock import during provisioning; the store starts completely empty so the owner can test the `/staff/products/import` user interface live.
- **Custom External Domain DNS (`aheedfoodcentre.co.uk`):** Deferred until the client domain is active and delegated.

## Open Items Carried Forward

- Issue `#1218`: Category standardisation phase.
- Issue `#1217`: Provider-agnostic outgoing email.
