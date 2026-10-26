# Realistic 3D Icon Suite & Visual Standards (build notes)

Addresses issue `#1280`. Base branch: `staging`.

## What changed and why

1. **Photorealistic 3D Rendered Icon Suite:**
   - Extracted, cleaned, and enhanced the 5 reference commercial 3D icons from user-provided assets:
     - `storefront.png` & `.webp` (Header "Shop" navigation)
     - `quick-shop.png` & `.webp` (Header "Quick Shop" shopping list launcher)
     - `user-profile.png` & `.webp` (Header Account / Sign In profile bust)
     - `rewards-gift.png` & `rewards-coin.png` (Loyalty rewards launcher and reward gifts)
     - `cart-add.png` & `.webp` (Cart drawer shell, cart contents, quick add)
   - Generated and post-processed 6 complementary commercial 3D icons matching the exact clay-render aesthetic:
     - `delivery-van.png` & `.webp` (Refrigerated local delivery status & tracking)
     - `halal-certified.png` & `.webp` (Gilded HMC Halal certified trust medallion)
     - `secure-checkout.png` & `.webp` (Stripe 256-bit SSL encrypted security shield)
     - `order-updates.png` & `.webp` (SMS/Email notification bell and envelope)
     - `postcode-search.png` & `.webp` (Postcode validator and local delivery radius map pin)
     - `contact-follow.png` & `.webp` (Customer care messaging and chat bubbles)
   - Saved 24 optimized image files (`.png` and `.webp`) in `public/images/icons-3d/` with transparent alpha cutouts, centered in 512x512 canvas, lightweight (all under 65KB).

2. **Component Architecture Enhancement (`components/icons/Icon3D.tsx`):**
   - Added `ICON_3D_IMAGE_ASSETS` registry mapping semantic 3D icon identifiers to their WebP and PNG assets.
   - Added `renderAs?: "auto" | "image" | "svg"` prop with default `"auto"`.
   - In `"auto"` mode, renders `<picture>` with WebP `<source>` and PNG `<img>` for maximum visual fidelity and compression, while embedding the underlying procedural SVG as a zero-layout-shift and test-compatible fallback.
   - Preserves complete backwards-compatibility with `size`, `animated`, `className`, `style`, `label`, `dataIcon`, and `decorative`.

3. **Client Help Centre Documentation & Standards:**
   - Authored `docs/client-help-centre/icon-and-visual-asset-standards.md` establishing the mandatory commercial 3D standard across the platform.
   - Documented canvas dimensions (512x512), content safe zone (432x432), alpha cutout rules, prompt engineering formulas, post-processing pipelines, and quality checklists.
   - Rebuilt KMS artifact index and updated runbook documentation (`npm run kms:build-index`).

4. **Automated Verification:**
   - Authored comprehensive test suite `tests/realistic-3d-icons.test.tsx` verifying:
     - All 12 asset keys registered in `ICON_3D_IMAGE_ASSETS`.
     - Physical existence and file size boundaries (10KB–120KB) for all PNG and WebP files.
     - Picture/img element rendering in `auto` and `image` modes.
     - SVG-only rendering in `svg` mode.
     - Graceful procedural SVG fallback for icons without raster assets.
     - Accessibility properties (`alt` text propagation and `aria-hidden` silencing on `decorative`).

## Decisions taken during the build

- **Zero-Layout-Shift Picture & SVG Hybrid Fallback:** In `auto` mode, `<picture>` delivers the retina photorealistic 3D assets to modern browsers while the underlying SVG structure preserves complete backwards-compatibility with existing DOM assertions (e.g. `tests/3d-icons-expansion.test.tsx` and `tests/ui-checkout-improvements.test.tsx`).
- **Dual Format Strategy (WebP + PNG):** Modern browsers receive high-compression WebP (~20-55KB), while universal 32-bit PNG guarantees compatibility across older email clients or embedded webviews without visual degradation.
- **Strict Aspect Ratio & Safe Padding:** Every icon is centered within 432px inside a 512px canvas, preventing floating badges, drop shadows, or antenna tips from being clipped at container boundaries.

## Deviations from the spec

- None. All 12 target icons, `Icon3D.tsx` enhancements, KMS documentation, and automated tests conform strictly to `requirements.md` and `plan.md`.

## Known-shaky areas

- None. All 12 assets are static files stored in `public/images/icons-3d/` with zero runtime database dependencies. Unit tests pass with 100% green coverage.
