---
id: realistic-3d-icons-plan
title: "Realistic 3D rendered icon suite, high-res asset delivery for Icon3D, and icon standards documentation (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-10-26
visibility: internal
summary: Deliver commercial-grade realistic 3D rendered icons matching the user reference, enhance Icon3D with image asset support and inline SVG fallback, upgrade navigation and trust touchpoints, and establish KMS icon standards.
tags: [spec, icons, 3d-icons, visual-design, storefront, navigation]
---

# Engineering Plan: Realistic 3D Icon Suite & Visual Standards

**Tracking issue:** `#1280`  
**Slice:** `specs/2026-10-26-realistic-3d-icons/`  
**Base branch:** `staging`  
**Feature branch:** `feature/realistic-3d-icons`

---

## 1. Context & Motivation

Following the upgrade of category browsing to realistic commercial product photography (issue `#1278`), the storefront's key navigation affordances (`Shop`, `Quick Shop`, `Sign In`/`Account`, `Cart`, `Rewards`) and trust touchpoints (`delivery-van`, `halal-certified`, `secure-checkout`, `order-updates`, `postcode-search`, `contact-follow`) still utilized programmatic vector approximations.

The user provided a visual reference showing commercial-grade 3D rendered icons with tactile textures, rich gradients, and vibrant lighting:
- Miniature storefront with striped awning and shopping bags
- Dynamic shopping trolley with glowing energy lightning bolt
- Glossy gradient purple/blue human avatar
- Gilded trophy on a red satin ribbon gift box with stars
- Supermarket wire trolley filled with realistic fresh groceries

This slice implements these realistic 3D assets, enhances `Icon3D` to deliver them with high DPI and SVG fallback, and documents the standard for future icons.

---

## 2. Technical Approach

### 2.1 Asset Extraction & Optimization
- Extract the 5 primary icons from the reference image (`storefront`, `quick-shop`, `user-profile`, `rewards-gift`/`rewards-coin`, `cart-add`).
- Process with transparent alpha backgrounds, crisp anti-aliased outlines, and consistent 512x512 resolution under `public/images/icons-3d/`.
- Generate the complementary set of 6 supporting 3D icons (`delivery-van`, `halal-certified`, `secure-checkout`, `order-updates`, `postcode-search`, `contact-follow`) in the identical 3D studio render style.
- Optimize all assets to WebP/PNG (<50KB per icon) to ensure zero impact on initial page load times.

### 2.2 Component Architecture (`Icon3D.tsx`)
- Keep `Icon3DName` as the single source of truth.
- Introduce an asset-resolution map `ICON_3D_IMAGE_ASSETS: Partial<Record<Icon3DName, string>>`.
- When an image asset is configured, `Icon3D` renders an `<img>` tag with appropriate `width`, `height`, and `decoding="async"`.
- If an image asset is absent or fails to load, `Icon3D` gracefully renders the inline SVG from `renderIconSvg`.
- Ensure `prefers-reduced-motion` and accessibility attributes (`aria-hidden="true"` when decorative, `role="img"` with accessible label when non-decorative) are strictly preserved.

### 2.3 Storefront Surfaces
- **Header:** `Shop` (`storefront`), `Quick Shop` (`quick-shop`), `Sign In` / `Account` (`user-profile`).
- **Cart:** Floating drawer trigger and empty state in `CartDrawerShell` & `CartContents` (`cart-add`).
- **Rewards:** Floating launcher button in `RewardsLauncher` (`rewards-coin`).
- **Trust Strip & Hero:** `delivery-van`, `halal-certified`, `secure-checkout`, `order-updates`.
- **Modals:** Location intent in `LocationControl` (`postcode-search`) and `FloatingContact` (`contact-follow`).

### 2.4 Documentation & Governance
- Create `docs/client-help-centre/icon-and-visual-asset-standards.md` establishing the mandatory 3D icon criteria for platform and store operators.
- Register document in KMS manifest and index.
