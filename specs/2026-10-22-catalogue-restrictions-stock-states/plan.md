---
id: catalogue-restrictions-stock-states-plan
title: "Catalogue safety layer — restrictions, explicit stock states, bulk review, audit (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-22
visibility: internal
summary: "#1211, before #1201's import: product restrictions (hard block vs audited admin override, DB CHECK that restricted means hidden), explicit TRACKED/UNTRACKED/UNKNOWN stock states behind one purchasability function, bulk review on /staff/products, and an all-hidden import policy."
tags: [spec, catalogue, import, compliance, stock, restrictions, staff, p11]
related: [adr-007-storefront-scope-restrictions-stock-states, adr-004-multi-tenancy, architecture]
---

# Catalogue safety layer — restrictions, explicit stock states, bulk review, audit (plan)

Issue **`#1211`**. Owner rulings: **`specs/decisions/ADR-007-storefront-scope-restrictions-stock-states.md`**
(Gate 1, 2026-10-22). This file is the spec; the ADR is the standing decision. If they disagree, the
ADR wins and this file is wrong.

**Goal:** make it impossible for a client catalogue import to publish, or make purchasable, a
product that is restricted, uncertain or of unknown stock. Shipping this slice unblocks `#1201`'s
importer on the safety side; `#1201` stays blocked on the client's answers.

## Gate 1 assessment, updated after the owner's rulings

What exists today (measured 2026-10-22 on `staging` at `2e35710`):

- **Visibility and purchasability share one boolean, `Product.isActive`** (`@default(true)`). It is
  checked in three separately written places:
  - the cart (`lib/repositories/cart.ts:273`, and `stockMap` at `:305`);
  - checkout (`lib/repositories/orders.ts:258`);
  - bundles (`lib/repositories/bundles.ts:99`).
- **Stock is an implicit two-state value.** `effectiveStock()` (`lib/cart-rules.ts:20`) maps a
  missing `Inventory` row or a quantity ≤ 0 to 0. Three storefront mappers re-derive `inStock` as
  `(inventory?.quantity ?? 0) > 0` instead of calling it (`lib/repositories/products.ts:663, 1491,
  1772`). So the "consistent rule" the owner asked for does not exist yet. There are four
  derivations.
- **STAFF and ADMIN can both set `isActive`**, through the product form
  (`features/admin/catalogue.ts`) and the inventory quick toggle
  (`app/(admin)/staff/inventory/actions.ts` → `quickUpdateInventory`). Neither path has a
  restriction concept.
- **There's no bulk product action.** The precedent is orders' `advanceStatusBulk`
  (`features/orders/advance-status-bulk.ts`), a checkbox form.
- **The only audit table is `VendorRoleAuditLog`.**
- **No importer exists.** `#1201` is blocked.

The **gaps** that genuinely need a change, and nothing else:

1. **No way to mark a product restricted.** There's also no rule separating a hard block from an
   admin override.
2. **No explicit stock state.** `UNTRACKED` cannot be represented, and "unknown" is only implicit
   (no `Inventory` row).
3. **Purchasability is derived in four places.**
4. **No bulk review on `/staff/products`.**
5. **No audit trail for a restriction decision.**
6. **No import-time policy** that the importer can be held to.

## How untracked stock is represented — decided here, before code

**On `Inventory`, as a new non-null enum `Inventory.stockMode`: `UNKNOWN | TRACKED | UNTRACKED`.**
"No `Inventory` row" is also read as `UNKNOWN`.

- **Why `Inventory`, not `Product`:** it is a stock fact, and `Inventory` is where every stock read
  already goes. On `Product` it would sit beside `isActive` and invite confusion with visibility.
- **Why three values and not a boolean `isTracked`:** the owner ruled that unknown must be blocked
  and must be *explicit*. A boolean has no third state, and "no row" alone is implicit.
