---
id: p1261-click-collect-email
title: "Plan — Click & Collect order details: replace order reference with customer email (#1261)"
audience: [dev, product]
type: spec
status: approved
version: "1.0.0"
updated: 2026-10-24
visibility: internal
summary: Replace the redundant order reference on the Click & Collect details card with the customer's email address, as the order reference is already prominently shown at the top of order pages. Issue 1261.
tags: [orders, click-collect, checkout, email, staff]
---

# Plan — Click & Collect order details: replace order reference with customer email (#1261)

Issue `#1261`, following user request on 2026-10-24.

## Problem & Motivation

On Click & Collect order pages (`/staff/orders/[orderNumber]`, `/checkout/[orderNumber]`, and `/account/orders/[orderNumber]`), the order reference number (e.g. `AHE-20261024-EP9BXZ`) is already prominently displayed at the top of the page.
Displaying `ORDER REFERENCE` again inside the Click & Collect details card in `OrderAddressCard` is redundant. Instead, staff and customers benefit from seeing the customer's email address in that slot for verification and contact purposes.

## Scope & Technical Design

1. **`components/orders/OrderAddressCard.tsx`:**
   - Update component signature to accept `customerEmail?: string | null` (and retain optional `orderNumber?: string` for non-breaking interface compatibility).
   - In Click & Collect mode (`fulfilmentMethod === "COLLECTION"`), remove the `Order Reference` section.
   - When `customerEmail` is provided, render `Email` between `Customer Name` and `Contact Phone`.

2. **Integration across order pages:**
   - `app/(admin)/staff/orders/[orderNumber]/page.tsx`: pass `customerEmail={order.buyerEmail}`.
   - `app/(storefront)/account/orders/[orderNumber]/page.tsx`: pass `customerEmail={order.customerEmail ?? session.user.email}`.
   - `app/(storefront)/checkout/[orderNumber]/page.tsx`: pass `customerEmail={order.customerEmail ?? session?.user?.email}`.

3. **Repository & Service Layer (`lib/repositories/orders.ts`):**
   - In `OrderSummary`, declare `customerEmail: string | null`.
   - In `findOrderForViewer`, select `guestEmail` and `user.email` to resolve `customerEmail`.
   - In `findOrderForUser`, resolve `customerEmail`.
   - In `findOrderForStaff`, populate `customerEmail` alongside `buyerEmail`.

4. **Testing & Validation:**
   - Update `tests/ui-checkout-improvements.test.tsx` to assert Click & Collect renders `Email` and no longer displays `Order Reference`.
   - Verify `tests/orders.test.ts`.
   - Run full lint, typecheck, format check, KMS validation, and SDD preclear.
