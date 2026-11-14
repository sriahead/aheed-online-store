---
id: 2026-11-14-dynamic-vendor-branding-plan
title: "Dynamic vendor branding and Merqify ecosystem identity on Stripe Checkout (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-14
visibility: internal
summary: "Dynamic per-session vendor branding on hosted Stripe Checkout with Merqify ecosystem identity, supporting multi-application architecture and future Stripe Connect compatibility."
tags: [stripe, payments, checkout, branding, merqify-core]
related: [architecture]
---

# Dynamic vendor branding and Merqify ecosystem identity on Stripe Checkout (plan)

## Objective

Update the existing Stripe Checkout integration in Merqify Core so customers can clearly identify each independent business they are paying on Stripe-hosted Checkout, while establishing Merqify's identity as the underlying technology ecosystem.

Branding format:
**[Vendor Business Name]**
*Part of the Merqify Ecosystem*

Stripe's native `"Powered by Stripe"` checkout footer attribution remains unchanged.

## Scope

- **Merqify Core Payment Port (`lib/payments.ts`):**
  - Add optional `vendorName?: string` and `applicationContext?: string` to `CreatePaymentInput`.
  - Pin request header `Stripe-Version: 2025-09-30.clover` to enable `branding_settings` on Checkout Sessions.
  - Set `branding_settings[display_name] = input.vendorName` on session creation.
  - Set line item name to `Order ${orderNumber} · ${vendorName}` and description to `"Part of the Merqify Ecosystem"`.
  - Set `custom_text[submit][message]` to `"You are purchasing from ${vendorName}. Part of the Merqify Ecosystem."` and `custom_text[after_submit][message]` to `"Thank you for your order with ${vendorName}. Part of the Merqify Ecosystem."`.
  - Graceful fallback when `vendorName` is omitted or empty.
  - Record `metadata[vendorName]` and `metadata[applicationContext]`.
- **Order Repository (`lib/repositories/orders.ts`):**
  - In `placeOrder`, query the active `Vendor` and `VendorBranding` records inside the transactional boundary.
  - Pass `vendorName` and `applicationContext` down to `payments.createPayment(...)`.
- **Forward Compatibility:**
  - Zero database migrations.
  - Preserves current single-account payment routing and settlement.
  - Designed for seamless Stripe Connect transition via `vendorId` and future `on_behalf_of` delegation.
