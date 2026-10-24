# Expand 3D icon suite across Shop, Quick Shop, Contact and Follow, and Department navigation (validation)

Issue `#1248`.

| Requirement | Test / Verification Method | Expected Outcome | Status |
|---|---|---|---|
| R1 (New 3D Icons in Catalog) | `tests/3d-icons-expansion.test.tsx` checking `ICON_3D_DEFINITIONS` | `storefront`, `quick-shop`, and `contact-follow` defined with valid SVG renderers | Passed |
| R2 (API Endpoint Delivery) | `tests/3d-icons-expansion.test.tsx` probing `GET /api/icons` & `GET /api/icons/[id]` | Total icons = 19; SVGs return valid XML with Content-Type `image/svg+xml` | Passed |
| R3 (Shop Header Link) | `tests/3d-icons-expansion.test.tsx` rendering `Header` navigation | Link to `/categories` contains 3D storefront SVG and accessible text "Shop" | Passed |
| R4 (Quick Shop Header Link) | `tests/3d-icons-expansion.test.tsx` rendering `ShoppingListLink` | Link to `/quick-shop` contains 3D quick-shop SVG and accessible text "Quick Shop" | Passed |
| R5 (Contact & Follow Button) | `tests/3d-icons-expansion.test.tsx` rendering `FloatingContact` | Trigger button contains 3D contact-follow SVG when closed | Passed |
| R6 (Department 3D Navigation) | `tests/3d-icons-expansion.test.tsx` rendering `DepartmentScroller` | Mapped departments render 3D icons | Passed |
| R7 (Rewards Launcher) | `tests/3d-icons-expansion.test.tsx` rendering `RewardsLauncher` | Launcher contains 3D rewards-coin SVG | Passed |
| R8 (Quality Gates) | `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4` | All pass clean with zero errors | Passed |
