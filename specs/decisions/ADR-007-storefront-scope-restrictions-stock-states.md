---
id: adr-007-storefront-scope-restrictions-stock-states
title: "ADR-007 — Storefront scope, restricted products and explicit stock states"
audience: [dev, architect, product]
type: adr
status: approved
version: "1.0.0"
updated: 2026-10-22
visibility: internal
summary: Owner rulings of 2026-10-22 on #1196 and #1200. The platform is a storefront, not stock management; a client catalogue is imported whole but hidden; age-restricted and lottery lines are hard-blocked, other restricted lines need an audited admin override; stock has three explicit purchase states and unknown never means available.
tags: [adr, catalogue, import, compliance, stock, restrictions]
related: [adr-004-multi-tenancy, architecture]
---

# ADR-007 — Storefront scope, restricted products and explicit stock states

## Context

A new client's stock export (`docs/StockList.xls`, 6,167 rows) raised two owner-gated questions,
filed by the eleventh Discover pass:

- **`#1196`** — whether the platform is sold as inventory and stock management. The schema holds no
  cost, VAT, supplier or stock-movement model.
- **`#1200`** — the export contains 27 age-restricted lines (TOBACCO 26, ALCOHOL 1) and 24 lines
  that are not deliverable physical goods (PHONE CARDS 15, NEWS 5, E-PAY 1, INSTANT LOTTERY 1,
  STAMPS 1). The platform has no age, licensing or per-product fulfilment control.

`#1200` recommended excluding these lines at import. The owner ruled differently on 2026-10-22, and
also ruled on how stock should behave for a client that does not track it in this platform.

## Decision 1 — Storefront, not stock management (`#1196`)

The platform is **not** sold as a stock-management product. It may become a future feature; today it
is not. **`#1196` closes as its option 1.** Cost price, supplier, case size, reorder levels and stock
movements are not modelled. Nothing in this ADR adds them, and nothing may add them as inert columns
(`#1196` option 3, rejected).

## Decision 2 — Import everything, hidden (`#1200`, `#1201`)

A client catalogue import **preserves every row**, including restricted, suspicious and
non-deliverable lines. That reverses `#1200`'s exclusion recommendation. Importing a product never
makes it visible or purchasable:

1. **Every imported row is created hidden** (`isActive = false`), clean rows included. Admins review
   and enable products selectively.
2. **Rows that are restricted, or whose status is uncertain, are also tagged with a restriction.**
3. **A re-import never activates a product, never clears or loosens an existing restriction, and
   never changes stock state or quantity.** It may tighten a restriction (for example to
   `AGE_RESTRICTED`), and tightening also hides the product.

"Imported", "visible" and "purchasable" are three separate states:

- **Imported** means the row exists.
- **Visible** means `isActive` is true.
- **Purchasable** means visible, with no restriction, and a stock state that permits a sale
  (Decision 4).

## Decision 3 — Restriction classes: hard block versus admin override

| Restriction | Examples | Can anyone enable it? |
| --- | --- | --- |
| `PROHIBITED` | INSTANT LOTTERY | **No.** Hard block, no override path, no confirmation. |
| `AGE_RESTRICTED` | TOBACCO, ALCOHOL | **No.** Hard block until age verification and a record of the check exist (`#1200` option 2, its own `/propose`). |
| `NOT_DELIVERABLE` | STAMPS, PHONE CARDS, NEWS, E-PAY | **ADMIN only**, after explicitly confirming the product is legally sellable **and can be fulfilled**, with a reason. Otherwise it stays blocked. |
| `NEEDS_REVIEW` | `DEFAULT` department, £0.00 price, anything uncertain | **ADMIN only**, after the same confirmation and a reason. |
| none | — | STAFF or ADMIN, as today. |

- **Enabling an overridable product clears its restriction in the same write**, and appends an audit
  row naming the acting user, the time and the reason.
- **A confirmation dialog never overrides a hard block**, and STAFF can never enable any restricted
  product.
- **Bulk actions apply exactly the same rule to each product as a single update does.**
- **Setting or tightening a restriction is ADMIN-only, always allowed, and hides the product.**
- **The rule `restriction IS NOT NULL ⇒ isActive = false` is enforced by a database `CHECK`**, not
  only by the application.

The department names that map to each class are **per-client import policy, supplied to the
importer** — never hardcoded into the platform (ADR-004).

## Decision 4 — Explicit stock states for storefront purchasing

Stock affects only whether a shopper may buy. It is represented explicitly by `Inventory.stockMode`:

| State | Purchasing |
| --- | --- |
| `UNTRACKED` | Allowed without a quantity check, subject to every other eligibility and restriction rule. A cart line is still capped at `MAX_ADD_QUANTITY`. No quantity is decremented or restored. |
| `TRACKED`, quantity > 0 | Allowed, under the existing cart, checkout and oversell guard. |
| `TRACKED`, quantity ≤ 0 | Blocked. |
| `UNKNOWN`, or no `Inventory` row | **Blocked. Availability is never assumed.** |

- **One pure function decides purchasability for the cart, the checkout render and `placeOrder`.**
  No call site re-derives it.
- **Imported products are created `UNKNOWN`.** Existing products were migrated to `TRACKED`, because
  that is how they already behaved.
- **A product's stock state never changes as a side effect**; only an explicit staff edit changes it.

## Consequences

- **`#1201`'s importer must write through the import-policy module this ADR introduces** (`#1211`).
  It stays blocked on the client's answers about opening stock, barcode/supplier columns, and
  `DEFAULT`/£0.00 rows.
- **`#1199`'s VAT scope narrows** to what a storefront needs.
- **Selling age-restricted goods remains impossible on this platform** until `#1200` option 2 has
  its own approved proposal. Lottery is not sellable at all.
- **There's still no stock history.** The restriction audit log is not a stock ledger, and must not
  grow into one without revisiting Decision 1.
