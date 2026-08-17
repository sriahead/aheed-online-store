# Validation: Team & Role Management (P6.7)

> **Status (2026-08-17):** **§1 and §2 were walked live on staging** (`staging.aheedfoodcentre.nocaped.com`,
> vendor Aheed Food Centre) in a real browser across four accounts, and every row below passed —
> see `specs/2026-08-17-p6.7-closeout-promotion/build-notes.md` for the transcript and the audit-log
> table. §3's automated coverage (`tests/roles.test.ts`, added alongside the self-lockout fix in
> PR #188) is unchanged. This supersedes the earlier status, which said §1 and §2 had not been
> walked — true until this date, and the reason issue #186 was reopened.
>
> §1.2 was unreachable before this pass: it needs a store admin who is *not* a platform admin, and
> no such account existed. `requireVendorRole()` returns early with `via: "platform-admin"` for any
> platform `ADMIN` (`lib/auth-rbac.ts`), so `demo-admin`'s `vendorRole` is never read.
> `demo-store-admin@example.com` was added to the roster for exactly this (#190).

## 1. Role Provisioning & Hierarchy

### 1.1 Platform Admin Capabilities
- [x] Sign in as a `platform-admin` user — used `demo-admin@example.com` (platform `ADMIN`).
- [x] Navigate to `/staff/team` — renders; role selector offers `STAFF`, `ADMIN`, `NONE`.
- [x] Search for a standard `USER` by email and assign them the `ADMIN` role for the current vendor.
- [x] **Verify:** The user now appears in the Team list as a Store Admin. — `demo-customer` showed
      Store Role `ADMIN`, Platform Role `User`.
- [x] Search for a standard `USER` by email and assign them the `STAFF` role.
- [x] **Verify:** The user now appears in the Team list as Staff. — confirmed.
- [x] Attempt to demote a Store Admin back to `USER`.
- [x] **Verify:** The demotion succeeds. — row removed from Current Members.

> Run order note: the demotion was performed *before* the `STAFF` grant, because both rows need a
> plain `USER` as their starting state and one throwaway account (`demo-customer`) was used for all
> three. Each assertion still ran against its correct precondition.

### 1.2 Store Admin Capabilities
- [x] Sign in as a `Store Admin` user (an `ADMIN` but not `platform-admin`) —
      `demo-store-admin@example.com`, platform role `CUSTOMER`, so it resolves `via: "ADMIN"`.
- [x] Navigate to `/staff/team` — renders.
- [x] Search for a standard `USER` by email and assign them the `STAFF` role.
- [x] **Verify:** The user now appears in the Team list as Staff. — confirmed.
- [x] Attempt to assign a user the `ADMIN` role.
- [x] **Verify:** The UI does not offer the `ADMIN` option, and any direct server action call is
      refused — `assignRoleAction` returns `{ success: false, error }` rather than applying the
      change (a Next.js Server Action returns a normal 200 with an error payload, not a literal
      HTTP 403; there is no route handler here to return one from).
      — `<select name="role">` contained exactly `["STAFF","NONE"]` in the DOM (absent, not hidden).
      Injecting an `ADMIN` option and submitting returned
      `Forbidden: Only a platform-admin can grant the Store Admin role.` with no write.
- [x] Attempt to demote a `platform-admin` user.
- [x] **Verify:** The server action refuses the same way — `{ success: false, error }`, no write.
      — returned `Forbidden: Cannot modify a platform-admin's privileges.`, no membership created.
      Probed by *assigning* `STAFF` to `demo-admin` rather than demoting it: `demo-admin` had no
      membership at that point (demoted during §1.4 setup), so a demote would have hit the earlier
      `oldRole === newRole` guard and masked the platform-admin check at `roles.ts:64`.

### 1.3 Staff Restrictions
- [x] Sign in as a standard `STAFF` user — `demo-staff@example.com`.
- [x] Attempt to navigate to `/staff/team`.
- [x] **Verify:** Access is denied (redirected or 403 error). — denied **in place**, not redirected:
      URL stays `/staff/team` and the page renders an "Admin only" panel with no team table and no
      grant form. `PanelNav` also omits the Team link entirely for STAFF.

### 1.4 Self-Lockout Guard
- [x] As a `Store Admin`, attempt to demote yourself to `USER` or `STAFF` — both attempted, with
      `demo-store-admin` as the vendor's only remaining `ADMIN`.
- [x] **Verify:** The action is blocked if you are the only remaining `ADMIN` for the vendor,
      preventing an unrecoverable lockout. — both refused with
      `Forbidden: Cannot demote the last remaining Store Admin.`; the membership row survived as
      `ADMIN` in both cases.

## 2. Audit Trail
- [x] Perform a promotion (e.g., `USER` -> `STAFF`).
- [x] Perform a demotion (e.g., `STAFF` -> `USER`).
- [x] Connect directly to the database (via Prisma Studio or `psql`) — queried with a `tsx` script
      over `DIRECT_URL` against the staging Neon project (`ep-empty-scene-zafjzeye`).
- [x] Query the `VendorRoleAuditLog` table.
- [x] **Verify:** There is exactly one row per action. — exactly 6 new rows for the 6 successful
      writes, against a pre-walk baseline of 2 rows. **The 4 refused attempts wrote 0 rows**, which
      is what proves the guards sit inside the `$transaction` rather than after a partial write.
- [x] **Verify:** The `actorId` matches the admin who performed the action. — the 4 platform-admin
      actions carry `demo-admin`'s id, the 2 store-admin actions carry `demo-store-admin`'s.
- [x] **Verify:** The `oldRole` and `newRole` values accurately reflect the transition. — confirmed
      row by row (`USER→ADMIN`, `ADMIN→USER`, `USER→STAFF`, `ADMIN→USER`, `STAFF→USER`, `USER→STAFF`).
- [x] **Verify:** The `vendorId` and `userId` are correctly populated. — every row carries the Aheed
      vendor id and a populated `userId`.

## 3. Automated Test Coverage (Unit & Integration)
- [x] `tests/roles.test.ts` (added 2026-08-17, PR #188) covers the full matrix against
      `lib/repositories/roles.ts`:
  - `platform-admin` upgrading `USER` to `ADMIN` -> pass
  - `ADMIN` upgrading `USER` to `STAFF` -> pass
  - `ADMIN` upgrading `USER` to `ADMIN` -> fail
  - `STAFF` upgrading `USER` to `STAFF` -> fail (via `requireVendorRole` never granting entry)
  - plus the self-lockout guard (blocks the last admin, allows demotion when another remains,
    exempts platform-admins) and the redundant-assignment and platform-admin-target refusals.
- [x] The transaction is asserted directly: the membership write and the audit-log write both run
      against the same `tx` client the `$transaction` callback receives (not the outer `getPrisma()`
      client), and the call is asserted to run at `Serializable` isolation.
