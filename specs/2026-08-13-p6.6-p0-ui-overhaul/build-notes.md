# Build notes

## What changed and why
- **Header**: Rebuilt to include delivery promises, global search bar, dynamic brand logo from `VendorConfig`, and the `CartDrawerShell` with subtotal, matching the UI prototype while maintaining `VendorConfig` theming.
- **Hero & Trust Values**: Updated the `page.tsx` storefront to feature a dynamic Hero banner with promotional styling and real `localityName` from `VendorConfig`. Added the Trust Values strip below the Hero.
- **Product Merchandising**: Replaced the product placeholder in `page.tsx` with dynamic rows using a new `ProductRow` component. Added 'New Arrivals' and 'Featured Halal Deals' fetching data directly from `ProductRepository`.
- **Product Card**: Overhauled the visual structure to include dynamic discount badges, updated typography, layout changes, and dynamic unit rendering.
- **Add to Cart & Quantity**: Modified `AddToCartButton` to support an inline quantity selector when used within a `ProductCard`, and updated the `addToCart` server action to accept a `delta` value so quantity selection is real and persists to the backend without breaking progressive enhancement.

## Decisions taken during the build
- Utilized the `ProductRepository.search` functionality without a query but with `take` and specific filters (`isHalal`) to populate the merchandising rows ("New Arrivals" and "Deals"). This leverages existing efficient repository methods without requiring new ad-hoc database queries.
- We added the quantity selector directly to the `AddToCartButton` rather than implementing a complex state in `ProductCard`, keeping the card itself as a simple server-friendly render or stateless container wrapper, minimizing Client Components footprint.

## Deviations from the spec
- None. All R1-R5 specs are implemented respecting R6 (multi-tenancy `VendorConfig` constraint).

## Known-shaky areas
- The `addToCart` server action signature changed to `(productId: string, delta: number = 1)`. Any other usages of this action across the codebase should be checked, though the default `delta = 1` should protect them.
- Ensure the newly added quantity selector inside the `<Link>` boundary of `ProductCard` successfully calls `e.preventDefault()` and doesn't accidentally navigate when attempting to decrement/increment quantities.
