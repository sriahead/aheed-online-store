---
id: p6-6c-operations-completion
title: "P6.6c: Operations Views Completion (Staff/Admin)"
audience: [dev]
type: doc
status: approved
version: "1.0.0"
updated: 2026-08-13
visibility: internal
summary: Align the Staff/Admin operations portal with the docs/ui-ref mockup.
tags: [admin, staff, UI, P6]
---

# Plan

## Objective
Align the production operations portal (`/staff`) with the `docs/ui-ref` mockup, which provides distinct and fully complete capabilities for both "Staff" (shop-floor) and "Admin" (full CRUD) roles. Specifically, address missing pages, broken navigation, and incomplete overview dashboards.

## Motivation
During the implementation of P6a, P6b, and the recent P6 Missing Gap (Issue #168), the operations views were constructed incrementally. As a result, they drifted from the consolidated unified vision laid out in `docs/ui-ref/src/components/StaffAdminPanel.tsx`.
1. **Broken Links**: `PanelNav.tsx` gives Staff a link to `/staff/runbook` which does not exist (404).
2. **Hidden Capabilities**: Admin users are a superset of Staff, yet `PanelNav.tsx` currently hides the "Live Inventory & Availability" and "Runbook" tabs from them.
3. **Incomplete Dashboards**: The `/staff` landing page overview doesn't have portal cards for Inventory or Runbook.
4. **Missing Reports Tab**: The mockup includes a simplified "Sales & Pence Financials" tab. While full Admin Reports (Issue #161) were deferred, providing a simplified dashboard of Total Revenue, Total Orders, and Average Basket Value is necessary to match the mockup's visual completion.

## Implementation Strategy

### 1. Unified Navigation (`components/staff/PanelNav.tsx`)
- Refactor the navigation bar so that **Staff** see `Overview`, `Inventory`, `Orders`, and `Runbook`.
- **Admin** will see `Overview`, `Inventory`, `Orders`, `Catalogue`, `Categories`, `Loyalty`, `Discounts`, `Reports`, and `Runbook`.
- Use a horizontally scrollable container (e.g. `overflow-x-auto whitespace-nowrap`) to support the increased number of tabs gracefully on mobile.

### 2. Overview Portal (`app/(admin)/staff/page.tsx`)
- Add a portal card for "Live Inventory & Availability" (visible to STAFF and ADMIN).
- Add a portal card for "Internal Operational Runbook" (visible to STAFF and ADMIN).
- Add a portal card for "Sales & Pence Financials" (visible to ADMIN only).

### 3. Runbook Page (`app/(admin)/staff/runbook/page.tsx`)
- Create a new static-ish page that renders the `DOC_ARTICLES` from `docs/ui-ref/src/data/docs.ts` (specifically those with `visibility: 'internal'`). 
- It will serve as the "Zero-Trust Staff Guide" matching the dark-themed mockup design.

### 4. Simplified Reports Page (`app/(admin)/staff/reports/page.tsx`)
- Create an Admin-only page.
- Query the `Order` table for the current vendor to calculate `totalOrders`, `totalRevenuePence`, and derive `averageBasketValue`.
- Render the three financial stat cards exactly as shown in the UI mockup.

## Non-Goals
- Full complex financial reporting with date-range filtering, charts, and CSV exports. We are only building the simplified high-level metrics card view to satisfy the mockup's visual requirement.
- Moving KMS files to the database. The Runbook will use statically imported data or read local markdown files as per the mockup.
