---
id: order-fulfilment-core
title: "Order & Fulfilment Operations"
audience: [staff, store-admin, dev, product, shopper]
type: runbook
status: approved
version: "1.0.0"
updated: "2026-09-22"
visibility: internal
summary: "Canonical rules for order status transitions, fulfilment slots, cancellations, and payment exceptions."
tags: ["orders", "fulfilment", "payments", "cancellation", "staff", "admin"]
related: [store-admin-tabs-guide, staff-tabs-guide, shopping-guide]
---

# Order & Fulfilment Operations

This document establishes the canonical rules and procedures for how orders move through the Aheed platform, how fulfilment slots are allocated, and how cancellations and payment exceptions are handled. 

## 1. Fulfilment Slots & Capacity

Customers choose a delivery or collection time slot at checkout. Slots act as a hard constraint to prevent taking more orders than can be physically fulfilled.

*   **Capacity Limit:** Each slot has a `capacity`. Once filled by paid orders (or orders in their unpaid hold window), the slot is no longer offered.
*   **Hold Window:** Unpaid orders (`PENDING_PAYMENT`) hold their slot temporarily. If payment is not completed within the hold window, the slot is released back to the pool.
*   **Express Collection:** Offered only if Click & Collect is enabled in the Storefront settings and the current time falls within an active express window.
*   **Time Zones:** Slot definitions are bound to the store's configured time zone (default `Europe/London`). Changing this setting does not migrate existing orders or slots; it merely changes how future times are interpreted.

**Known Trap (Collection Slots):** Enabling Click & Collect requires setting up weekly collection slots. If the toggle is on but no slots exist, customers selecting Collection will see "No slots available" and will be blocked from checking out.

---

## 2. Order Status Transitions

An order moves through a strict lifecycle. Staff members drive this progression from the Orders queue, which by default only shows active work (`CONFIRMED`, `READY_FOR_COLLECTION`, `OUT_FOR_DELIVERY`).

### Standard Workflows

Orders follow a forward-only path based on the fulfilment method:

*   **Delivery:** `CONFIRMED` → `OUT_FOR_DELIVERY` → `DELIVERED`
*   **Collection:** `CONFIRMED` → `READY_FOR_COLLECTION` → `COLLECTED`

**Audience Actions:**
*   **Shopper:** Can view the current status of their order in their account. Shoppers cannot transition order states themselves once paid.
*   **Staff / Store Admin:** Uses the Staff Queue to advance an order to its next logical state (e.g., marking a `CONFIRMED` delivery as `OUT_FOR_DELIVERY`). The system strictly prevents moving an order backwards or jumping states.

### Status Notifications
Transitioning an order triggers automatic email notifications to the customer (e.g., "Your order is out for delivery"). 

> **References / Related Artifacts:** 
> - Status definitions and transition constraints: [lib/order-status.ts](file:///E:/GitRepositories/aheed-online-store/lib/order-status.ts)
> - Order core checkout foundation: [specs/2026-08-10-p3b-checkout-order-core/plan.md](file:///E:/GitRepositories/aheed-online-store/specs/2026-08-10-p3b-checkout-order-core/plan.md)
> - Staff status transitions & delivery emails: [specs/2026-08-11-p4b-order-status-transitions/plan.md](file:///E:/GitRepositories/aheed-online-store/specs/2026-08-11-p4b-order-status-transitions/plan.md)

---

## 3. Cancellations vs. Refunds

Cancellation and refunding are **distinct, decoupled actions** in the Aheed platform. 

### Staff Cancellations
Staff and Store Admins can cancel a paid order only if the goods are still physically on the premises (i.e., status is `CONFIRMED` or `READY_FOR_COLLECTION`).

When an order is cancelled:
1. **Stock is returned:** The inventory count is incremented.
2. **Loyalty is reversed:** Earned points are revoked, and spent points are returned to the customer's balance.
3. **Discounts are restored:** The redemption count for the used discount code is returned, preserving the customer's concurrency limit without losing the audit trail.
4. **Capacity is freed:** The fulfilment slot capacity is released.

### Refunds
**Cancelling an order does not automatically refund the customer.** 
Because order amendment and financial refunds are currently outside the platform's capabilities, the `Payment` record stays as `SUCCEEDED`. To return money to a customer, a Store Admin must process the refund manually through the payment provider's dashboard (e.g., Stripe).

*   *Shoppers:* Must contact the store to request a cancellation/refund. They cannot cancel paid orders via the UI.
*   *Revenue Reporting:* Cancelled paid orders are correctly excluded from the `REVENUE_STATUSES` set, meaning they do not count towards the store's revenue metrics.

> **References / Related Artifacts:**
> - Staff cancellation logic & rules: [specs/2026-09-17-p696-staff-cancel-confirmed-order/plan.md](file:///E:/GitRepositories/aheed-online-store/specs/2026-09-17-p696-staff-cancel-confirmed-order/plan.md)
> - Revenue tracking constraints: [lib/order-status.ts](file:///E:/GitRepositories/aheed-online-store/lib/order-status.ts)

---

## 4. Payment Exceptions & Recovery

Occasionally, a customer's payment may complete with the provider (e.g., Stripe) but fail to reach the Aheed platform (due to a webhook failure or network timeout). These orders get stuck in `PENDING_PAYMENT` and quietly hold stock.

**Store Admin Recovery Workflow:**
1. Navigate to `/staff/payments`.
2. Review the list of recently refused or missed payment events.
3. Click to **reconcile** the payment. The system will query the payment provider to establish the true state of the charge.
4. If the payment succeeded, the system will **recover** the order, transition it to `CONFIRMED`, and place it into the normal fulfilment queue.

> **References / Related Artifacts:**
> - Payment handling and webhooks: [specs/2026-08-10-p3c-stripe-payments/plan.md](file:///E:/GitRepositories/aheed-online-store/specs/2026-08-10-p3c-stripe-payments/plan.md)
