---
id: 2026-09-12-p402-fulfilment-foundation
title: P402 Fulfilment Foundation
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-09-12
visibility: internal
summary: Plan for the Fulfilment Foundation slice, including Click & Collect collection points and method-aware data.
---

# #402 Fulfilment Foundation: Plan

This plan sequences the implementation of the Fulfilment Foundation slice.

## Step 1: Database Schema
* Add `VendorLocation` model with a 1:1 `vendorId` relation (following ADR-006).
* Add `offerCollection` to `VendorConfig`.
* Add `FulfilmentMethod` enum (`DELIVERY | COLLECTION`).
* Add `fulfilmentMethod` to `Order` with `DEFAULT 'DELIVERY'`.
* Expand `OrderStatus` enum with `READY_FOR_COLLECTION` and `COLLECTED`.
* Generate and review the Prisma migration SQL to ensure historical orders remain safely backward-compatible.

## Step 2: Admin Vendor Configuration
* Update `VendorConfig` admin server action to validate `VendorLocation` presence before allowing `offerCollection = true`.
* Build the UI for staff to manage their `VendorLocation` address and toggle `offerCollection`.

## Step 3: Checkout Core & Money Logic
* Update `computeTotals` in `lib/order-totals.ts` to take `method` and zero out `deliveryFeePence` for `COLLECTION`.
* Update `placeOrderAction` in `features/checkout/place-order.ts` to require an explicit `fulfilmentMethod`.
* For `COLLECTION`, bypass `isDeliverable` checking.
* For `COLLECTION`, query `VendorLocation` and blend its address with customer Name/Phone into a snapshot `Address` row.

## Step 4: Status Workflow & Staff Queue
* Update `lib/order-status.ts` to accept `method` in `canTransition` and enforce the separated state machines.
* Update `STAFF_QUEUE_STATUSES` and `REVENUE_STATUSES`.
* Update the staff order queue UI to render `[COLLECTION]` and `[DELIVERY]` badges.
* Update the single button in the queue to dispatch the correct next status based on the method.

## Step 5: Customer Presentation
* Update the checkout UI to present a Delivery vs Collection toggle.
* Update the Order Confirmation page and Order History pages to label the snapshot address correctly.
* Update transactional email templates to use method-appropriate copy ("Collection from" vs "Delivery to").

## Step 6: Testing & Validation
* Run all unit tests specified in `validation.md`.
* Manually verify the end-to-end checkout flow for both Delivery and Collection.
