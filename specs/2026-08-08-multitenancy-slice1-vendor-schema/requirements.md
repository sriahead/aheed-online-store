# ADR-004 slice 1 — Vendor aggregate + vendorId migration (requirements)

The first schema change of ADR-004's multi-tenancy work (issue #62, parent #49). Introduces the
`Vendor` tenancy root + satellite tables, adds a mandatory `vendorId` to every domain table, and
backfills all existing rows to a single "Aheed Food Centre" vendor. Builds on `neon-db-separation`
(#56, separate DBs). Read-side tenant filtering is slice 2, not here; runtime behavior is unchanged.

R1. `prisma/schema.prisma` defines `Vendor` with `id`, `slug String @unique`, `name`, a `status`
    enum (values incl. `ACTIVE`, default `ACTIVE`), `customDomain String? @unique`, and
    `createdAt`/`updatedAt`.

R2. Schema defines `VendorBranding` 1:1 with `Vendor` (`vendorId String @unique`, FK
    `onDelete: Cascade`) with `name`, `tagline String?`, `logoStorageKey String?` (relative key, not
    a URL), and one explicit hex-string column per brand color primitive in
    `design-system/tokens/tokens.css` (`--color-brand-green-dark`, `-green`, `-orange`, `-red`,
    `-cream`, and the `-*-tint` set). No `Json` column anywhere in the model.

R3. Schema defines `VendorConfig` 1:1 with `Vendor` (`vendorId String @unique`, FK cascade) with
    explicit columns for locality copy and sender identity (sender name + sender email). No `Json`.

R4. Schema defines `VendorDeliveryArea` (many per `Vendor`, `vendorId` FK cascade) storing one
    postcode `prefix` per row, with `@@unique([vendorId, prefix])`.

R5. `Category`, `Product`, `Inventory`, and `Review` each have a required `vendorId String` FK to
    `Vendor`, and each has an `@@index` whose first field is `vendorId`.

R6. Global identity uniques are replaced by per-vendor composites: `Category` and `Product` use
    `@@unique([vendorId, slug])` with the standalone `slug @unique` removed; `Review` uses
    `@@unique([vendorId, userId, productId])` (replacing `@@unique([userId, productId])`).

R7. A single migration under `prisma/migrations/` performs, in order: insert the Aheed vendor
    (slug `aheed-food-centre`, a fixed well-known UUID); add `vendorId` nullable to the four tables;
    backfill every existing row to the Aheed vendor's id; set `vendorId NOT NULL` and add the FKs;
    drop the old unique indexes and create the composite ones and the `vendorId`-leading indexes;
    create `Vendor`, `VendorBranding`, `VendorConfig`, `VendorDeliveryArea`.

R8. `npx prisma migrate deploy` applies cleanly against a database holding pre-slice-1 data
    (catalogue + reviews), with **no data loss**: table row counts are unchanged and every
    `Category`/`Product`/`Inventory`/`Review` row has `vendorId` = the Aheed vendor's id.

R9. `prisma/seed.ts` ensures the Aheed vendor exists (idempotent) and sets `vendorId` on every
    `Category`/`Product`/`Inventory` row it creates, so a fresh `migrate deploy` + `db:seed` yields
    vendor-scoped data consistent with the backfill; re-running the seed creates no duplicates.

R10. The review write path supplies the required `vendorId`: `lib/repositories/reviews.ts`'s upsert
     sets `Review.vendorId` from the reviewed product's `vendorId` and keys on
     `@@unique([vendorId, userId, productId])`; `features/reviews/submit-review.ts` still compiles and
     submits a review end to end.

R11. Runtime reads are unchanged: `lib/repositories/*` and the storefront pages still return the same
     results (no `vendorId` filter added yet), and `npx tsc --noEmit` passes with the regenerated
     Prisma client.

R12. `specs/architecture.md`'s schema section is updated to reflect the vendor-scoped model (Vendor
     root + `vendorId` on domain tables), pointing to ADR-004; its front-matter `version`/`updated`
     bumped.

R13. `CHANGELOG.md` updated (Gate 4), referencing #62.

R14. `lint`, `typecheck`, `test`, `format:check`, `kms:validate` all pass and `ARTIFACT_INDEX.md` is
     regenerated (Gate 3 + CI gates).
