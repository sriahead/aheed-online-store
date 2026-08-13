---
id: p7a-compliance-hardening-requirements
title: Phase 7a — Compliance, Operational Closure & Application Hardening Requirements
audience: [dev, staff]
type: spec
status: approved
version: "1.1.0"
updated: 2026-08-13
visibility: internal
summary: Spec and requirements for closing Phase 6 gaps, completing UK GDPR/PECR compliance, matching UI reference look-and-feel (docs/ui-ref), and de-risking operational launch prerequisites before Phase 8.
tags: [p7, compliance, hardening, operational-closure, ui-ref, sdd]
---

# Phase 7a — Compliance, Operational Closure & Application Hardening

## Overview
Phase 7a addresses all operational, security, UK GDPR/PECR compliance, and user-experience gaps identified in `docs/gap-register.md` before final launch (Phase 8).

---

## 1. UI & Visual Design Policy (`docs/ui-ref`)
- **Visual Parity Policy:** All new and updated UI elements (`CartDrawer`, `CookieBanner`, `/orders/lookup`, `/terms`, `/privacy`, bulk order controls) must align with the visual styling and layout elements in `docs/ui-ref` (AI Studio reference mockup).
- **Design System Consistency:** Modifications must use existing design system tokens (`design-system/tokens/tokens.css`) and per-vendor brand styling (`lib/vendor-theme.ts`), maintaining seamless visual integration with the rest of the storefront without breaking existing component styling.

---

## 2. Operational Gap Closure (P1)

### 2.1 GAP-005: Resend Custom Domain Verification
- **Prerequisite:** Owner configures DNS TXT/MX records for `aheedfoodcentre.co.uk` in Resend portal.
- **Config Update:** Update `RESEND_FROM_EMAIL` in `secrets/staging.vars` and `secrets/production.vars` to `orders@aheedfoodcentre.co.uk`.
- **Validation:** Send transactional order confirmation to a test address and verify inbox delivery.

### 2.2 GAP-006: Stripe Live Mode Keys
- **Prerequisite:** Owner obtains live API keys (`sk_live_...`) and webhook signing secret (`whsec_...`).
- **Config Update:** Configure live keys in `secrets/production.vars`.
- **Validation:** Execute test-mode and live-mode webhook verification cleanly.

### 2.3 GAP-007: Production R2 Storage Bucket CORS
- **Prerequisite:** Owner executes `wrangler r2 bucket cors set aheed-images-production --file cors-config.json` via Wrangler CLI.
- **Validation:** Issue presigned `PUT` upload from production domain and verify 200 OK CORS response.

---

## 3. Regulatory Compliance & Security (UK GDPR & PECR)

### 3.1 PECR Cookie Consent Banner
- **Requirement:** Accessible consent banner managing non-essential cookies with clear Accept/Decline options and cookie policy link, styled to match `docs/ui-ref`.
- **Implementation:** React client component storing preference in host-scoped cookie `aheed_cookie_consent`.

### 3.2 Terms of Service & Privacy Policy Pages
- **Requirement:** `/terms` and `/privacy` static/RSC pages containing UK GDPR compliant data privacy policies and storefront T&Cs.

### 3.3 Edge Security Headers
- **Requirement:** Cloudflare Workers header injection for HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and Content Security Policy (CSP).

---

## 4. High-Value User Experience & Operational Features (P2 & P3)

### 4.1 GAP-008: Guest Order Lookup (/orders/lookup)
- **Requirement:** Public form allowing guest shoppers to view order status by providing Order Number + Email. Styled to match `docs/ui-ref` modals, rate-limited to 5 requests per minute.

### 4.2 GAP-009: Storefront Slide-Over Cart Drawer
- **Requirement:** `components/cart/CartDrawer.tsx` slide-over overlay matching `docs/ui-ref/src/components/CartDrawer.tsx` styling and layout, triggered by header cart button while preserving deep-link `/cart` page.

### 4.3 GAP-010: Staff Bulk Order Status Transitions
- **Requirement:** Multi-select checkboxes on `/staff/orders` dashboard to advance multiple orders (`CONFIRMED` $\rightarrow$ `OUT_FOR_DELIVERY` $\rightarrow$ `DELIVERED`) in one transaction.

### 4.4 GAP-012: One-Click Reorder
- **Requirement:** "Reorder items" action on `/account/orders/[orderNumber]` page adding past order items into active cart.

---

## 5. Exit Criteria for Phase 7
- All 3 P1 operational prerequisites (GAP-005, GAP-006, GAP-007) verified.
- PECR consent banner and T&Cs / Privacy pages live.
- Guest order lookup and slide-over cart drawer implemented matching `docs/ui-ref` look-and-feel.
- 100% of Vitest unit/integration tests passing.
- `npm run kms:validate` and `npm run sdd:audit` green.
