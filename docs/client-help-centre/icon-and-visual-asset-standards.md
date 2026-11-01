---
id: icon-and-visual-asset-standards
title: "Icon & Visual Asset Standards Guide"
audience: [store-admin, platform-admin, staff, dev]
type: guide
status: approved
version: "1.2.0"
updated: 2026-10-27
visibility: internal
summary: "Technical specifications, photorealistic 3D rendering guidelines, lighting models, alpha transparency cutouts, dedicated icon gallery, and client onboarding requirements for store icons and UI visual assets."
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
| `view-shopper` | Role Switcher (Shopper View) | Craft paper grocery shopping bag brimming with fresh vegetables and daily essentials. |
| `view-staff` | Role Switcher (Staff View) | Modern supermarket cashier POS checkout terminal with scanner and receipt printer. |
| `view-admin` | Role Switcher (Admin View) | Polished platinum security badge with administrative crest and golden master key. |

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

---

## Replaceable icon inventory

Issue `#1288`. Every icon below can be replaced for **your store only** with an AI-generated image from
**Staff → Visual Asset Gallery** (`/staff/icons`): pick the slot under "3D icons" or "Flat icons",
generate a candidate, then **Activate** it. **Deactivate** switches it off again and the built-in artwork
returns. Each generation is one metered AI image; there is no bulk generation.

Whatever fills it, every icon and category image is shown inside the same **circular medallion** on your
store's tint, and AI images are generated on a plain white background that the medallion blends into that
tint. Because the medallion crops to a circle, keep the subject in the middle 70 % of the image. (This
differs from the transparent cut-outs in §2, which are the built-in 3D files.)

A flat icon override appears only where the icon is drawn at **32 px or larger**. Smaller uses (inside
buttons, lists and text) always keep the built-in glyph, so they stay crisp and do not change shape.
Controls such as arrows, close and plus, and the rating stars, cannot be replaced. Product photographs
are never shown in a circle.

The table lists every slot (the source of truth is `lib/icon-slots.ts`; a test keeps this table in step).

| Slot | Kind | Where it appears |
| :--- | :--- | :--- |
| `delivery-van` | 3D icon | Landing trust strip; Landing feature card: local delivery |
| `storefront` | 3D icon | Header: Shop link; Help Centre: Click & Collect |
| `quick-shop` | 3D icon | Header: Quick Shop link |
| `user-profile` | 3D icon | Header: Sign in / Account |
| `cart-floating` | 3D icon | Header cart button; Cart drawer heading; Empty cart |
| `secure-checkout` | 3D icon | Checkout page heading; Landing feature card: secure checkout; Help Centre: Platform Admin journey |
| `order-updates` | 3D icon | Landing feature card: order updates |
| `view-shopper` | 3D icon | Header role switcher; Help Centre: Shopper journey |
| `view-staff` | 3D icon | Header role switcher; Help Centre: Staff journey |
| `view-admin` | 3D icon | Header role switcher; Help Centre: Store Admin journey |
| `rewards-coin` | 3D icon | Floating rewards launcher; Help Centre: Loyalty Points |
| `halal-certified` | 3D icon | Landing trust strip |
| `postcode-search` | 3D icon | Delivery location dialog; Help Centre: Delivery & Minimums |
| `contact-follow` | 3D icon | Floating contact button |
| `rewards-gift` | 3D icon | Third-party credits page |
| `fruit-veg` | Department (3D) | Managed per category: generate or deactivate it on the category's page |
| `halal-meat` | Department (3D) | Managed per category: generate or deactivate it on the category's page |
| `bakery` | Department (3D) | Managed per category: generate or deactivate it on the category's page |
| `dairy-eggs` | Department (3D) | Managed per category: generate or deactivate it on the category's page |
| `beverages` | Department (3D) | Managed per category: generate or deactivate it on the category's page |
| `snacks` | Department (3D) | Managed per category: generate or deactivate it on the category's page |
| `frozen-foods` | Department (3D) | Managed per category: generate or deactivate it on the category's page |
| `household` | Department (3D) | Managed per category: generate or deactivate it on the category's page |
| `icon:apple` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:badge-check` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:banknote` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:beef` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:bell-ring` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:book-a` | Flat icon | Staff search-synonyms empty state |
| `icon:book-open` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:bookmark` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:boxes` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:bug` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:calendar-clock` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:circle-alert` | Flat icon | Cancel-order page heading |
| `icon:circle-check` | Flat icon | Order confirmed heading; stock import success |
| `icon:circle-question-mark` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:circle-user-round` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:circle-x` | Flat icon | Order cancelled heading |
| `icon:clipboard-list` | Flat icon | Staff orders empty state |
| `icon:clock` | Flat icon | Order awaiting payment heading |
| `icon:coffee` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:coins` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:contact` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:cookie` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:credit-card` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:croissant` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:featured-star` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:folder-tree` | Flat icon | Staff categories empty state; asset gallery and category manager placeholders |
| `icon:gauge` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:gift` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:globe` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:heart` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:heart-outline` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:house` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:image-up` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:layers` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:layout-dashboard` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:list-checks` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:lock` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:mail` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:map-pin` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:megaphone` | Flat icon | Staff promotions empty state |
| `icon:message-circle` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:message-square-quote` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:messages-square` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:milk` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:navigation` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:package` | Flat icon | Empty states: staff bundles, staff products, account orders; bundle card placeholder |
| `icon:package-open` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:package-x` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:pencil` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:percent` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:phone` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:ruler` | Flat icon | Staff net-content empty state |
| `icon:shield` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:shield-alert` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:shield-check` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:shopping-bag` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:shopping-cart` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:sparkles` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:store` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:tag` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:ticket-percent` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:timer` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:trash` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:trending-up` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:triangle-alert` | Flat icon | Error page; quick-view load error |
| `icon:truck` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:upload` | Flat icon | Staff stock-file importer |
| `icon:user` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:user-check` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:user-plus` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:user-x` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:users` | Flat icon | Staff customers empty state |
| `icon:rewards-bag` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:rewards-coins` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:rewards-discount` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:rewards-gift` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:rewards-invite` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:rewards-sparkles` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:trust-delivery` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:trust-payment` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
| `icon:trust-updates` | Flat icon | Inline only (below 32 px) today, so an override is stored but not shown until the icon is used at 32 px or more |
