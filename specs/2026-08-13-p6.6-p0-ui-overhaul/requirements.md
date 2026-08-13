# Phase 6.6 — P0 Core Shopping UI Overhaul (requirements)

This phase addresses the most critical UI/UX gaps against the high-fidelity AI Studio prototype (`docs/ui-ref`), dramatically improving merchandising and user navigation while respecting multi-tenancy requirements.

R1. The `Header` component includes a logo (from `VendorConfig`), location/delivery indicator, search bar, account link, wishlist link, and cart toggle.
R2. A `Hero` component exists on the storefront homepage with a promotional banner and "Shop Now" CTA.
R3. The storefront homepage includes dedicated product merchandising rows (e.g., Best Sellers, Deals, New Arrivals).
R4. The `ProductCard` component implements the visual flow: Image → Name → Pack Size → Price → Offer → Qty Selector → Add to Cart.
R5. Category navigation on the storefront uses visual category cards or icons rather than plain text links.
R6. All updated UI components dynamically respect the active tenant's `VendorConfig` and theme settings (multi-tenancy constraint) rather than hardcoded global assets.
R7. `CHANGELOG.md` updated (Gate 4).
R8. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
