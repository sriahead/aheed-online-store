---
id: multitenancy-slice3b-host-resolver
title: "ADR-004 slice 3b — host→tenant resolver + routing (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-08
visibility: internal
summary: Resolve the vendor from the request host via a VendorDomain table (replacing the interim single-vendor resolver), redirect unmatched hosts to a Coming Soon page, and stand up SriMart as a real 2nd vendor to prove isolation.
tags: [multi-tenancy, vendor, routing, host-resolution]
related: [adr-004-multi-tenancy, multitenancy-slice2-vendor-enforcement, multitenancy-slice3a-vendor-membership, architecture]
---

# ADR-004 slice 3b — host→tenant resolver + routing (plan)

Sub-slice of ADR-004 slice 3 (issue #70, umbrella #68). Makes multi-vendor real: the app serves the
right vendor's data based on the request domain. `requirements.md` holds the checkable criteria.

**Goal:** replace slice 2's interim "single active vendor" resolver with **host → vendor** resolution
backed by the DB, and prove it with a real 2nd vendor (SriMart) whose domain returns a *different*
catalogue.

**Key design decisions:**
- **`VendorDomain(vendorId, host @unique, isCanonical)` table** — DB-driven host→vendor (exact match).
  Onboarding stays data-only; supports >1 host per vendor and canonical redirects later. `Vendor.customDomain`
  (slice 1, unused) is superseded by this and left in place for now (dropping it is deferred cleanup).
- **No Next middleware.** Next middleware defaults to the **edge** runtime, which `CLAUDE.md` forbids.
  Instead the **storefront layout gates the tenant** and unmatched hosts `redirect()` to a
  `/coming-soon` page (a route *outside* the `(storefront)` group, so it isn't itself tenant-gated).
- **`getCurrentVendorId()` keeps its non-null contract** — so slice-2 repositories and 3a's
  `requireVendorRole()` are **unchanged**. It now resolves from the host and throws if unmatched; a
  new `getCurrentVendorIdOrNull()` (nullable) is what the layout gate uses.
- **Per-request memoization via React `cache()`** — the host→vendor lookup runs once per request
  (layout + every repository share it), per-request only (never cached across requests; Workers rule).
- **Transition safety:** if no `VendorDomain` matches the host **and exactly one active vendor exists**,
  resolve to that vendor (so Aheed keeps working before SriMart's host rows are seeded). With 2+
  vendors, an unmatched host → Coming Soon. This avoids a deploy-time gap where Aheed 404s.

**Scope (this slice):**
- Prisma: `VendorDomain` model + additive migration (new table).
- `lib/tenant.ts`: host-based `getCurrentVendorId()` (throws on miss) + `getCurrentVendorIdOrNull()`,
  both over a `cache()`-memoized host lookup.
- `app/(storefront)/layout.tsx`: `if (!(await getCurrentVendorIdOrNull())) redirect("/coming-soon")`.
- `app/coming-soon/page.tsx`: friendly "coming soon / unknown store" page with a link to the default
  vendor's canonical host (the oldest active vendor's `isCanonical` `VendorDomain`).
- **SriMart fixture:** seed the SriMart vendor + a small, visibly-distinct dummy catalogue, plus
  `VendorDomain` rows for Aheed and SriMart sourced from per-environment env vars (`SEED_AHEED_HOST`,
  `SEED_SRIMART_HOST`) — staging and prod are separate DBs, so each seeds its own hosts.
- `wrangler.toml`: routes for `srimart.nocaped.com` (prod) + `srimart-staging.nocaped.com` (staging),
  matching the domains already added by hand (tree-honesty — else the next deploy tears them down).
- `docs/env-setup.md`: document `SEED_*_HOST` + the `VendorDomain` model.

**Deliberately excluded:**
- Auth cookie scoping / family SSO / custom-domain isolation — **3c**.
- Canonical-origin redirect (subdomain → custom domain) — deferred; each vendor has one host today.
- Dropping the now-superseded `Vendor.customDomain` column — later cleanup, not worth a prod
  drop-column migration now.

**Open items carried forward:**
- Seeding `VendorDomain` hosts is a per-env ops step (`SEED_*_HOST` when running seed against each
  env's `DIRECT_URL`); validated on staging (both `staging.aheedfoodcentre…` and `srimart-staging…`).
- SriMart in **production** (`srimart.nocaped.com`) ships as a live demo vendor since the owner added
  that route; it's populated by the same seed run against prod at promotion time.
