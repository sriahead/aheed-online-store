# ADR-004 slice 1 — Vendor aggregate + vendorId migration (validation)

DB-touching checks (R8/R9) run against a disposable copy of a **seeded** database — a Neon branch of
staging, or the staging project itself at ship time — never `npm run dev`. `npx prisma validate`
confirms the schema compiles; `npx prisma generate` refreshes the client for the tsc checks.

| Req | How to verify |
|-----|---------------|
| R1  | `grep -A8 "model Vendor " prisma/schema.prisma` shows `slug String @unique`, `status` (enum, `@default(ACTIVE)`), `customDomain String? @unique`, timestamps; `npx prisma validate` exits 0. |
| R2  | `grep -A16 "model VendorBranding" prisma/schema.prisma` shows `vendorId String @unique`, `onDelete: Cascade`, `logoStorageKey String?`, `name`, `tagline String?`, and a column per `--color-brand-*` primitive; `grep -c "Json" prisma/schema.prisma` returns 0. |
| R3  | `grep -A10 "model VendorConfig" prisma/schema.prisma` shows locality + sender name/email columns and `vendorId String @unique` cascade; no `Json`. |
| R4  | `grep -A6 "model VendorDeliveryArea" prisma/schema.prisma` shows `prefix` and `@@unique([vendorId, prefix])`. |
| R5  | For each of `Category`/`Product`/`Inventory`/`Review`: `grep` shows `vendorId String` + a `vendor Vendor @relation(...)` and an `@@index([vendorId` (vendorId first). |
| R6  | `grep` shows `@@unique([vendorId, slug])` on `Category` and `Product` (and no bare `slug String @unique`), and `@@unique([vendorId, userId, productId])` on `Review`. |
| R7  | The new `prisma/migrations/*/migration.sql` contains, in order: `INSERT INTO "Vendor"` (slug `aheed-food-centre`, fixed UUID); `ADD COLUMN "vendorId"` (nullable); `UPDATE "Category"/"Product"/"Inventory"/"Review" SET "vendorId" =`; `SET NOT NULL`; `ADD CONSTRAINT ... FOREIGN KEY ("vendorId")`; the composite unique index create/drop; `CREATE TABLE "VendorBranding"/"VendorConfig"/"VendorDeliveryArea"`. |
| R8  | Against a Neon branch seeded with pre-slice-1 data: capture counts (`SELECT count(*) FROM "Product"` etc.); run `npx prisma migrate deploy`; re-check counts are identical; `SELECT count(*) FROM "Product" WHERE "vendorId" <> '<aheed-uuid>'` returns 0 for all four tables. Migrate exits 0; a second `migrate deploy` reports no pending migrations. |
| R9  | `DIRECT_URL=<fresh-branch> npx prisma migrate deploy && DIRECT_URL=<fresh-branch> npm run db:seed` exits 0; every seeded `Product`/`Category`/`Inventory` has `vendorId` = the Aheed vendor; a second `db:seed` adds no rows. |
| R10 | `npx tsc --noEmit` passes with the updated `reviews.ts`. On a seeded preview/staging, submit a review as a signed-in user (`features/reviews/submit-review.ts` path) → the `Review` row is created/updated with `vendorId` = the product's `vendorId`; re-submitting updates the same row (composite upsert). |
| R11 | `npx prisma generate && npx tsc --noEmit` exits 0; a `git diff` of `lib/repositories/*.ts` and the storefront pages shows **no added `vendorId` read filter** (reads unchanged); the storefront product list/detail still render on `npm run preview`. |
| R12 | `git diff specs/architecture.md` shows the vendor-scoped schema (Vendor + `vendorId`) and an ADR-004 reference; front-matter `version`/`updated` bumped. |
| R13 | `CHANGELOG.md` diff shows an entry naming this slice and `#62`. |
| R14 | `npm run lint && npm run typecheck && npm run test && npm run format:check && npm run kms:validate` exit 0; `npm run kms:build-index` leaves `ARTIFACT_INDEX.md` matching the committed copy (staleness gate). |
