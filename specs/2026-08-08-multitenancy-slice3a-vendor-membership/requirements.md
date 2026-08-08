# ADR-004 slice 3a — per-vendor authorization (VendorMembership) (requirements)

First sub-slice of slice 3 (issue #68), building on slice 2's `getCurrentVendorId()` seam (#66).
Per-vendor staff/admin authorization while identity stays global. No infra; fully testable at one
vendor. 3b (host resolver) and 3c (auth cookie scoping) follow.

R1. `prisma/schema.prisma` defines `enum VendorRole { STAFF ADMIN }` and a `VendorMembership` model
    with `id`, `userId`, `vendorId`, `role VendorRole`, timestamps, `@@unique([userId, vendorId])`,
    `@@index([vendorId])`, and FKs to `User` and `Vendor` (`onDelete: Cascade`); `User` and `Vendor`
    gain a `memberships VendorMembership[]` relation. `npx prisma validate` passes.

R2. A migration under `prisma/migrations/` creates the `VendorRole` enum, the `VendorMembership`
    table, its unique/index, and both FKs — a plain additive migration (new table, no backfill) that
    `prisma migrate deploy` applies cleanly.

R3. `User.role` is unchanged in the schema and is documented (schema comment / architecture.md) as
    the **platform-level** role; platform `ADMIN` transcends vendors.

R4. `lib/auth-rbac.ts` exports `requireVendorRole(...allowed: VendorRole[])` returning a typed result:
    unauthenticated → `{ ok:false, status:401 }`; platform `ADMIN` (`User.role === "ADMIN"`) →
    `{ ok:true, ... }` **without needing a membership**; otherwise a `VendorMembership` for the
    current vendor (`getCurrentVendorId()`) whose `role` ∈ `allowed` → `{ ok:true, ... }`; else
    `{ ok:false, status:403 }`.

R5. `requireRole(...)` (platform-level) is unchanged, and `app/(storefront)/dev/page.tsx` still gates
    on platform `ADMIN` via it (no behavior change to `/dev`).

R6. Demo accounts' roles reflect the platform-vs-vendor split, provisioned idempotently by the
    demo-accounts tool (`scripts/demo-accounts.ts add`) — the only place that creates the demo users,
    so the only place that can attach their memberships; `prisma/seed.ts` is untouched (it seeds
    catalogue, not users):
    - `demo-admin@example.com` — platform `User.role = ADMIN` (keeps `/dev` working) **and** a
      `VendorMembership(Aheed, ADMIN)`.
    - `demo-staff@example.com` — platform `User.role = CUSTOMER` **and** a `VendorMembership(Aheed, STAFF)`
      (a vendor's staff is a normal user with a staff membership, not a platform staffer).
    - `demo-customer@example.com` — platform `User.role = CUSTOMER`, no membership.
    Re-running creates no duplicates. (A vendor-only admin used to prove cross-vendor *isolation*
    lives with SriMart as a **3b** fixture, not here — at one vendor there's nothing to be isolated from.)

R7. `tests/` covers `requireVendorRole`: (a) unauthenticated → 401; (b) platform `ADMIN` → allowed
    with no membership; (c) a member whose role is in `allowed` → allowed; (d) a member whose role is
    not in `allowed` → 403; (e) authenticated non-member (customer) → 403. Session, tenant, and
    membership lookups are mocked.

R8. `specs/architecture.md` notes the platform-role vs per-vendor-membership authorization model
    (front-matter bumped); `ARTIFACT_INDEX.md` regenerated.

R9. `CHANGELOG.md` updated (Gate 4), referencing #68.

R10. `lint`, `typecheck`, `test`, `format:check`, `kms:validate` all pass.
