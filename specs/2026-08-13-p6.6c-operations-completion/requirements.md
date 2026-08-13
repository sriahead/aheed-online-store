# Requirements

## 1. Navigation Alignment
- [ ] `components/staff/PanelNav.tsx` is updated to give Admin users access to `Inventory` and `Runbook` tabs.
- [ ] `PanelNav.tsx` includes a new `Reports` tab for Admin users.
- [ ] `PanelNav.tsx` uses horizontal scrolling (`overflow-x-auto whitespace-nowrap` or similar) to prevent wrapping/breaking layout on mobile.
- [ ] Both STAFF and ADMIN roles have access to the `Overview` tab (currently `Staff` lands on `Inventory` but doesn't have an `Overview` link).

## 2. Overview Portal (`app/(admin)/staff/page.tsx`)
- [ ] The Overview page renders a "Live Inventory" card (visible to STAFF and ADMIN).
- [ ] The Overview page renders a "Runbook" card (visible to STAFF and ADMIN).
- [ ] The Overview page renders a "Reports" card (visible to ADMIN only).

## 3. Runbook Page
- [ ] `app/(admin)/staff/runbook/page.tsx` is created.
- [ ] It fetches or statically renders the internal documentation array (mirroring `DOC_ARTICLES` from the mockup).
- [ ] The page requires either STAFF or ADMIN role.
- [ ] It implements the dark-themed "Zero-Trust Staff Guide" design from the `ui-ref` mockup.

## 4. Reports Page
- [ ] `app/(admin)/staff/reports/page.tsx` is created.
- [ ] The page requires ADMIN role (enforced via `requireVendorRole("ADMIN")`).
- [ ] It executes a Prisma query to aggregate total orders and sum `totalPence` for the active vendor.
- [ ] It renders the three metric cards: "Total Revenue", "Total Orders", and "Average Basket Value" exactly as shown in the mockup.
