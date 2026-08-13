1. The `TierToggle` component must allow switching between `admin-tier` cookie states (staff vs admin).
2. The `PanelNav` component must display only the "Live Inventory & Availability" tab when in the staff tier.
3. The `/staff/inventory` route must require `STAFF` or `ADMIN` roles.
4. The table must list products, category, price, stock count, and live availability.
5. Search input must filter the product list by name/description using `q` search param.
6. The `+` and `-` buttons must immediately update the UI optimistically and trigger a server action to update the database.
7. The availability toggle must immediately update the UI optimistically and trigger a server action.
8. The server action must use `quickUpdateInventory` to perform an atomic upsert on the `Inventory` table and update the `isActive` flag on the `Product`.
