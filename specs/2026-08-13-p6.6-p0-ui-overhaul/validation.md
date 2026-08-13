# Phase 6.6 — P0 Core Shopping UI Overhaul (validation)

| Req | How to verify |
|-----|---------------|
| R1  | Render the homepage via `npm run preview` and visually verify the header layout matches the prototype. Verify logo dynamically uses `VendorConfig` via inspector. |
| R2  | Render the homepage via `npm run preview` and visually verify the hero banner and CTA. |
| R3  | Render the homepage via `npm run preview` and verify product merchandising rows (Best Sellers, New Arrivals, Deals) exist. |
| R4  | Render a product listing via `npm run preview` and verify the `ProductCard` UI flow matches the prototype. |
| R5  | Render the category section via `npm run preview` and verify visual cards/icons are used instead of text. |
| R6  | Run `npm run preview` on different hostnames or check code to ensure UI relies on tenant-specific assets, not hardcoded image paths. |
| R7  | Run `npm run sdd:preclear` to ensure `CHANGELOG.md` has a diff before merging. |
| R8  | Run `npm run typecheck`, `npm run lint`, and `npm run test` and verify they all exit 0. |
