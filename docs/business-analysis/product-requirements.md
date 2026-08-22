---
id: product-requirements-guide
title: "Product Requirements & Feature Workflows"
audience: [product]
type: guide
status: approved
version: "1.0.0"
updated: 2026-08-22
visibility: internal
summary: "A guide for Business Analysts and Project Managers detailing the core business logic, feature requirements, and workflows."
tags: ["product", "ba", "requirements", "workflows"]
---

# Product Requirements & Feature Workflows

Welcome to the **Business Analysis** documentation. This hub contains the core business logic and workflows that define the platform's features, translating business needs into actionable requirements for the engineering team.

## Core Business Workflows

### 1. Multi-Tenancy & Vendor Model
- The platform supports multiple Vendors (tenants). Each vendor has its own catalogue, inventory, customer base, orders, and configuration.
- Users can have specific roles (Staff, Admin) scoped to a single vendor.

### 2. Catalogue & Pricing
- **Pricing:** All monetary values are processed internally as integer pence to avoid rounding errors.
- **Product Metadata:** Products require a Name, Description, Base Price, and Unit Label (e.g., "£2.40 / kg").
- **Product Flags:** Products can be flagged as *Organic*, *Halal*, *Fresh*, and *Featured*.
- **Categories:** Products belong to a hierarchical category tree for easy navigation.

### 3. Cart & Checkout Flow
- **Identity:** Carts can belong to a registered User Account or an anonymous Guest session.
- **Validation:** At checkout, the system validates that the cart total meets the *Minimum Order Value* defined by the vendor.
- **Delivery Rules:** A *Delivery Fee* is applied unless the subtotal exceeds the *Free Delivery Threshold*.
- **Discounts:** A customer can apply one valid Discount Code per order.

### 4. Loyalty & Rewards
- Customers earn points based on the *Points Per Pound Earned* setting.
- Customers can redeem points to reduce their cart total based on the *Pence Per Point Redeemed* setting.
- *Loyalty Tiers* reward high-spending customers with point multipliers based on rolling spend windows (e.g., last 30 days).

## Requirement Management
- Use this space to map out User Stories, Acceptance Criteria, and State Diagrams for upcoming features on the roadmap.
- Refer to the existing `gap-register.md` to track unresolved requirements or technical debt that impacts business goals.

