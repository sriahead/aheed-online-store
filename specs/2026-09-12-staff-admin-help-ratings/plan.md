---
id: 2026-09-12-staff-admin-help-ratings
title: Staff/Admin Delegation, Category Manager, Help Centre, and Ratings
audience: [dev]
type: doc
status: draft
version: "1.0.0"
updated: 2026-09-12
visibility: internal
summary: Consolidate STAFF vs ADMIN responsibilities, enhance Category Manager, improve Help Centre markdown rendering, and hide zero-review ratings.
---

# Plan

This slice addresses four distinct areas requested for Issue #737 under Milestone P09.2.

## 1. Staff/Admin Delegation
**Goal:** Delegate day-to-day operations to `STAFF` while keeping platform configurations restricted to `ADMIN`.
- **UI Navigation:** Update `components/staff/PanelNav.tsx` and `app/(admin)/staff/page.tsx` to reflect the new roles.
- **Role Guards (Pages):** 
  - Change to `requireVendorRole("STAFF", "ADMIN")`: Products, Categories, Brands, Promotions, Bundles, Search Dictionary.
  - Change to `requireVendorRole("ADMIN")`: Payments.
- **Server Actions:** Mirror the updated page guards in their respective `features/admin/*` and `features/payments/*` files. Specifically, ensure AI-configuration in Search Dictionary (`proposeSynonymsFromLog`) remains `ADMIN`-only, while moderation remains accessible to `STAFF`.

## 2. Category Manager Improvements
**Goal:** Improve `/staff/categories` without rewriting existing correct ordering logic.
- **Component Reuse:** Build upon the `CategoryListClient` from #638.
- **New Controls:** Add "Expand All" and "Collapse All" global controls to manipulate the `collapsedIds` state.
- **Layout:** Move the "New category" `<CategoryForm>` above the category list.

## 3. Help Centre Presentation
**Goal:** Elevate `/help` page rendering to match the Runbook's polished presentation.
- **Shared Component:** Extract the markdown section-splitting logic (`/(?=^##\s)/m`) and Tailwind `prose` styling from `RunbookClient.tsx` into a reusable `DocumentSectionRenderer.tsx`.
- **Implementation:** Replace the single `<Markdown>` block in `HelpPage` with the new component. Keep the internal docs source logic exactly as-is.

## 4. Hide Zero-Review Ratings
**Goal:** Avoid rendering "0.0 (0 reviews)" when a product has no reviews.
- **Shared Component:** Extract the `<Star /> {averageRating} ({reviewCount})` snippet from `ProductCard.tsx` into a new `components/product/ProductRating.tsx`.
- **Logic:** Return `null` if `reviewCount === 0`.
- **Adoption:** Replace the inline rating implementation in `ProductCard.tsx` (the only storefront location currently rendering aggregate ratings) with the new shared component.
