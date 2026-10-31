# Realistic 3D Icon Suite & Visual Standards (requirements / acceptance criteria)

Closes `#1280` (`feat(icons): realistic 3D rendered icon suite, high-res asset delivery for Icon3D, and icon standards documentation`).

## 1. High-Resolution Realistic 3D Icon Assets

R1. High-resolution, commercial-grade 3D rendered icon assets with seamless alpha transparency are placed under `public/images/icons-3d/<name>.png` (and WebP) for all primary navigation and commerce affordances:
    - `storefront`: Warm 3D supermarket store with awning, pastel shopping bags in front.
    - `quick-shop`: Metallic chrome shopping trolley with an energetic 3D lightning bolt.
    - `user-profile`: Glossy 3D avatar silhouette with vibrant purple-to-blue gradient sheen.
    - `rewards-coin` / `rewards-gift`: Gleaming gold trophy atop a red ribbon gift box with celebratory stars.
    - `cart-add`: Chrome supermarket shopping cart filled with fresh realistic groceries (lettuce, tomatoes, bread, bananas, apples).

R2. High-resolution matching 3D rendered assets are provisioned for all supporting trust and utility touchpoints:
    - `delivery-van`: 3D refrigerated grocery delivery van.
    - `halal-certified`: 3D golden HMC certified halal emblem/seal.
    - `secure-checkout`: 3D security shield with lock and card.
    - `order-updates`: 3D notification bell / message confirmation with checkmark.
    - `postcode-search`: 3D map location pin with delivery indicator.
    - `contact-follow`: 3D conversational chat bubble hub.

R3. Every icon asset is square (512x512 resolution or crisp downscalable equivalent), compressed to under 50KB, with soft drop shadows and clean edges on both light and dark backgrounds.

## 2. Icon3D Component Enhancement

R4. `components/icons/Icon3D.tsx` is enhanced to automatically detect and render the high-resolution realistic 3D image asset when available, while preserving existing props (`size`, `className`, `style`, `label`, `decorative`, `dataIcon`).

R5. `Icon3D` implements graceful zero-layout-shift fallback: if an image asset is not present or fails to load, it falls back seamlessly to the existing multi-layered inline SVG definition in `lib/icons-3d/catalog.ts`.

R6. Primary header icons (`storefront`, `quick-shop`, `user-profile`, `cart-add`) support eager loading (`loading="eager"` and `fetchPriority="high"` where appropriate) to avoid layout shift and LCP delays.

## 3. Storefront Integration Parity

R7. `components/layout/Header.tsx` renders the new realistic 3D icons for `Shop` (`storefront`), `Quick Shop` (`quick-shop`), and `Sign In` / `Account` (`user-profile`).

R8. `components/cart/CartDrawerShell.tsx` and `components/cart/CartContents.tsx` render the realistic `cart-add` icon for the trolley affordance and empty cart well.

R9. `components/rewards/RewardsLauncher.tsx` renders the celebratory trophy/gift icon for the floating rewards launcher button.

R10. `app/(landing)/page.tsx` renders the realistic 3D icons across the Trust Values strip (`delivery-van`, `secure-checkout`, `order-updates`) and the hero delivery badges.

R11. `components/layout/LocationControl.tsx` and `components/layout/FloatingContact.tsx` render the realistic 3D icons for `postcode-search` and `contact-follow`.

## 4. Documentation & Future Standards

R12. A comprehensive visual standards guide is documented in `docs/client-help-centre/icon-and-visual-asset-standards.md` establishing mandatory 3D studio aesthetics, lighting, transparent background requirements, file dimensions, and onboarding procedures for custom client icons.
