---
id: p7a-compliance-hardening-validation
title: Phase 7a Validation & Acceptance Plan
audience: [dev, staff]
type: spec
status: approved
version: "1.1.0"
updated: 2026-08-13
visibility: internal
summary: Validation steps, test cases, visual parity checks vs docs/ui-ref, and empirical criteria for Phase 7a compliance, operational closure, and UX hardening.
tags: [p7, validation, compliance, testing, ui-ref]
---

# Phase 7a — Validation & Acceptance Plan

All criteria must be empirically verified before Phase 7a closes and merges.

---

## 1. Automated Machine Checks
- [ ] `npm run typecheck` passes cleanly with zero TypeScript errors.
- [ ] `npm run lint` passes cleanly with zero ESLint errors.
- [ ] `npx vitest run` passes 100% of unit/integration tests.
- [ ] `npm run kms:validate` passes with 0 failing front-matter schema errors.
- [ ] `npm run sdd:audit` passes with all shipped slices documented.

---

## 2. Visual & UX Reference Parity (`docs/ui-ref`)
- [ ] `CartDrawer.tsx` slide-over drawer visually matches `docs/ui-ref/src/components/CartDrawer.tsx` typography, spacing, progress indicator, and action buttons.
- [ ] `CookieBanner.tsx` matches the design system tokens and visual style of `docs/ui-ref`.
- [ ] Guest Order Lookup (`/orders/lookup`) form matches `docs/ui-ref/src/components/OrderTrackingModal.tsx` fields and status tracking timeline.

---

## 3. Slice 1: UK Compliance & Security Headers
- [ ] Cookie banner (`CookieBanner.tsx`) renders on first visit and persists consent choice in `aheed_cookie_consent` cookie.
- [ ] `/terms` page renders storefront Terms of Service with valid navigation links.
- [ ] `/privacy` page renders UK GDPR / PECR Privacy Policy.
- [ ] HTTP security headers (`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`) present on HTTP response headers.

---

## 4. Slice 2: Guest Order Lookup & Slide-Over Cart Drawer
- [ ] Navigating to `/orders/lookup` allows entering an Order Number + Email to retrieve order status.
- [ ] Invalid order number or incorrect email returns clean refusal message.
- [ ] Rate-limiting refuses >5 lookup attempts per minute per IP/host.
- [ ] Header cart icon click opens `CartDrawer.tsx` slide-over overlay.
- [ ] Cart drawer displays item list, quantity controls, subtotal, and checkout button.

---

## 5. Slice 3: Staff Bulk Transitions & One-Click Reorder
- [ ] `/staff/orders` dashboard displays multi-select checkboxes on actionable order rows.
- [ ] Bulk selection and status advance moves multiple orders simultaneously in one transaction.
- [ ] `/account/orders/[orderNumber]` displays "Reorder items" button, which populates the shopper's active cart.

---

## 6. Slice 4: Operational Prerequisites
- [ ] Resend transactional email test arrives in real customer inbox (`orders@aheedfoodcentre.co.uk`).
- [ ] Production Stripe checkout creates live session with live keys.
- [ ] Production R2 image upload (`presigned PUT`) succeeds without CORS errors.
