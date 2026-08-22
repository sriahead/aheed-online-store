---
id: operations-research-guide
title: "Operations & Fulfillment Procedures"
audience: [operations]
type: guide
status: approved
version: "1.0.0"
updated: 2026-08-22
visibility: internal
summary: "A guide for operations teams detailing the fulfillment lifecycle, stock management, and exception handling."
tags: ["operations", "fulfillment", "supply-chain", "sop"]
---

# Operations & Fulfillment Procedures

Welcome to the **Operations & Research** documentation. This guide outlines the standard operating procedures (SOPs) for the fulfillment lifecycle, ensuring smooth day-to-day running of the store.

## The Fulfillment Lifecycle
The typical order flows through the following states:
1. **Pending Payment:** The customer has placed the order, but the payment provider (e.g., Stripe) has not yet cleared the funds. Stock is held, but picking should not begin.
2. **Confirmed:** Payment is cleared. The order appears in the Staff Panel's "Fulfillment" tab. It is ready to be picked.
3. **Out for Delivery:** Staff have picked the items and handed them to the delivery driver.
4. **Delivered:** The order has successfully reached the customer.

## Exception Handling
- **Cancellations & Refunds:** If an order cannot be fulfilled (e.g., due to stock discrepancy), staff or admins must manually cancel the order and issue a refund.
- **System Outages:** If the staff interface or payment gateway goes down, revert to the manual paper-picking runbook until systems are restored.

## Inventory Management
- **Automated Stock Deductions:** When an order is placed, stock is immediately deducted from the Live Inventory.
- **Low Stock Alerts:** Items hitting their "Low Stock Threshold" (e.g., 3 units remaining) will trigger alerts in the Staff Panel Overview. Operations should use these alerts to trigger supply-chain reorders.
- **Manual Adjustments:** Staff can manually reconcile physical shelf stock with system stock using the "Live Inventory" tab. This is crucial for managing shrink and damaged goods.

## Research & Feedback Loops
- Operations researchers should regularly interview fulfillment staff to identify bottlenecks in the picking interface.
- If staff are frequently overriding inventory counts for a specific supplier, flag this to the procurement team for investigation.

