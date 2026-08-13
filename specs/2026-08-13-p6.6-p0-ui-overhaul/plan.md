---
id: 2026-08-13-p6.6-p0-ui-overhaul
title: "Phase 6.6 — P0 Core Shopping UI Overhaul (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-13
visibility: internal
summary: Overhaul the core shopping UI components (Header, Hero, Product Cards, Categories) to match the AI Studio prototype while preserving multi-tenancy.
tags: [ui, phase-6.6, storefront]
# related: [ui-ref]
---

# Phase 6.6 — P0 Core Shopping UI Overhaul (plan)

This phase pauses the production launch (Phase 8) to close critical UI gaps identified against the AI Studio prototype (`docs/ui-ref`). The storefront's current state lacks strong e-commerce merchandising, trust signals, and clear navigation.

**Goal:** Transform the core shopping experience (Header, Hero, Product Discovery, Product Cards, and Category Navigation) to match the high-fidelity AI Studio prototype without breaking the underlying multi-tenancy architecture.

**Scope (this slice):**
- **Header:** Implement a proper e-commerce header with logo, location/delivery indicator, search bar, account, wishlist, and cart toggles. Must dynamically pull the vendor's logo and theme.
- **Hero:** Add a promotional/visual hero banner with a clear primary CTA ("Shop Now"), using vendor-specific configurations.
- **Product discovery:** Introduce merchandising rows on the homepage (Best Sellers, New Arrivals, Deals, Popular in Your Area).
- **Product cards:** Update the `ProductCard` component to flow: Image → Name → Pack Size → Price → Offer → Quantity Selector → Add to Cart.
- **Category navigation:** Convert department text links into attractive visual category cards/icons.

**Deliberately excluded:**
- P1 and P2 UI gaps (Search autocomplete, persistent cart, Footer architecture, Accessibility review, Empty states). These will be tracked as separate subsequent epics.
- Changes to the underlying database schema or core API routes; this is purely a presentation layer overhaul.

**Open items carried forward:**
- Fetching real analytics data for "Popular in Your Area" (will mock or use basic heuristics for now).
