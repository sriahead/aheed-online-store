# Plan: Team & Role Management (P6.7)

## 1. Problem Statement
There is currently no user interface for managing team access. Dev Admins (platform-admin) have to manually update database rows to provision "Store Admins", and Store Admins have no way to invite or promote standard users to "Staff" status. Furthermore, there is no audit log of who granted or revoked these privileges.

## 2. Approach

1. **Schema Update (`prisma/schema.prisma`)**
   - We need an audit trail table, e.g., `VendorRoleAuditLog`.
   - Fields: `id`, `vendorId`, `userId` (target), `actorId` (the admin performing the action), `oldRole`, `newRole`, `createdAt`.

2. **Role Management Logic (`lib/repositories/vendor.ts` or `lib/auth-rbac.ts`)**
   - Create a service function `updateVendorRole(targetUserId, newRole)` that evaluates the current user's privileges.
   - Enforce the hierarchy:
     - `platform-admin` can grant `ADMIN` or `STAFF`.
     - `ADMIN` can only grant `STAFF`.
     - `STAFF` cannot grant any roles.
   - Wrap the role update (`upsert` or `update` on `VendorMembership`) and the `VendorRoleAuditLog` insert in a single Prisma transaction.

3. **Admin Dashboard UI (`app/(admin)/staff/team/page.tsx`)**
   - Add a new "Team & Access" card to the `StaffHomePage` (visible only to `ADMIN`).
   - Create a new list view to show all current `ADMIN` and `STAFF` members for the vendor.
   - Add a form to search for a registered user by email and assign them a role.

## 3. Risks & Considerations
- **Privilege Escalation:** Must ensure that a Store Admin cannot modify the DOM or intercept requests to assign themselves or others `platform-admin` status, or bypass the `ADMIN`-only restriction when assigning `STAFF`.
- **Self-Lockout:** Prevent an `ADMIN` from demoting themselves if they are the last admin for a vendor.
