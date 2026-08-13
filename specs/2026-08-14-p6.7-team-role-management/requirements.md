# P6.7 — Team & Role Management

## Context
Currently, `STAFF` and `ADMIN` users must be manually provisioned in the database or via developer tools. This slice adds a secure, audit-logged UI within the Operations Portal to manage roles, adhering to the principle of least privilege.

## Requirements

### 1. Role Provisioning & Hierarchy
- [ ] **Platform Admin to Store Admin:** A user with the platform-admin role (Dev admin) must be able to upgrade a standard `USER` to a `Store Admin` for a specific vendor.
- [ ] **Store Admin to Staff:** A user with `ADMIN` privileges for a vendor must be able to upgrade a standard `USER` to `STAFF` for that specific vendor.
- [ ] **Demotion:** Admins must be able to revoke roles, returning a `STAFF` or `ADMIN` user to a standard `USER`.
- [ ] **Boundary Guard:** A `Store Admin` cannot create another `Store Admin`, nor can they modify `Platform Admin` privileges.

### 2. Audit Trail
- [ ] **Auditable Logging:** Every role change (promotion or demotion) must be logged securely in the database.
- [ ] **Audit Columns:** The audit log must record:
  - The `userId` of the user whose role changed.
  - The `vendorId` scoped to the change.
  - The `oldRole` and `newRole`.
  - The `actorId` (the user who executed the role change).
  - The timestamp of the change.

### 3. User Interface
- [ ] **Team Portal:** A new `/staff/team` route in the Operations Portal.
- [ ] **Visibility:** The Team tab is visible only to `ADMIN` and platform-admin users. Standard `STAFF` users cannot see or access this page.
- [ ] **Actions:** The UI should allow searching for a user by email, displaying their current role, and providing buttons to update their role (e.g. "Promote to Staff", "Revoke Access").
