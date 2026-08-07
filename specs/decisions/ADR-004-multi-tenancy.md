---
id: adr-004-multi-tenancy
title: "ADR-004 — Multi-Tenancy (DB-driven vendors, regions & branding)"
audience: [dev]
type: adr
status: draft
version: "0.1.0"
updated: 2026-08-07
visibility: internal
summary: Evolve from single-vendor to a multi-tenant platform where vendors, regions, locations, delivery areas, and branding come from the database, sharing one business-logic and data layer.
tags: [adr, multi-tenancy, vendors, branding, architecture]
related: [architecture, adr-001-hosting, adr-003-storage-abstraction]
---

# ADR-004 — Multi-Tenancy (DB-driven vendors, regions & branding)

- **Status:** Draft / Proposed (needs sign-off before implementation). Tracked by issue #49.
- **Related:** `specs/architecture.md`, ADR-001 (hosting), ADR-003 (storage). Sequencing: land
  **before P3** (cart/checkout/orders), which would otherwise bake in single-vendor assumptions.

## Context

The store began as a single vendor (Aheed Food Centre, Milton Keynes) with the brand, locality,
delivery area, taxonomy, and theme **hardcoded across the codebase**. The owner has directed that
the platform must support **multiple vendors** cleanly: regions, locations, vendors, and related
config come from the **database**; a new vendor can be onboarded **without major code changes**;
each vendor gets its **own branding/UI** over the **same business logic and data layer**; and
vendor-specific change is handled primarily through the **UI/configuration layer**.

Today there is **no `Vendor`/`Tenant` entity** in `prisma/schema.prisma`, and no `vendorId` on any
domain table. A 2026-08-07 audit (issue #49) enumerated the hardcoded surfaces. Separately,
**staging and production currently share one Neon database**, so environment and tenant isolation
should be reasoned about together.

## Decision (proposed — open items marked)

1. **Introduce a `Vendor` aggregate** as the tenancy root, plus supporting config tables:
   - `Vendor` (id, slug, status), `VendorBranding` (theme primitives, logo storage key, name,
     tagline), `VendorConfig` (locality copy, sender identity, feature flags), and a
     **delivery-area** table (`VendorDeliveryArea`: per-vendor postcode prefixes / regions —
     replaces `lib/delivery.ts`'s hardcoded `MK1–MK19`).
   - `Region`/`Location` as their own reference tables when geography grows beyond delivery areas.

2. **Scope every domain row to a vendor.** Add `vendorId` (FK) to `Category`, `Product`,
   `Inventory`, `Review`, and the future `Order`/`Cart`. **[OPEN — isolation model]** default to
   **row-level tenancy** (a mandatory `vendorId` filter enforced centrally in the repository
   layer) over schema-per-tenant, to fit the Neon + Prisma + cost-effective mandate — to be
   confirmed.

3. **Resolve the tenant per request from the host/route.** **[OPEN — resolution strategy]**
   custom domain per vendor vs. subdomain (`vendor.platform.com`) vs. path prefix (`/v/{slug}`).
   This choice cascades into auth cookie/origin scoping (`BETTER_AUTH_URL`), CDN, and routing —
   decide before implementation.

4. **Branding is data, delivered as CSS variables.** The existing two-layer token system
   (primitive → semantic in `design-system/tokens/tokens.css`) already provides the seam:
   per-vendor **primitives** come from `VendorBranding` and are injected as CSS custom properties
   at request time; the **semantic** layer and every component stay unchanged. Per-vendor logo and
   assets resolve through storage keys (ADR-003), namespaced per vendor
   (e.g. `vendors/{vendorId}/...`).

5. **Split platform config from vendor config.** `lib/config.ts` keeps **platform/infra** values
   in env (DB endpoint, storage endpoint, secrets); **vendor** values (name, tagline, locality,
   delivery area, sender identity, theme) move to the **database**, read per request for the
   resolved tenant.

6. **Onboarding is data-only.** A new vendor = a `Vendor` row + branding + config + delivery area
   + catalogue — **no code change, no deploy**.

## Consequences

- **Positive:** new vendors onboard through configuration; a single business-logic/data layer
  serves all; theming is per-vendor without forking components; the delivery/brand/locality
  hardcoding (current `lib/delivery.ts`, header/hero copy, `tokens.css`, `manifest.ts`) collapses
  into DB-driven config.
- **Cost:** `vendorId` scoping touches **every existing repository query** (`lib/repositories/*`) —
  it must be enforced centrally so a missing filter can't leak cross-vendor data. This is the main
  reason to do it **before** P3 adds more query surface (orders/carts/payments).
- **Environment isolation:** the shared staging/prod database must be separated as part of, or
  before, this work — otherwise tenant data and environment data are conflated.
- **Rule of thumb (post-ADR):** if onboarding a vendor or changing its branding/locality/delivery
  area requires editing anything **outside the database and the UI/config layer**, the abstraction
  has been violated.

## Open questions to resolve before ADR is Accepted

1. Tenant resolution strategy (domain / subdomain / path) — item 3.
2. Data isolation model (row-level vs schema-per-tenant) — item 2.
3. Auth model across tenants — one shared user pool vs. per-vendor; session cookie scoping.
4. Separating the staging/production databases (and when).
