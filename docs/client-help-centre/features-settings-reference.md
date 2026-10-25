---
id: features-settings-reference
title: "Store Features & Settings Reference Guide"
audience: [store-admin]
type: guide
status: approved
version: "1.0.0"
updated: 2026-10-25
visibility: internal
summary: "Detailed reference for store operating hours, delivery zone postcodes, fulfilment time slots, loyalty rules, and discount configurations."
tags: [settings, delivery-areas, fulfilment, hours, discounts, loyalty]
related: [store-admin-tabs-guide]
---

# Store Features & Settings Reference Guide

This reference explains each operational feature available to store administrators, configuration rules, and relevant limitations.

---

## 1. Operating Hours & Schedule (`/staff/storefront`)

- **Weekly Hours:** Configured per day of week (Monday through Sunday). Each day can be marked open or closed with opening/closing times (HH:MM).
- **Holiday & Emergency Overrides:** Special date overrides (`VendorHoursOverride`) allow setting modified operating hours or marking the store completely closed on specific dates (e.g., Bank Holidays).
- **Storefront Display:** Operating hours automatically display in the customer footer and on the `/help` page.

---

## 2. Delivery Zones & Minimums (`/staff/delivery-areas`)

- **Postcode Prefix Matching:** Delivery eligibility is determined by postcode outcode prefixes (e.g. `E1`, `E1W`, `RG1`).
- **Standard vs Area-Specific Pricing:**
  - *Default Delivery Fee:* Applied to all orders unless overridden.
  - *Default Minimum Order:* Minimum cart value required before delivery checkout is unlocked.
  - *Free Delivery Threshold:* Cart total that waives delivery charges.
  - *Per-Area Overrides:* Individual postcode areas can override delivery fees, minimum orders, and free delivery thresholds.

---

## 3. Fulfilment Time Slots (`/staff/fulfilment`)

- **Slot Types:** Supports standard delivery windows, click-and-collect windows, and express collection.
- **Lead Times & Cut-Offs:** Configure minimum lead time (hours or minutes) before a customer can select a time slot.
- **Capacity Limits:** Limit the number of orders allowed per slot to prevent kitchen or courier overload.

---

## 4. Discounts & Referral Codes (`/staff/discounts`)

- **Discount Types:**
  - *Percentage Off:* e.g. 10% off the total order.
  - *Fixed Amount Off:* e.g. £5.00 off orders over £30.00.
- **Eligibility Rules:** Minimum spend requirements, expiration dates, and maximum usage caps per code or customer.
- **Friend Referral Codes:** Automatically generated customer referral codes. The referred shopper receives an initial order discount, and the referring customer earns loyalty rewards.

---

## 5. Customer Loyalty Program (`/staff/loyalty`)

- **Points Accrual:** Set base points earned per pound spent (e.g., 5 points per £1.00).
- **Points Redemption:** Set redemption conversion value (e.g., 100 points = £1.00 discount).
- **Multipliers & Tiers:** Optional loyalty tiers (Bronze, Silver, Gold) offering higher point multipliers for frequent shoppers.
- **Global Toggle:** Loyalty can be switched on or off globally per store. When disabled, all customer-facing loyalty pages and banners are automatically hidden.