- **The database default is `UNKNOWN`,** so any future code path that creates an `Inventory` row
  without choosing a mode produces a blocked product, never an available one.
- **The migration gives every existing row `TRACKED`,** which is exactly how those rows behave
  today: purchasable iff quantity > 0. It does this with
  `ADD COLUMN … NOT NULL DEFAULT 'TRACKED'`, then `ALTER COLUMN … SET DEFAULT 'UNKNOWN'`. It is
  pure DDL, atomic, and has no `UPDATE`.
- **Every existing code path that creates an `Inventory` row from a staff-entered quantity**
  (`createProductForVendor`, `updateProductForVendor`'s upsert, `quickUpdateInventory`'s upsert
  create branch, `prisma/seed.ts`) **passes `stockMode: "TRACKED"` explicitly.** Typing a quantity
  is tracking, so current behaviour is preserved.
- **`quantity` keeps its meaning only under `TRACKED`.** It is ignored under the other two modes,
  and is not cleared when the mode changes, so switching back to `TRACKED` restores the last count.

**One pure function decides purchasability** (`lib/cart-rules.ts`):

```
purchasableQuantity({ isActive, restriction, inventory: { stockMode, quantity } | null }) -> number
  restriction != null            -> 0
  !isActive                      -> 0
  inventory null / UNKNOWN       -> 0
  TRACKED                        -> max(quantity, 0)
  UNTRACKED                      -> MAX_ADD_QUANTITY  (99, the existing per-add cap, used as the line cap)
```

`effectiveStock()` is **deleted**. Every caller moves to `purchasableQuantity()` or to `stockModeOf()`
(below). After that there is nothing else to call, and a guard test fails if a quantity comparison
is reintroduced.

- **The cart and `placeOrder`** call it for every line.
- **`placeOrder`'s decrement runs only for `TRACKED` lines,** and its `WHERE` gains
  `stockMode: "TRACKED"`, so a mode switched mid-checkout reads as "just sold out", never as an
  oversell.
- **The two cancellation paths that restore stock** (`orders.ts:626`, `:1973`) also gain
  `stockMode: "TRACKED"`, so an untracked product's ignored quantity is never incremented.
- **Known edge:** a product switched from `UNTRACKED` to `TRACKED` between the read and the commit
  of one checkout is sold without a decrement. That's one order, the same exposure any read-then-act
  has, and is accepted rather than adding a lock to every untracked line.

**Storefront display:**

- The product DTOs gain `stockMode`, and `inStock` becomes `purchasableQuantity(...) > 0`.
- "Only N left" and the low-stock badge render **only under `TRACKED`**, so an untracked product
  never claims "Only 99 left".
