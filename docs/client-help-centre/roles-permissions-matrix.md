---
id: roles-permissions-matrix
title: "Roles & Permissions Reference Matrix"
audience: [store-admin, staff, platform-admin]
type: guide
status: approved
version: "1.0.0"
updated: 2026-10-25
visibility: internal
summary: "Comprehensive matrix of platform roles (Platform Admin, Store Admin, Staff, Customer), capability boundaries, and tenant isolation rules."
tags: [roles, permissions, rbac, security, tenant-isolation]
related: [client-user-journeys, platform-admin-guide, store-admin-tabs-guide]
---

# Roles & Permissions Reference Matrix

The platform implements a strict two-tier Role-Based Access Control (RBAC) model combined with row-level multi-tenancy.

---

## 1. Role Definitions

1. **Global Platform Admin (`Role.ADMIN`):**
   - Transcends all individual tenant boundaries.
   - Manages tenant creation, domain routing, edge secrets, system health, and global AI allowances.
2. **Vendor Admin / Store Admin (`VendorMembership.role = ADMIN`):**
   - Scoped strictly to one vendor store (`vendorId`).
   - Manages storefront branding, catalogue, pricing, delivery postcodes, staff accounts, and discounts.
3. **Store Staff (`VendorMembership.role = STAFF`):**
   - Operational role within one store.
   - Manages live order fulfillment, inventory toggles, and review moderation.
4. **Customer / Shopper (`Role.CUSTOMER` or Guest):**
   - Shopper account with no administrative privileges.
   - Can browse products, manage cart, place orders, and track order fulfillment.

---

## 2. Capabilities & Route Access Matrix

| Feature / Route | Platform Admin | Store Admin | Staff | Customer |
| :--- | :---: | :---: | :---: | :---: |
| **Storefront Browse & Cart** (`/`, `/category/*`, `/cart`) | ✓ | ✓ | ✓ | ✓ |
| **Checkout & Payments** (`/checkout`) | ✓ | ✓ | ✓ | ✓ |
| **Customer Help Centre** (`/help`) | ✓ | ✓ | ✓ | ✓ |
| **Orders Queue & Fulfilment** (`/staff/orders`) | ✓ | ✓ | ✓ | ✗ |
| **Live Inventory Adjustments** (`/staff/inventory`) | ✓ | ✓ | ✓ | ✗ |
| **Product Catalogue Editing** (`/staff/products`) | ✓ | ✓ | ✓ | ✗ |
| **Bulk Stock Import** (`/staff/products/import`) | ✓ | ✓ | ✗ | ✗ |
| **Customer Review Moderation** (`/staff/feedback`) | ✓ | ✓ | ✓ | ✗ |
| **Storefront Settings & Hours** (`/staff/storefront`) | ✓ | ✓ | ✗ | ✗ |
| **Delivery Zones & Fees** (`/staff/delivery-areas`) | ✓ | ✓ | ✗ | ✗ |
| **Fulfilment Time Slots** (`/staff/fulfilment`) | ✓ | ✓ | ✗ | ✗ |
| **Team Management** (`/staff/team`) | ✓ | ✓ | ✗ | ✗ |
| **Discount Codes & Referrals** (`/staff/discounts`) | ✓ | ✓ | ✗ | ✗ |
| **Loyalty Program Settings** (`/staff/loyalty`) | ✓ | ✓ | ✗ | ✗ |
| **Sales & Financial Reports** (`/staff/reports`) | ✓ | ✓ | ✗ | ✗ |
| **Store Onboarding Audit** (`/staff/onboarding`) | ✓ | ✓ | ✗ | ✗ |
| **In-App Runbook** (`/staff/runbook`) | ✓ (all) | ✓ (vendor) | ✓ (staff) | ✗ |
| **Platform Tenant Directory** (`/staff/platform/vendors`) | ✓ | ✗ | ✗ | ✗ |
| **Platform Domain Registry** (`/staff/platform/domains`) | ✓ | ✗ | ✗ | ✗ |
| **Platform Health Diagnostics** (`/staff/platform/health`) | ✓ | ✗ | ✗ | ✗ |
| **Server Error Events** (`/staff/errors`) | ✓ | ✗ | ✗ | ✗ |

---

## 3. Tenant Isolation & Safeguards

- **Row-Level Tenancy:** Every query in the repository layer requires an explicit `vendorId`. A store admin cannot query or modify another store's records.
- **Access Refusal UI:** When a user navigates to an unauthorized page, the platform renders a clean, accessible `<PanelRefusal>` component explaining the missing permission rather than breaking the UI.
- **Strict Error Log Isolation:** Store admins are barred from `/staff/errors` to prevent exposure of cross-tenant error events or internal database topology.
