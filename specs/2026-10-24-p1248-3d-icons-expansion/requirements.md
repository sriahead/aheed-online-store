# Expand 3D icon suite across Shop, Quick Shop, Contact and Follow, and Department navigation (requirements)

Issue `#1248`.

## Functional Requirements

- **R1 (New 3D Icon Definitions):** Add `storefront`, `quick-shop`, and `contact-follow` to `lib/icons-3d/catalog.ts` conforming to `Icon3DDefinition`. Each provides multi-layer SVG artwork with layered gradients, drop shadow filters, specular highlights, and vendor brand theming support.
- **R2 (Production API Reflection):** `GET /api/icons` automatically lists the new icons, bringing the total registered catalog from 16 to 19. `GET /api/icons/[id]` serves dynamic SVGs for `storefront`, `quick-shop`, and `contact-follow`.
- **R3 (Shop Header Link):** The desktop and mobile header Shop button (`components/layout/Header.tsx`) renders `<Icon3D name="storefront" size={20} />` while maintaining accessible name "Shop" and navigation to `/categories`.
- **R4 (Quick Shop Header Link):** The Quick Shop button (`components/layout/ShoppingListLink.tsx`) renders `<Icon3D name="quick-shop" size={20} />` while maintaining accessible name "Quick Shop" and link to `/quick-shop`.
- **R5 (Contact and Follow Floating Button):** The floating contact cluster trigger (`components/layout/FloatingContact.tsx`) renders `<Icon3D name="contact-follow" size={28} />` when closed and `<Icon name="x" />` when open, preserving accessibility attributes and title.
- **R6 (Department 3D Illustrations):** In `components/layout/DepartmentScroller.tsx` and `components/layout/DepartmentGlyph.tsx`, departments with 3D definitions (`fruit-veg`, `bakery`, `dairy-eggs`, `halal-meat`, `beverages`, `snacks`, `frozen-foods`, `household`, `groceries`) render theme-aware 3D vector icons instead of flat 2D icons.
- **R7 (Rewards Launcher):** In `components/rewards/RewardsLauncher.tsx`, the floating rewards pill / button renders `<Icon3D name="rewards-coin" size={20} />`.
- **R8 (Accessibility & Touch Targets):** All controls maintain min-h-tap / min-w-tap touch target guidelines and accessible labels. Reduced motion queries silence animations automatically.
- **R9 (Test Parity):** Automated tests verify the new icons, API responses, and surface rendering without breaking existing tests.
