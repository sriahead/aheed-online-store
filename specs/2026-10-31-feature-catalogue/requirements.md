# Feature Catalogue (requirements / acceptance criteria)

Closes `#1374`.

R1. `/staff/feature-catalogue` exists and renders the catalogue for four roles, in this order:
    Customer, Admin, Staff, Platform Admin.
R2. Each feature has a name, a BLUF ("what it does"), a business value, a demo talking point and a
    status of Live, Partial or Unavailable.
R3. Every Partial or Unavailable feature carries a note saying what is missing.
R4. The page is gated `requireVendorRole("ADMIN")`; Staff see the `PanelRefusal` "Admin only", and a
    signed-out visitor is redirected to `/login`.
R5. The menu shows "Feature Catalogue" for the admin tier only, and the hub card matches.
R6. Every route a feature names exists, and every menu page (store and platform) appears in the
    catalogue under the role that can open it.
R7. The page uses `PageContainer`, `PanelRefusal` and registry icons, and carries no vendor name.
R8. The operator guide documents the page, with access matching its gate.
R9. `CHANGELOG.md` records the change.
