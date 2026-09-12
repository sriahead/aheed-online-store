---
id: 2026-09-12-staff-admin-help-ratings-req
title: Requirements
audience: [dev]
type: spec
status: approved
version: "1.1.0"
updated: 2026-09-12
visibility: internal
summary: Requirements for Staff/Admin roles, Category Manager, Help Centre, and zero-review ratings.
---

# Requirements

## 1. Staff vs Admin Authorization
- **R1:** The following areas MUST be fully accessible to both `STAFF` and `ADMIN` vendors:
  - Inventory (`/staff/inventory`)
  - Orders (`/staff/orders`)
  - Products (`/staff/products`)
  - Categories (`/staff/categories`)
  - Brands (`/staff/brands`)
  - Promotions (`/staff/promotions`)
  - Bundles (`/staff/bundles`)
  - Runbook (`/staff/runbook`)
  - Search Dictionary (`/staff/search-synonyms`) (Moderation only)
- **R2:** The following areas MUST be strictly restricted to `ADMIN` vendors only:
  - Payment Issues (`/staff/payments`)
  - Storefront Configuration (`/staff/storefront`)
  - Delivery Areas (`/staff/delivery-areas`)
  - Loyalty Configuration (`/staff/loyalty`)
  - Discount Codes (`/staff/discounts`)
  - Reports (`/staff/reports`)
  - Customers (`/staff/customers`)
  - Team & Access (`/staff/team`)
- **R3:** `STAFF` must not be able to bypass UI hidden links by guessing URLs. All pages listed in R2 must return a refusal via `<PanelRefusal />` or throw appropriately if accessed by `STAFF`.
- **R4:** `STAFF` must not be able to execute Server Actions belonging to `ADMIN`-only domains. Each Server Action backing R2 domains must perform an `ADMIN` authorization check *before* any protected operations or data access occur.
- **R5:** Tenant/Vendor isolation MUST remain strictly enforced via `getCurrentVendorId` or similar methods; no `STAFF` or `ADMIN` can access another tenant's data.
- **R6:** For Search Dictionary, `STAFF` MUST be allowed to add, manage, and bulk-manage synonyms. However, the AI suggestion action (`proposeSynonymsFromLog`) MUST remain strictly restricted to `ADMIN`.
- **R7:** Error events (`/staff/errors`) MUST remain `Platform Admin` only (via `auth.via === "platform-admin"`), untouched by these changes.

## 2. Category Manager Improvements
- **R8:** The "New Category" creation form (`<CategoryForm>`) MUST be positioned visually above the category list on `/staff/categories`.
- **R9:** The Category list MUST include global "Expand All" and "Collapse All" controls.
- **R10:** These new controls MUST interact with the existing `collapsedIds` local state within `CategoryListClient` rather than introducing a new state paradigm.

## 3. Help Centre Presentation
- **R11:** The `/help` Detailed Shopping Guide MUST present markdown content in visually distinct, rounded cards for each top-level heading (`## `).
- **R12:** The markdown styling MUST utilise the existing Tailwind `prose` design tokens identical to the Runbook's presentation.
- **R13:** A shared component MUST be extracted to render both the Help Centre documentation and the `RunbookClient` documentation uniformly.
- **R14:** Internal operational Runbook documents and customer Help Centre documents MUST remain logically separate; they only share the rendering component.

## 4. Hide Zero-Review Ratings
- **R15:** A product with exactly 0 reviews MUST NOT display any aggregate rating UI across the storefront (e.g. no 0.0, no empty stars, no "(0 reviews)").
- **R16:** A product with 1 or more genuine reviews MUST display its aggregate rating correctly as it does today.
- **R17:** The rating presentation logic MUST be encapsulated within a new shared component (e.g. `ProductRating`) to prevent duplication.
- **R18:** `ProductCard.tsx` (the only current storefront aggregate-rating location) MUST use this shared component instead of its inline markup.
