---
id: icon-and-visual-asset-standards
title: "Icon & Visual Asset Standards Guide"
audience: [store-admin, platform-admin, staff, dev]
type: guide
status: approved
version: "1.0.0"
updated: 2026-10-26
visibility: internal
summary: "Technical specifications, commercial 3D rendering guidelines, lighting models, alpha transparency cutouts, and client onboarding requirements for store icons and UI visual assets."
tags: [icons, 3d-icons, design-system, visual-assets, standards, onboarding, store-admin]
related: [category-image-standards, getting-started-onboarding, products-catalogue-guide]
---

# Icon & Visual Asset Standards Guide

This guide establishes the mandatory visual standards, 3D rendering guidelines, file specifications, and provisioning workflows for UI icons and visual assets across all platform storefronts.

To align with premium retail grocery benchmarks and high-conversion mobile e-commerce experiences, the platform uses **photorealistic, commercial 3D rendered studio icons**. Flat vector silhouettes, low-resolution mockups, generic emoji symbols, and unpolished clip art are strictly prohibited across customer-facing surfaces.

---

## 1. Core Visual Principles

All platform icons must conform to a unified commercial 3D aesthetic:

1. **Clay-Smooth & Tactile Materials:** Surfaces should feel physical, premium, and friendly. Blend glossy specular highlights with smooth clay/matte plastic finishes. Metallic elements (gold, silver, chrome) should exhibit realistic reflections.
2. **Studio Ambient Lighting:** Lighting must be warm and consistent across the icon set, coming from the top-left at approximately 45 degrees, casting subtle, soft ambient contact shadows directly beneath the subject.
3. **True Alpha Transparency:** Every icon asset must be isolated on a 100% transparent background with feathered edge antialiasing. Opaque white boxes or jagged bounding rectangles are rejected by QA.
4. **Consistent Projection:** Primary objects use a 45-degree isometric or gently tilted 3D frontal perspective that conveys volume and depth without extreme fish-eye distortion.
5. **Vibrant Retail Palette:** Colors should feel appetizing, cheerful, and commercial—vivid emerald greens, rich golden ambers, electric cyan/blues, and cheerful coral tones.

---

## 2. Technical Asset Specifications

Every icon added to the platform asset registry must strictly adhere to the following file standards:

| Specification | Requirement | Justification |
| :--- | :--- | :--- |
| **Canvas Dimensions** | **512 × 512 pixels** square | Provides retina crispness across all screen densities (1x, 2x, 3x) without layout shift. |
| **Content Safe Zone** | Centered within **432 × 432 pixels** (~40px optical padding) | Ensures drop shadows and floating flourishes are not clipped at container boundaries. |
| **File Formats** | Dual **WebP** (`.webp`) + **PNG** (`.png`) | Modern browsers load lightweight WebP first; transparent 32-bit PNG provides universal fallback. |
| **Transparency** | Full 8-bit alpha channel (`RGBA`) | Eliminates white square box artifacts across light, dark, and brand-tinted surfaces. |
| **Target File Size** | **30 KB – 65 KB** (Maximum: 80 KB) | Guarantees instant sub-50ms downloads even on 3G/4G mobile networks. |
| **Storage Directory** | `public/images/icons-3d/<name>.png` & `<name>.webp` | Served directly from edge cache with immutable browser caching. |

---

## 3. Active 3D Icon Suite & Mappings

The table below documents the core 12 commercial 3D icons currently active across the platform:

