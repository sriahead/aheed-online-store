# Validation: Team & Role Management (P6.7)

> **Status (2026-08-17):** §3's automated coverage now exists (`tests/roles.test.ts`, added
> alongside the self-lockout fix in PR #188) and is checked off below. §1 and §2 have **not** been
> walked live — that needs a real multi-account browser session (platform-admin / store-admin /
> staff / plain user) against `npm run preview` or staging, plus a live query against
> `VendorRoleAuditLog`. Tracked on issue #186 before this closes or promotes to `main`.

## 1. Role Provisioning & Hierarchy

### 1.1 Platform Admin Capabilities
- [ ] Sign in as a `platform-admin` user (e.g. `dev@aheedfoodcentre.com`).
- [ ] Navigate to `/staff/team`.
- [ ] Search for a standard `USER` by email and assign them the `ADMIN` role for the current vendor.
- [ ] **Verify:** The user now appears in the Team list as a Store Admin.
- [ ] Search for a standard `USER` by email and assign them the `STAFF` role.
- [ ] **Verify:** The user now appears in the Team list as Staff.
- [ ] Attempt to demote a Store Admin back to `USER`.
- [ ] **Verify:** The demotion succeeds.

### 1.2 Store Admin Capabilities
- [ ] Sign in as a `Store Admin` user (an `ADMIN` but not `platform-admin`).
- [ ] Navigate to `/staff/team`.
- [ ] Search for a standard `USER` by email and assign them the `STAFF` role.
- [ ] **Verify:** The user now appears in the Team list as Staff.
- [ ] Attempt to assign a user the `ADMIN` role.
- [ ] **Verify:** The UI does not offer the `ADMIN` option, and any direct server action call is
      refused — `assignRoleAction` returns `{ success: false, error }` rather than applying the
      change (a Next.js Server Action returns a normal 200 with an error payload, not a literal
      HTTP 403; there is no route handler here to return one from).
- [ ] Attempt to demote a `platform-admin` user.
- [ ] **Verify:** The server action refuses the same way — `{ success: false, error }`, no write.

### 1.3 Staff Restrictions
- [ ] Sign in as a standard `STAFF` user.
- [ ] Attempt to navigate to `/staff/team`.
- [ ] **Verify:** Access is denied (redirected or 403 error).

### 1.4 Self-Lockout Guard
- [ ] As a `Store Admin`, attempt to demote yourself to `USER` or `STAFF`.
- [ ] **Verify:** The action is blocked if you are the only remaining `ADMIN` for the vendor, preventing an unrecoverable lockout.

## 2. Audit Trail
- [ ] Perform a promotion (e.g., `USER` -> `STAFF`).
- [ ] Perform a demotion (e.g., `STAFF` -> `USER`).
- [ ] Connect directly to the database (via Prisma Studio or `psql`).
- [ ] Query the `VendorRoleAuditLog` table.
- [ ] **Verify:** There is exactly one row per action.
- [ ] **Verify:** The `actorId` matches the admin who performed the action.
- [ ] **Verify:** The `oldRole` and `newRole` values accurately reflect the transition.
- [ ] **Verify:** The `vendorId` and `userId` are correctly populated.

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
