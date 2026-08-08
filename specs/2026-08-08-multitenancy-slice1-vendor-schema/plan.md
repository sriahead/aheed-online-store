---
id: multitenancy-slice1-vendor-schema
title: "ADR-004 slice 1 — Vendor aggregate + vendorId migration (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-08
visibility: internal
summary: Introduce the Vendor tenancy root and its config/branding satellite tables, add a mandatory vendorId to every domain table, and backfill all existing rows to a single Aheed Food Centre vendor — the schema foundation of multi-tenancy, before repository-layer enforcement.
tags: [multi-tenancy, vendor, prisma, migration, schema]
related: [adr-004-multi-tenancy, neon-db-separation, architecture]
---

# ADR-004 slice 1 — Vendor aggregate + vendorId migration (plan)

The first schema change of ADR-004's multi-tenancy work (issue #62, parent #49). `requirements.md`
holds the checkable criteria.

**Goal:** make every domain row belong to a `Vendor`, with a single "Aheed Food Centre" vendor
owning all current data — the tenancy skeleton the later slices build on. After this slice the DB is
vendor-scoped, but the **running app behaves identically** because queries don't filter by
`vendorId` yet (that's slice 2) and every row belongs to the one vendor.

**Scope (this slice — full ADR slice 1, confirmed with owner):**
- **`Vendor`** — tenancy root: `id`, `slug @unique`, `name`, `status` (enum, default ACTIVE),
  optional `customDomain @unique` (added now, consumed in slice 3), timestamps.
- **Satellite tables** (created now; empty/unused until slice 4 wires them in):
  - `VendorBranding` (1:1, `vendorId @unique`): `name`, `tagline?`, `logoStorageKey?` (relative key,
    ADR-003 — never a URL), and the brand color **primitives** from
    `design-system/tokens/tokens.css` (`--color-brand-green-dark/green/orange/red/cream` + tints) as
    explicit hex-string columns. **No `Json` column** (CLAUDE.md).
  - `VendorConfig` (1:1, `vendorId @unique`): locality copy + sender identity (name, email) columns.
    Explicit columns only, no `Json`.
  - `VendorDeliveryArea` (many per vendor): one postcode `prefix` per row, `@@unique([vendorId, prefix])`.
- **`vendorId` FK** (required) on `Category`, `Product`, `Inventory`, `Review`, with `@@index`
  leading on `vendorId`.
- **Per-vendor composite uniques:** `Category`/`Product` → `@@unique([vendorId, slug])` (standalone
  `slug @unique` removed); `Review` → `@@unique([vendorId, userId, productId])`.
- **One migration** safe for the populated staging + production DBs: create the Aheed vendor (fixed,
  well-known UUID so it's identical across environments) → add `vendorId` nullable → backfill every
  existing row to Aheed → set `NOT NULL` + FK → swap the unique indexes. Data steps are hand-added to
  the generated SQL (a migration, not app code — allowed). Runs on staging first via the pipeline,
  then production on the staging→main promotion.
- **Minimal write-path updates** so the required column is always supplied (NOT read filtering):
  `prisma/seed.ts` ensures the Aheed vendor and scopes seeded rows to it; the review upsert
  (`lib/repositories/reviews.ts` + `features/reviews/submit-review.ts`) sets `Review.vendorId` from
  the reviewed product's `vendorId` and keys on the new composite unique.

**Deliberately excluded:**
- **Read-side `vendorId` filtering / central repository enforcement + the no-direct-Prisma lint
  guard — slice 2.** This slice adds the column and backfills; it does not make reads tenant-aware.
- Host→tenant resolver, auth cookie scoping, `VendorMembership` — slice 3.
- Wiring branding→CSS vars, `VendorDeliveryArea`→`lib/delivery.ts`, config split, collapsing the
  hardcoded brand/locality surfaces — slice 4. The satellite tables ship **empty** here.
- `User` does **not** get a `vendorId` — identity is global per ADR-004 (authorization becomes
  per-vendor via `VendorMembership` in slice 3). The other Better Auth tables (`Session`, `Account`,
  `Verification`) and `HealthCheck` stay global too — none are domain rows.
- `ProductImage` does **not** get its own `vendorId` — it's a child of `Product` and derives tenancy
  through it (it's always read via a product). This matches ADR-004's table list (Category, Product,
  Inventory, Review).

**Migration technique (build note):** Prisma cannot auto-backfill a new required FK, so the migration
is generated with `prisma migrate dev --create-only` and then **hand-edited** to insert the Aheed
vendor and run the nullable→backfill→`NOT NULL` sequence before it's applied. Do not let Prisma emit a
plain `ADD COLUMN ... NOT NULL` — it would fail against the populated staging/prod tables.

**Open items carried forward:**
- The migration runs against the real staging/prod databases (now separate Neon projects, #56);
  full-data validation (row counts unchanged, all rows → Aheed) happens on staging at ship time.
- Seeding per-vendor branding/config/delivery *values* for Aheed is slice 4, not here — the tables
  exist but stay empty, so `lib/delivery.ts` etc. remain hardcoded until then.
