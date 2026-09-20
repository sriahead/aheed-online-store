---
id: p832-quick-view-image-carousel
title: "P832 — Quick View Product Image Carousel (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-20
visibility: internal
summary: Upgrade the Quick View product drawer image display to an accessible single-image horizontal carousel with arrow controls, swipe gestures, and pagination dots.
tags: [storefront, products, quick-view, image-carousel, mobile, accessibility]
related: [p830-quick-view-product-drawer]
---

# P832 — Quick View Product Image Carousel (plan)

## Goal

Enhance the Quick View product drawer image presentation so that multiple product images are presented in a compact, single-image horizontal carousel with smooth sliding transitions, touch swipe gestures, accessible arrow controls, and pagination indicators, preventing vertical stacking and keeping the drawer compact and focused on quick shopping.

## Scope (this slice)

- **Product Image Gallery Component (`components/product/ProductImageGallery.tsx`)**:
  - Add client-side interactive carousel mode (`variant="carousel"`) displaying a single main product image at a time in a consistent aspect-square container.
  - Implement smooth horizontal sliding transitions between images using CSS transforms (`transition-transform duration-300 motion-reduce:transition-none`).
  - Add accessible left and right arrow controls overlaying the image when multiple images exist (`images.length > 1`).
  - Implement touch swipe gesture support for mobile devices (`onTouchStart`, `onTouchEnd`).
  - Add compact pagination indicators combining clickable dots and a "1 / N" counter.
  - Hide all navigation controls and indicators when only a single image is present (`images.length <= 1`).
  - Support accessible keyboard navigation (ArrowLeft and ArrowRight).
  - Preserve backward-compatible default (`variant="stacked"`) for the full product page layout.
- **Quick View Drawer Integration (`components/product/QuickViewDrawer.tsx`)**:
  - Render `ProductImageGallery` with `variant="carousel"` to ensure the drawer remains compact without excessive vertical scrolling.
- **Automated Tests**:
  - Unit tests covering single-image and multi-image carousel rendering, arrow navigation, swipe gestures, pagination indicators, keyboard navigation, and absence of controls on single-image products.

## Deliberately Excluded

- **Changes to image storage, schema, or CDN URLs**: Existing image models and storage keys remain identical.
- **Full Product Detail Page layout changes**: `app/(storefront)/products/[slug]/page.tsx` retains its existing layout.

## Open Items Carried Forward

- None for this slice.
