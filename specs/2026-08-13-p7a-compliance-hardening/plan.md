---
id: p7a-compliance-hardening-plan
title: Phase 7a Implementation & Execution Plan
audience: [dev, admin]
type: doc
status: approved
version: "1.0.0"
updated: 2026-08-13
visibility: internal
summary: Step-by-step implementation plan for Phase 7a operational closure, UK compliance, security headers, and user-experience gaps.
tags: [p7, plan, compliance, implementation]
---

# Phase 7a — Implementation Plan

## Slices Breakdown

### Slice 1: UK Compliance & Security Headers
- Create `components/consent/CookieBanner.tsx` for PECR cookie management.
- Create `/terms` (`app/(storefront)/terms/page.tsx`) and `/privacy` (`app/(storefront)/privacy/page.tsx`).
- Inject OWASP security headers in `next.config.mjs` / Cloudflare response headers.

### Slice 2: Guest Order Lookup & Slide-Over Cart Drawer
- Implement `/orders/lookup` page with order number + email lookup.
- Build `components/cart/CartDrawer.tsx` slide-over drawer triggered from header.

### Slice 3: Staff Bulk Transitions & One-Click Reorder
- Add multi-select checkboxes and bulk transition Server Action in `/staff/orders`.
- Add "Reorder" button on `/account/orders/[orderNumber]`.

### Slice 4: Operational Prerequisites & Pre-Launch Validation
- Guide owner through Resend DNS TXT/MX records verification.
- Configure production Stripe live API keys in `secrets/production.vars`.
- Set CORS policy on production R2 storage bucket (`aheed-images-production`).
