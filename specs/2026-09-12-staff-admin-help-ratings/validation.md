---
id: 2026-09-12-staff-admin-help-ratings
title: Validation
audience: [dev]
type: doc
status: draft
version: "1.0.0"
updated: 2026-09-12
visibility: internal
summary: Verification criteria for Staff/Admin roles, Category Manager, Help Centre, and zero-review ratings.
---

# Validation

## 1. Staff vs Admin Authorization
- **V1 (Automated Parity):** `vitest run tests/staff-nav-parity.test.ts` MUST PASS, ensuring `PanelNav.tsx` staff-tier branch correctly matches the actual `requireVendorRole("STAFF", "ADMIN")` guards on the pages.
- **V2 (Automated Authorization):** Extend existing automated authorization tests to explicitly verify that a `STAFF` session receives a 403-equivalent refusal when attempting to execute Server Actions or access pages across ALL `ADMIN`-only areas: Payments, Storefront, Delivery Areas, Loyalty, Discounts, Reports, Customers, and Team & Access.
- **V3 (Automated Isolation):** Add explicit automated test coverage proving cross-vendor isolation (R5) on newly `STAFF`-delegated functionality. A `STAFF` member of Vendor A MUST NOT be able to read or mutate Products, Categories, Brands, Promotions, Bundles, or Search Dictionary entries belonging to Vendor B.
- **V4 (Manual Verification):** Log in as a `STAFF` account.
  - Verify that clicking Products, Categories, Brands, Promotions, Bundles, and Search Dictionary correctly loads the page without a "Staff only" or 403 refusal.
  - Navigate to Search Dictionary. Add a synonym, approve it, reject it. Verify success.
  - Ensure the "Suggest from recent searches" button is hidden.

## 2. Category Manager Improvements
- **V5 (Manual Layout):** Visit `/staff/categories` as an `ADMIN`. Verify the "New category" form is above the Category List.
- **V6 (Manual Interaction):** 
  - Ensure categories with children have their individual expand/collapse toggle arrows.
  - Click "Collapse All". Verify all nested children disappear and only top-level categories remain.
  - Click "Expand All". Verify all nested children become visible.
  - Verify that expanding an individual parent category after "Collapse All" works perfectly.

## 3. Help Centre Presentation
- **V7 (Manual Display):** Visit `/help` as a public shopper.
  - Scroll down to the Detailed Shopping Guide.
  - Verify that instead of one giant text block, the content is visually divided into multiple rounded cards with `bg-surface-muted` and border styling, each starting with its top-level `##` heading.
- **V8 (Manual Regression):** Visit `/staff/runbook` as a `STAFF` account.
  - Select a document.
  - Verify the Runbook document still renders correctly in identical rounded cards, ensuring the shared renderer works for both contexts.

## 4. Hide Zero-Review Ratings
- **V9 (Automated):** Add an automated component test (e.g., in vitest) for `ProductRating` proving that providing 0 reviews renders no rating UI, and providing 1 or more reviews renders the UI normally.
- **V10 (Manual Integration):** Ensure there is at least one product with 0 reviews and one product with >0 reviews in the database.
  - Visit the homepage or a department listing.
  - Look at the storefront integration for the 0-review product. Verify that NO star icon, NO "0.0", and NO "(0)" text are rendered in the card.
  - Look at the storefront integration for the >0-review product. Verify that the star icon, average rating, and review count are rendered correctly.