- The `inStockOnly` filter becomes
  `inventory: { OR: [{ stockMode: UNTRACKED }, { stockMode: TRACKED, quantity: { gt: 0 } }] }`.
  The `OR` is nested in the relation filter, never top-level (`architecture.md` "Composing `where`
  fragments").
- The staff low-stock report counts **`TRACKED` rows only**.

## Hard block versus admin override — the explicit rules

`Product.restriction`: nullable enum `PROHIBITED | AGE_RESTRICTED | NOT_DELIVERABLE | NEEDS_REVIEW`.
Their severity runs in that order, highest first.

**Invariant (database `CHECK "Product_restricted_inactive_check"`):**
`NOT ("isActive" AND "restriction" IS NOT NULL)`. A restricted product is hidden, whatever the
application does.

**Enabling a product** (setting `isActive = true`) is decided by one pure function,
`decideEnable({ restriction, actor, confirmed, reason })` in `lib/product-restriction.ts`. `actor` is
`"STAFF"` or `"ADMIN"`; a platform admin counts as `"ADMIN"`.

| restriction | actor STAFF | actor ADMIN, not confirmed or no reason | actor ADMIN, confirmed + non-blank reason |
| --- | --- | --- | --- |
| none | `ENABLE` | `ENABLE` | `ENABLE` |
| `NEEDS_REVIEW` | `REFUSED: ADMIN_ONLY` | `NEEDS_CONFIRMATION` | `ENABLE_CLEARING` |
| `NOT_DELIVERABLE` | `REFUSED: ADMIN_ONLY` | `NEEDS_CONFIRMATION` | `ENABLE_CLEARING` |
| `AGE_RESTRICTED` | `REFUSED: HARD_BLOCK` | `REFUSED: HARD_BLOCK` | `REFUSED: HARD_BLOCK` |
| `PROHIBITED` | `REFUSED: HARD_BLOCK` | `REFUSED: HARD_BLOCK` | `REFUSED: HARD_BLOCK` |

- **`ENABLE_CLEARING`** sets `restriction = null` and `isActive = true` in one conditional write
  (`WHERE restriction = <the restriction the admin confirmed>`). It appends an audit row
  `RESTRICTION_CLEARED` with the actor and reason. If the restriction changed since the admin's
  page loaded, the write matches nothing and the product is reported as skipped, never enabled.
- **The confirmation text the admin ticks** is: "I confirm this product is legally sellable by this
  store and can be fulfilled by its delivery or collection service." For `NOT_DELIVERABLE` that is
  the owner's "remain blocked where they cannot be fulfilled": no tick, no enable.
- **Setting a restriction** (`decideSetRestriction(from, to, actor)`):
  - ADMIN only.
  - Allowed only when `to` is at least as severe as `from` (or `from` is null), so it can **never
    loosen**. Loosening exists only as `ENABLE_CLEARING`, which refuses the hard blocks.
  - It sets `isActive = false` in the same write and appends `RESTRICTION_SET` (from, to, actor,
    reason optional).
  - Consequence: an `AGE_RESTRICTED` or `PROHIBITED` product cannot be released by any path in the
    application, which is the owner's ruling. Correcting a mis-tag is a developer data fix, outside
    this slice.
- **Disabling** is unaffected: STAFF or ADMIN, any product, no audit row, no restriction change.
- **The same functions decide every path:**
  - the product form's `isActive` checkbox;
  - the inventory quick toggle;
  - a new "clear and enable" control on `/staff/products/[id]`;
  - every row of a bulk action.

  The repository layer independently refuses `isActive = true` on a restricted product, and the
  `CHECK` refuses it again below that. That's three layers, so a missed call site fails closed.

## Bulk actions on `/staff/products`

These extend the existing list page; there's no new route and so no nav registration.

- **Row checkboxes plus "select all on this page".** A `perPage` choice of 25 (default) or 100 makes
  reviewing 6,167 imported rows practical.
- **Three actions:** **Enable**, **Disable**, **Mark stock untracked**.
- **Two steps.** *Preview* returns a per-product plan from `planBulkAction(...)`. The UI then shows:
  - how many products will update;
  - a **warning block listing every restricted product by name and class**, separated into
    "hard-blocked — will be skipped" and "restricted — will be enabled only if you confirm";
  - for ADMIN, the confirmation checkbox and a required reason field when any overridable product
    is selected.

  *Apply* **recomputes the plan from the database**; the preview is never trusted.
- **The summary afterwards** lists updated, skipped (with the reason) and failed products, by name.
- **Mark stock untracked** creates missing `Inventory` rows (`stockMode UNTRACKED`, quantity 0) and
  updates existing ones. It never touches `isActive` or `restriction`, so it can never publish
  anything. STAFF or ADMIN.
- **Writes run on `getPrismaWs()` in one interactive transaction:** `updateMany`/`createMany` crash
  over HTTP (CLAUDE.md, `#382`).

## Audit

New `ProductRestrictionAuditLog`, modelled on `VendorRoleAuditLog`. Fields:

- `id`, `vendorId`;
- `productId` (FK `Restrict`; no application path deletes products);
- `action` (`RESTRICTION_SET | RESTRICTION_CLEARED`);
- `fromRestriction?`, `toRestriction?`;
- `actorUserId?` (FK `SetNull`; null means written by an import);
- `source` (`PRODUCT_FORM | BULK_ACTION | IMPORT`);
- `reason?`, `createdAt`;
- `@@index([vendorId, productId, createdAt])`.

**It is append-only by construction:** the repository exports only `create` and `list` functions,
and a guard test fails on any `update`, `upsert` or `delete` of the model anywhere in the
application. `/staff/products/[id]` shows the newest 20 entries for that product.

## Import policy (the contract `#1201` must use)

`lib/catalogue-import-policy.ts` holds pure functions and does no I/O.

- **`classifyImportRow(row, policy)`** gives a row its restriction:
  - from a **per-client** policy, a map `department → restriction` compared case- and
    whitespace-insensitively;
  - otherwise `NEEDS_REVIEW` when the price is ≤ 0 or the department is in the policy's
    `uncertainDepartments` (e.g. `DEFAULT`);
  - otherwise `null`.
  - The stricter of the results wins.
- **`newImportedProductState(restriction)`** always returns `isActive: false`, the restriction, and
  `stockMode: "UNKNOWN"`. A clean row is hidden too (owner ruling B).
- **`reimportedProductState(existing, incoming)`:**
  - `isActive` is never set true (it may only go false);
  - the restriction becomes the stricter of the two, so it never clears or loosens;
  - an incoming `NEEDS_REVIEW` is not re-applied over `null`, because a human may already have
    reviewed it;
  - tightening forces `isActive: false`;
  - no stock fields are returned, so a re-import cannot change stock.
- The policy **values** for this client (the seven departments in `#1200`, plus `DEFAULT`) are
  `#1201`'s input, not platform code (ADR-004). The tests carry them as a fixture.

## Scope

1. A schema change plus one hand-authored migration (`#895` blocks `migrate dev`) covering:
   - two enums and their columns;
   - the audit model plus its two enums;
   - the `CHECK`.
2. `lib/cart-rules.ts`: `purchasableQuantity`, `stockModeOf`; `effectiveStock` removed; every
   caller migrated.
3. `lib/product-restriction.ts` (pure rules) and `lib/repositories/product-restrictions.ts`
   (writes, audit), with a sibling service facade.
4. Server actions in a new `"use server"` module (async exports only); state constants in a plain
   module.
5. The product form, the product detail page, the inventory page and the products list page are
   extended.
6. `lib/catalogue-import-policy.ts`.
7. Tests, a DB verification script, the operator guide update, and `specs/architecture.md`.

## Deliberately excluded

- **The importer itself.** That's `#1201`, which stays blocked on the opening-stock,
  barcode/supplier and `DEFAULT`/£0.00 answers.
- **Age verification, licensing, a record of an age check, or per-line fulfilment routing.** That's
  `#1200` option 2, which needs its own `/propose`. Until it ships, `AGE_RESTRICTED` is a hard block.
- **Any stock management:** movements, stocktake, cost, supplier, reorder, or a stock audit.
  ADR-007 Decision 1.
- **Shopper-facing copy about restrictions.** A restricted product is simply not shown.
- **"Apply to every product matching this filter"** across pages. Bulk works on a selection of at
  most 100 visible rows; a wider action is a follow-up if the review proves slow.
- **Releasing a mis-tagged hard-blocked product** in the app (a developer data fix, as above).
- **Bulk "set restriction".** Tagging is per-product on the detail page; the importer tags at scale.

## Open items carried forward

- `#1201` must route every create and re-import through `lib/catalogue-import-policy.ts`. This is
  recorded on `#1201` as a requirement.
- `#1200` closes when this slice reaches production. Option 2 stays a future `/propose`.
- `#1196` closes on the owner's ruling (ADR-007 Decision 1); its decomposition is not needed.
