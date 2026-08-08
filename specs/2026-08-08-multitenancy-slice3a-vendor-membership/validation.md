# ADR-004 slice 3a — per-vendor authorization (VendorMembership) (validation)

DB-touching checks run against a seeded DB via `DIRECT_URL` (Node) or `npm run preview`/staging —
never `npm run dev`.

| Req | How to verify |
|-----|---------------|
| R1  | `grep -A12 "model VendorMembership" prisma/schema.prisma` shows `role VendorRole`, `@@unique([userId, vendorId])`, `@@index([vendorId])`, cascade FKs; `enum VendorRole` present; `User`/`Vendor` have `memberships`. `npx prisma validate` exits 0. |
| R2  | The new `prisma/migrations/*/migration.sql` has `CREATE TYPE "VendorRole"`, `CREATE TABLE "VendorMembership"`, its unique index + `@@index`, and two `ADD CONSTRAINT ... FOREIGN KEY`. `DIRECT_URL=<branch> npx prisma migrate deploy` applies it cleanly; a second run reports no pending. |
| R3  | `git diff prisma/schema.prisma` shows no change to `User.role`; a schema comment / architecture.md states it is the platform-level role. |
| R4  | `grep -n "requireVendorRole" lib/auth-rbac.ts` shows the exported function; `npx tsc --noEmit` passes with its result type. |
| R5  | `git diff lib/auth-rbac.ts app/(storefront)/dev/page.tsx` shows `requireRole` unchanged and `/dev` still calling `requireRole("ADMIN")`. |
| R6  | After `DIRECT_URL=<target> DEMO_ACCOUNT_PASSWORD=… npm run demo:accounts -- add`: querying `VendorMembership` shows demo-admin=ADMIN and demo-staff=STAFF for the Aheed vendor, demo-customer absent; demo-admin `User.role=ADMIN`, demo-staff/customer `User.role=CUSTOMER`; a second run leaves counts unchanged (one membership row per demo staff/admin). |
| R7  | `npx vitest run tests/auth-rbac.test.ts` (or a new `vendor-rbac` test file) — green, covering the five `requireVendorRole` cases (401 unauth; platform-admin allowed w/o membership; role-in-allowed allowed; role-not-in-allowed 403; non-member 403). |
| R8  | `git diff specs/architecture.md` shows the authorization-model note + bumped front-matter; `npm run kms:build-index` leaves `ARTIFACT_INDEX.md` matching the committed copy. |
| R9  | `CHANGELOG.md` diff shows a new entry naming slice 3a and `#68`. |
| R10 | `npm run lint && npm run typecheck && npm run test && npm run format:check && npm run kms:validate` all exit 0. |
