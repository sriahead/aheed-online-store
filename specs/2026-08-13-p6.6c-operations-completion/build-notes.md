# Build Notes: P6.6c - Staff/Admin Operations Views Completion

## What changed and why

- `components/staff/PanelNav.tsx`: Refactored to fix a React "Cannot create components during render" warning. Extracted `NavLink` out of the render body. Added missing links (Reports, Inventory, Categories, Discounts, etc.) and wrapped in `overflow-x-auto` to allow mobile scrolling without clipping.
- `app/(admin)/staff/page.tsx`: Injected missing dashboard portal cards for "Live Inventory", "Runbook", and "Reports" (Admin only).
- `app/(admin)/staff/runbook/page.tsx`: Created a zero-trust Operations Runbook based on `docs/ui-ref/src/data/docs.ts`.
- `app/(admin)/staff/reports/page.tsx`: Created the Admin-only financial metrics dashboard, displaying total revenue, orders, and average basket value. 
- `lib/repositories/orders.ts`: Extended with `getFinancialsForStaff()` that aggregates order data (summing `totalPence`) using Prisma, which powers the Reports page.

## Decisions taken during the build

- In `app/(admin)/staff/reports/page.tsx`, we decided to compute `avgBasketPence` in the server component by checking `totalOrders > 0` to prevent division by zero errors, rather than returning it directly from the database query.
- Inlined the `formatMoney` function in `reports/page.tsx` since a globally exported formatter wasn't found in `lib/`.
- Kept the `PanelNav` static, moving the `NavLink` component definition to the outer scope to fix a lint error, keeping code clean.

## Deviations from the spec

None.

## Known-shaky areas

- The local database might not have enough dummy data to make the Reports page look exciting right away, but the Prisma query is solid and matches standard behavior.
