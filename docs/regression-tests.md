---
id: regression-tests
title: Manual Regression Test Register
audience: [dev]
type: doc
status: approved
version: "1.1.0"
updated: 2026-08-17
visibility: internal
summary: Manual regression test cases for known critical issues — the hybrid Prisma client contract under Cloudflare Worker connection limits, and cart persistence across a cancelled Stripe checkout.
tags: [regression, testing, prisma, cart, checkout]
related: [p6-7-closeout-promotion-plan]
---

# Manual Regression Test Register

This document records essential manual and automated test cases designed to prevent regressions for
known critical issues.

> **Provenance.** Written during the ungated period after PR #182 and originally committed as
> `specs/Validation.md` — a top-level path that had no front-matter, never reached
> `ARTIFACT_INDEX.md`, and whose name collided conceptually with every slice-local `validation.md`
> under `specs/<date-feature>/`. It never failed CI because `kms:validate` reports missing
> front-matter as a warning, not a failure. Moved here and given front-matter during P6.7's
> closeout; content is otherwise unchanged apart from the verification notes below.

## 1. Prisma Connection Limit & Database Pool Regressions

**Background:**
The application connects to a Neon Serverless Postgres database. The system uses two different
Prisma clients (hybrid architecture) due to Cloudflare Worker connection limits.

- **HTTP Client (`getPrisma()`)**: Stateless, used for reads. Cannot do transactions.
- **WebSocket Client (`getPrismaWs()`)**: Stateful, used for writes and `$transaction` blocks.

If mutations accidentally use the HTTP client, or if connection limits are hit due to a
misconfiguration, "Error 1102" or Prisma timeout errors will occur under load.

### Test Case: Rapid Cart Mutation

- **Action:** Open a product page and click "Add to Cart" 10 times in rapid succession.
- **Expected Result:** The cart quantity updates correctly without `Server Error` or
  `500 Internal Server Error`.
- **Failure Condition:** The system throws an error on the 4th or 5th click. This indicates that the
  WebSocket Prisma driver connection pool limit has been breached or the transaction block was
  rolled back incorrectly.

### Test Case: Cart Item Quantity Update

- **Action:** Go to the Cart drawer/page. Change the quantity of an item using the (+) and (-)
  buttons rapidly.
- **Expected Result:** The quantity is updated in the database, and the UI reflects the exact final
  number. No errors.
- **Failure Condition:** The screen displays an error or the quantity reverts to the previous amount.

> **Last verified:** 2026-08-17 on staging (P6.7 closeout smoke pass). Four rapid (+) increments
> applied cleanly — quantity settled at 5, subtotal £16.45, no 500s and no reverts.

---

## 2. Cart Disappearance / Persistence Regressions

**Background:**
When a user clicks "Proceed to Checkout", the system converts the pending `Cart` items into a
`PENDING_PAYMENT` Order and clears the shopping cart to prepare for the Stripe session. If the user
hits "Back" from the Stripe Checkout page, they used to lose their items.

### Test Case: Cancel Checkout Flow

- **Action:**
  1. Add several items to the cart.
  2. Click "Proceed to Checkout".
  3. Wait to be redirected to the Stripe Payment page.
  4. Once on the Stripe page, click the "Back to Aheed Store" link (or use the browser's Back
     button).
- **Expected Result:** The user is redirected back to the `/cart` page (or homepage). The items
  previously in the cart are successfully restored to the cart, and the `PENDING_PAYMENT` order is
  marked as `CANCELLED`, freeing up reserved inventory.
- **Failure Condition:** The user is brought back to an empty shopping cart.

> **Last verified:** 2026-08-17 on staging (P6.7 closeout smoke pass). Order
> `AHE-20260817-3V492G` (£19.94) reached Stripe Checkout (`cs_test_…`, Sandbox); the back arrow
> returned to `/cart` with all 5 items and £16.45 intact. A direct DB read then confirmed the order
> `status: "CANCELLED"` and the product's `Inventory.quantity` restored to its pre-checkout value
> of 24 — so the reservation is genuinely released, not just visually restored.

---

## Tracking and GitHub Issues

When adding new features that interact with `Cart` or `Order` entities, ensure these test cases are
run. If an issue occurs, reference this file and the underlying architecture defined in `CLAUDE.md`.
