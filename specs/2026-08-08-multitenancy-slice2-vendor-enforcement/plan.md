---
id: multitenancy-slice2-vendor-enforcement
title: "ADR-004 slice 2 — repository-layer vendorId enforcement + no-direct-Prisma guard (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-08
visibility: internal
summary: Make reads/writes tenant-scoped — every repository query filters by vendorId via a getCurrentVendorId() seam, enforced centrally, with an ESLint guard that keeps domain queries inside the repository layer.
tags: [multi-tenancy, vendor, repositories, enforcement, eslint]
related: [adr-004-multi-tenancy, multitenancy-slice1-vendor-schema, architecture]
---

# ADR-004 slice 2 — repository-layer vendorId enforcement + no-direct-Prisma guard (plan)

Second slice of ADR-004 (issue #66), building on slice 1's schema + backfill (#62). `requirements.md`
holds the checkable criteria.

**Goal:** turn the `vendorId` column slice 1 added into a real isolation boundary — every domain
query filters by the current vendor, enforced in one place so a missing filter can't leak
cross-vendor data, with a lint guard that stops future code from bypassing the repository layer.

**Scope (this slice):**
- **`lib/tenant.ts` → `getCurrentVendorId(): Promise<string>`** — the tenant-resolution *seam*.
  Interim (single-vendor, no request resolver yet): resolves the sole `ACTIVE` vendor. **Slice 3
  replaces only this function's body** with host→tenant resolution; repositories don't change.
  Constructed fresh per call (never cached across requests — Workers rule, same as `getPrisma()`).
- **Repositories filter by `vendorId`** — `products.ts` (`listByCategory`/`search`/`getBySlug`),
  `categories.ts` (`listTopLevel`/`getBySlug`), `reviews.ts` read methods. Each resolves the vendor
  id via `getCurrentVendorId()` **once per repository instance** (request-scoped) and injects
  `where: { vendorId }`. **Method signatures are unchanged** → pages/features are untouched. The
  review upsert keeps deriving `Review.vendorId` from the product (slice 1); aggregate recomputes
  stay keyed by `productId` (already vendor-scoped, globally unique).
- **ESLint guard** — importing `@/lib/db` (`getPrisma`) or bare `@prisma/client` from `app/**`,
  `features/**`, or `components/**` is an error, forcing domain queries through `lib/repositories/*`.
  `app/api/health/**` is allowlisted (infra `HealthCheck` probe on a non-tenant table). `lib/**`
  (repositories, tenant, `auth.ts`, `db.ts`) is unaffected. Today there are **zero** such imports in
  those dirs (only the allowlisted health route), so the guard is green on the current tree. Use
  `@typescript-eslint/no-restricted-imports` with `allowTypeImports: true` for the `@prisma/client`
  entry so future type-only imports (e.g. `import type { Role }`) aren't blocked — only runtime
  Prisma access is.
- **Roadmap/doc close-out** — folds in the deferred slice-0/1 roadmap closure note (#65) and adds a
  slice-2 entry; CHANGELOG updated.

**Runtime behavior is unchanged:** there is exactly one vendor (Aheed), so filtering by its id
returns the same rows — but reads are now provably scoped, and the guard prevents regressions.

**Deliberately excluded:**
- Host/subdomain → tenant resolution, `VendorMembership`, auth cookie scoping — **slice 3** (it only
  swaps `getCurrentVendorId()`'s internals).
- Branding→CSS vars, delivery area → `lib/delivery.ts`, config split, populating the satellite
  tables — **slice 4**.
- Request-scoped caching of the resolved vendor beyond a single repository instance — not needed at
  one vendor; revisit if it shows up as N+1 in slice 3.

**Open items carried forward:**
- The hand-authored slice-1 migration drift check (#65) is separate; not part of this slice.
