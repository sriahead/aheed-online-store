| Req | How to verify |
|---|---|
| R1 | Check that the `TierToggle` component renders in the UI and sets the `admin-tier` cookie correctly. |
| R2 | Check that `PanelNav` renders only the Staff tab when in staff tier. |
| R3 | Navigate to `/staff/inventory` as an unauthenticated user and ensure it redirects or blocks access. |
| R4 | Ensure the inventory table columns are correct. |
| R5 | Type a query in the search box and verify the URL updates with `?q=...` and products are filtered. |
| R6 | Click `+` and `-` on a product and ensure the value changes instantly. |
| R7 | Click the availability toggle and ensure the status changes instantly. |
| R8 | Verify via database query that the changes made via UI persisted correctly. |