| Icon ID | Purpose / Surface | Visual Motif & Elements |
| :--- | :--- | :--- |
| `storefront` | Header Main Nav ("Shop") | Pastel boutique store with striped blue/white awning and vibrant shopping bags. |
| `quick-shop` | Header Quick Shop button | Chrome grocery shopping cart with an electric 3D lightning bolt bursting forward. |
| `user-profile` | Header Account / Sign In | Glossy magenta-purple gradient avatar bust with studio specular highlights. |
| `rewards-gift` | Loyalty Rewards modal & prizes | Vibrant red gift box with golden silk ribbon, gilded trophy, and festive stars. |
| `rewards-coin` | Rewards floating launcher pill | Golden loyalty medallion / trophy gift cluster (aliased to `rewards-gift`). |
| `cart-add` | Cart Drawer shell & trigger | Supermarket wire trolley filled with fresh vegetables, bread, and milk cartons. |
| `delivery-van` | Delivery status & checkout tracking | Compact white grocery delivery van with emerald green trim and cooling unit. |
| `halal-certified` | HMC Halal trust banner & badges | Gilded embossed trust medallion with emerald green sash and star relief. |
| `secure-checkout` | Stripe 256-bit SSL trust badge | Emerald green security shield with polished chrome rim, golden padlock, and card chip. |
| `order-updates` | SMS / Email order tracking alerts | Glossy golden notification bell tilted with teal message envelope and red ping dot. |
| `postcode-search` | Delivery radius & address finder | Glossy red and chrome map pin standing on a miniature isometric street grid. |
| `contact-follow` | Floating customer care hub | Overlapping glossy 3D chat speech bubbles in royal blue and cheerful cyan. |

---

## 4. Component Implementation (`<Icon3D>`)

Storefront pages consume 3D icons via the standard `<Icon3D />` component (`components/icons/Icon3D.tsx`):

```tsx
import { Icon3D } from "@/components/icons/Icon3D";

// 1. Standard navigation link (auto mode: serves high-res WebP/PNG with instant SVG fallback)
<Icon3D name="storefront" size={24} />

// 2. Animated Quick Shop button with accessible label
<Icon3D name="quick-shop" size={20} animated dataIcon="quick-shop" decorative />

// 3. Trust badge with custom label
<Icon3D name="halal-certified" size={32} label="HMC Certified Halal Guarantee" />

// 4. Explicit SVG-only vector mode (used for minimal print or zero-image embeds)
<Icon3D name="secure-checkout" size={24} renderAs="svg" />
```

### Component Props:
- `name`: Semantic icon identifier (e.g. `'storefront'`, `'cart-add'`).
- `size`: Display width/height in CSS pixels (default: `48`).
- `renderAs`: `'auto'` (default), `'image'`, or `'svg'`.
- `decorative`: When `true`, sets `aria-hidden="true"` and suppresses inner title tags for screen-reader compliance beside visible button copy.
- `animated`: Enables subtle floating or popping CSS keyframe animations.

---

## 5. Guidelines for Future Icons & New Client Onboarding

When creating new icons for future platform features, seasonal campaigns, or onboarding a new multi-tenant merchant:

### 5.1 Prompt Engineering Standard
When generating or commissioning 3D icons, use the following standardized prompt formula:
> *"3D rendered commercial app icon of [SUBJECT], isolated on a pure white background (#ffffff). Clay-smooth tactile plastic and metallic materials, glossy specular highlights, studio ambient lighting with soft contact shadow directly underneath, isometric 45-degree angle. High detail, vibrant retail colors, zero text, zero watermarks, zero background clutter."*

### 5.2 Post-Processing Workflow
1. Place raw render in scratch directory.
2. Run `scripts/process-all-icons.js` (or equivalent Sharp pipeline) to:
   - Identify non-white subject bounds.
   - Feather-cutout background into true alpha transparency.
   - Resize and center within a 512 × 512 canvas with ~40px content padding.
   - Emit both `.png` (effort 7) and `.webp` (quality 92) into `public/images/icons-3d/`.
3. Register the new asset key in `ICON_3D_IMAGE_ASSETS` in `components/icons/Icon3D.tsx`.
4. Ensure procedural SVG fallback exists in `lib/icons-3d/catalog.ts`.
5. Run unit tests (`npx vitest run tests/realistic-3d-icons.test.tsx`) to verify bounds and formats.

---

## 6. Visual Quality Checklist

Before submitting an icon asset for production review, verify:

- [ ] **Transparency:** Asset displays cleanly over both white (`#ffffff`) and dark (`#0f172a`) backgrounds without a white fringe, halo, or opaque box.
- [ ] **Scale & Padding:** Content fits within the 432px inner circle; nothing touches the 512px canvas perimeter.
- [ ] **Sharpness:** Crisp when displayed at 16px, 20px, 24px, 32px, and 48px without pixelation or muddy blur.
- [ ] **Lighting Alignment:** Key light originates from the top-left; contact shadow sits under the bottom base.
- [ ] **Format Delivery:** Both `.png` and `.webp` files exist and are under 80 KB.
