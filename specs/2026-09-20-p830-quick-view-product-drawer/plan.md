---
id: p830-quick-view-product-drawer
title: "P830 — Quick View Product Drawer (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-20
visibility: internal
summary: Replace product card drill-down navigation with an accessible right-side Quick View drawer containing complete product details, cart actions, and reviews.
tags: [storefront, products, quick-view, drawer, ui, accessibility]
---

# P830 — Quick View Product Drawer (plan)

## Goal

Provide shoppers with an immediate, seamless Quick View drawer directly from product cards on desktop and mobile without navigating away from browse, catalogue, or search results, while preserving complete product information, image gallery, variants/options, quantity stepper, add-to-cart, and full review interaction.

## Scope (this slice)

- **Quick View Context & Provider (`components/product/quick-view-context.tsx`)**:
  - Global drawer state (`isOpen`, `activeSlug`, `initialProduct`) allowing any product card to open the drawer.
  - Safe fallback when invoked outside the provider.
- **Quick View Drawer (`components/product/QuickViewDrawer.tsx`)**:
  - Right-side slide-out drawer with backdrop blur, focus trap, Escape key handling, and background scroll lock.
  - Interactive multi-image gallery with thumbnail selection and preview.
  - Header with product name, badge, brand, star rating summary, review count, and price / unit price.
  - Low stock warning banner and product description / net content / origin attributes.
  - Prominent quantity stepper and Add to Cart action (`variant="drawer"`).
  - Complete review interaction (viewing reviews list, verified customer badge, add new review with star rating, update existing review, and delete review with live refresh).
- **Quick View Data Endpoint (`app/api/products/quick-view/route.ts`)**:
  - GET `/api/products/quick-view?slug=<slug>` fetching product details, customer reviews, current user existing review, and CDN URL.
- **Product Card Updates (`components/product/ProductCard.tsx`)**:
  - Desktop: Smooth hover overlay revealing "Quick View" button (`group-hover:opacity-100 transition-opacity duration-300`).
  - Mobile/Touch: Always-visible compact Quick View button in the card corner (`sm:hidden`).
  - Removed stretched navigation link to `/products/[slug]`. Clicking title or Quick View buttons opens the drawer.
  - Retained direct inline Add-to-Cart button on the card.
- **Storefront Chrome Integration (`components/layout/StorefrontChrome.tsx`)**:
  - Wrapped storefront content in `QuickViewProvider` and mounted `QuickViewDrawer` within `brandStyle()`.
- **Automated Tests**:
  - Unit and integration tests covering the drawer, route handler, and updated product card.

## Deliberately Excluded

- **Removal of `/products/[slug]` Page**: The full product detail route remains fully functional and accessible for deep links, SEO, direct sharing, and sitemap crawling.
- **Drill-down link inside Drawer**: Removed "View full details" link per user specification so users complete their evaluation and cart addition entirely within the drawer.
- **Cart Drawer Refactor**: The existing cart slide-out drawer operates independently without schema changes.

## Open Items Carried Forward

- None for this slice.
