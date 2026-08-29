---
id: 2026-08-29-p9-1-data-integrity-hardening
title: "P9.1 Data Integrity Hardening (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-29
visibility: internal
summary: Centralize critical constraints (commercial CHECK invariants and review vendor-scoping) in the database and repositories.
tags: [backend, database, p9.1]
related: [specs/architecture.md, specs/roadmap.md]
---

# P9.1 Data Integrity Hardening (plan)

The narrative: why this slice exists, what it proves, and where its edges are.

**Goal:** Close out the immediate, high-priority data integrity risks logged in P9.1 by migrating critical commercial checks down to the PostgreSQL layer and enforcing `vendorId` isolation on review writes, plus setting up the first cross-tenant schema relationship.

**Scope (this slice):**
- **#340 (Reviews scoping):** Fix `upsertReview` and `deleteReview` in `lib/repositories/reviews.ts` so they explicitly take and enforce `vendorId`. A review write request using a cross-vendor `productId` will correctly return "Product not found" rather than writing the review against the other tenant's product. Update the allowlist in `tests/repository-vendor-scoping.test.ts`.
- **#433 (CHECK constraints):** Write a single hand-authored migration (`npm run db:migrate:dev -- --name p9_1_commercial_check_constraints --create-only`) adding PostgreSQL `CHECK` constraints to enforce basic invariants:
  - `Inventory.quantity >= 0`
  - `Product.basePrice >= 0` and `Product.originalPrice >= 0`
  - `ProductPriceTier.groupQuantity >= 2` and `ProductPriceTier.groupPricePence >= 0`
  - `OrderItem.quantity > 0` and `OrderItem.unitPricePence >= 0`
  - `Payment.amountPence >= 0`
- **#432 (Cross-tenant integrity - Slice 1):** Add structural multi-tenancy protection (composite FKs) to exactly one relationship: `Product` to `Category`. This involves adding `@@unique([id, vendorId])` on `Category` and altering `Product`'s foreign key to reference `[categoryId, vendorId]`. We must run an audit first to ensure no existing staging/prod rows violate the new rules.

**Deliberately excluded:**
- The rest of #432's relationships (`Inventory`, `CartItem`, `OrderItem`, `BundleItem`, `ProductPriceTier`). The issue explicitly states: "Work through the relationships incrementally. Do not refactor unrelated repositories. Six relationships is six migrations' worth of thought, not one sweep." These will follow in subsequent slices.

**Open items carried forward:**
- Implementing Slice 2 through 6 of #432.
