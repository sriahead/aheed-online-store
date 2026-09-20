# P830 — Quick View Product Drawer (requirements / acceptance criteria)

This slice replaces the product card drill-down navigation with a seamless Quick View drawer across desktop and mobile, displaying comprehensive product details, cart actions, and reviews while retaining full `/products/[slug]` page route functionality for direct navigation.

R1. On desktop (`sm:` and above), hovering over a `ProductCard` reveals a "Quick View" button/overlay with a smooth, subtle transition (`group-hover:opacity-100 transition-opacity duration-300`).

R2. On mobile / touch viewports (`< 640px`), `ProductCard` displays an always-visible compact "Quick View" button/icon in the upper corner of the card.

R3. Product cards do not contain a stretched link navigating to `/products/[slug]`. Clicking "Quick View" or the product card title opens the Quick View drawer with the selected product without navigating away from the current page.

R4. Clicking "Quick View" opens a right-side slide-out drawer (`QuickViewDrawer`) with a darkened blurred backdrop, focus trapping, Escape key dismiss, close button, and background scroll locking.

R5. The Quick View drawer displays all existing product functionality and information:
- Product image gallery with multi-image thumbnail selection and full preview
- Product name, brand name, and promotional badge
- Star rating score and total review count
- Price, sale price (with strikethrough original price), and unit price calculation
- Stock availability and low stock warning alert when inventory is below threshold
- Net content, country of origin, and markdown product description

R6. The Quick View drawer includes a quantity stepper and "Add to Cart" button (`AddToCartButton` with `variant="drawer"`), interacting with the global cart state and opening the cart drawer upon addition.

R7. The Quick View drawer displays the full existing review functionality:
- List of customer reviews with star ratings, comments, author names, and verified purchaser badges
- Review submission form allowing authenticated customers to submit a rating and comment
- Form allows updating an existing review or deleting it, with immediate local state refresh in the drawer

R8. The Quick View drawer removes any "View full details" drill-down link so shoppers complete their evaluation within the drawer.

R9. An API route `GET /api/products/quick-view?slug=<slug>` provides complete product data, approved reviews, existing review for the current session user, and CDN base URL.

R10. `CHANGELOG.md` updated with an entry for `#830` under Post-launch improvements / Storefront (Gate 4).

R11. `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npx vitest run` all exit 0 with zero errors (Gate 3).
