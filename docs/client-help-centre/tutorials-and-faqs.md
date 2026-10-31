---
id: tutorials-and-faqs
title: "Store Operations Tutorials & FAQ Management"
audience: [store-admin, staff]
type: guide
status: approved
version: "1.0.0"
updated: 2026-10-25
visibility: internal
summary: "Step-by-step tutorials for common operational workflows and instructions for managing customer FAQs via the in-app CMS."
tags: [tutorials, faqs, store-admin, staff, cms, operations]
related: [store-admin-tabs-guide, staff-tabs-guide]
---

# Store Operations Tutorials & FAQ Management

This guide provides practical walkthroughs for daily store management tasks and explains how to author self-service customer help articles.

---

## 1. Practical Operational Walkthroughs

### Walkthrough A: How to Run a Promotional Campaign
1. Open `/staff/promotions`.
2. Click **Create Promotion**. Enter title (e.g. "Weekend Fresh Produce Sale") and select the target category.
3. Configure banner image and schedule start/end dates.
4. If paired with a coupon code, navigate to `/staff/discounts` and create the matching code (e.g. `FRESH10`).
5. Verify banner display on the storefront homepage.

### Walkthrough B: How to Fulfill a Click & Collect Order
1. Open `/staff/orders` and filter for status `CONFIRMED` and slot type `COLLECTION`.
2. Open the order details and click **Start Preparing** (status transitions to `PREPARING`).
3. Pick the items from the shelf and bag them. Label the bag with the Order ID and Customer Name.
4. When the customer arrives, verify the Order ID and click **Mark Collected** (status transitions to `DELIVERED`).

### Walkthrough C: How to Handle an Out of Stock Item
1. While packing an order in `/staff/orders`, note the missing product.
2. Open `/staff/inventory` in a new tab. Search for the product name and toggle status to **Out of Stock**.
3. Return to the order, update the line item, and contact the customer via phone or WhatsApp to arrange an approved substitute or partial refund.

---

## 2. Managing Help Centre Answers (`/staff/faqs`)

Store Admins have full content management capabilities over their customer help questions without requiring developer assistance or software deployments:

1. **Access FAQ Manager:** Navigate to `/staff/faqs`.
2. **Add New Question:** Click **Add FAQ**.
   - *Question:* Enter clear customer question (e.g., "What are your delivery hours on Bank Holidays?").
   - *Answer:* Enter the formatted answer.
   - *Display Order:* Enter a numerical sort order to control sequence.
3. **Toggle Active Status:** Click the active switch to publish or temporarily unpublish an answer.
4. **Immediate Storefront Sync:** Answers update instantly on the customer-facing `/help` page upon saving.
