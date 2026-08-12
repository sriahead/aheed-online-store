---
id: p6b1-catalogue-writes
title: "P6b1 — Catalogue management: product, category & inventory writes (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-12
visibility: internal
summary: The first admin write path to the catalogue — product, category and inventory create/edit inside P6a's panel, turning two read-only repositories into read/write ones so the owner can run the shop without a developer and a re-seed.
tags: [p6, admin, staff, catalogue, products, categories, inventory]
related: [adr-004-multi-tenancy, architecture, p6a-admin-shell-orders, p5b-discount-codes]
---

# P6b1 — Catalogue management: product, category & inventory writes (plan)

**Goal:** the owner can add a product, correct a price, rename a category and mark something out of
stock — from the browser, without a developer, a code change or a re-seed. Today there is **no admin
write path to the catalogue at all**: `Product`, `Category` and `Inventory` rows exist only because
`prisma/seed.ts` created them, and `lib/repositories/products.ts` and `categories.ts` are read-only —
every exported method is a query. This slice adds the first `create`/`update` to either, and is what
stands between P6a's panel and an owner who can actually run the shop.

It is the first of two P6b slices, split at Propose (#159, #167). This one is the write path to the
catalogue **data**; the image upload half is **#167 (P6b2)**, separated because it is the only part
of P6b that is new *infrastructure* — the first write through `lib/storage`, the first request the
Worker signs at runtime, the first browser-upload component — and the only part blocked on
provisioning the owner must do (bucket CORS, `S3_*` in the Worker's runtime secret set). Everything
here is a vendor-scoped DB form in the shape `/staff/discounts` (P5b) and `/staff/loyalty` (P5a)
already proved, so the catalogue becomes editable even if that provisioning stalls.

**No schema change and no migration.** Every field this slice writes already exists — `Product` has
carried `slug`, `basePrice`, `originalPrice`, `unitLabel`, `origin`, `isHalal`/`isFresh`/`isOrganic`
and `isActive` since P2.5b1, and `Inventory` has carried `quantity`/`lowStockThreshold` since P2.
What was missing was never the columns; it was a way to write them.

**Scope (this slice):**

- **`lib/catalogue-form.ts`** — a pure, DB-free, unit-tested module holding every field rule:
  slug derivation and normalisation, pence parsing, and the cross-field checks (`originalPrice`
  must exceed `basePrice` or be absent; `quantity` and `lowStockThreshold` are non-negative
  integers). Same posture as `lib/staff-orders-query.ts` (P6a) and `lib/shopping-list.ts` (P3d):
  the decisions live where a test can reach them without a database.
- **Write functions on the two catalogue repositories**, taking `vendorId` as an explicit argument
  exactly as `createCodeForVendor` does — never reading it from the submitted form. `products.ts`
  gains create/update plus an admin-side list and by-id read (the storefront's `getBySlug` filters
  `isActive: true`, so it structurally cannot load the deactivated product the owner needs to
  edit). `categories.ts` gains the same shape.
- **`features/admin/catalogue.ts`** — the server actions, each re-running `requireVendorRole`
  itself. A server action is a public endpoint at a stable id, so the page's gate protects the
  page, not the action; this is the posture P4b, P5a and P5b all take.
- **Five pages** under P6a's existing `(admin)` route group: `/staff/products` (list),
  `/staff/products/new`, `/staff/products/{id}`, `/staff/categories` (list + create) and
  `/staff/categories/{id}`. Admin routes key on **`id`, not `slug`** — this slice makes a slug
  editable for the first time, and a URL that changes when you rename the thing it points at is a
  bug waiting to happen. `/staff/orders/{orderNumber}` keys on an immutable number for the same
  reason.
- **Inventory lives on the product form**, not a page of its own: `Inventory` is 1:1 with `Product`
  and there is nothing to say about stock that isn't about a product. Creating a product creates
  its `Inventory` row **in the same transaction**, so `inventory` is never null — today
  `Inventory?` is optional and every reader compensates with `p.inventory?.quantity ?? 0`.
- **`PanelNav` and the `/staff` landing page gain a Catalogue entry**, the same courtesy-not-a-gate
  treatment P6a gave the other links.

**Decisions taken at Propose, recorded here so they aren't re-litigated:**

- **Deactivate only — no delete action ships, for either model.** `isActive` already exists on both
  and is already filtered by every storefront query, so the capability is there; a hard delete is
  unsafe regardless, because `Product` is referenced by `OrderItem`, `CartItem` and `Review` and
  would either fail on the foreign key or destroy order history. Same posture P5b took for discount
  codes: deactivate and replace, never mutate the past.
- **Deactivating a category with active products or active children is refused**, with a message
  naming what is in the way. The rejected alternative was cascading the deactivation down — one
  click silently rewriting an unbounded number of rows the owner never saw is the wrong default,
  and there is no undo. The refusal makes the owner do the two-step deliberately.
- **A category's parent must itself be top-level**, capping the tree at two levels. This is not a
  new restriction — `listTopLevel()` + `getBySlug()`'s single `children` fetch is the only shape
  the storefront can render — and enforcing it structurally means a cycle (a category as its own
  ancestor) is unrepresentable rather than merely guarded against.
- **The whole surface is ADMIN-only**, matching `/staff/loyalty` and `/staff/discounts`. Prices and
  the product catalogue are owner decisions.

**The two things most likely to go wrong, and how the design answers them:**

1. **`categoryId` arrives from the form, and forms are untrusted.** A vendor A admin submitting a
   vendor B category id must not create a cross-vendor row — `Product.categoryId` has no vendor in
   its foreign key, so nothing in the schema stops it. The write resolves the category **scoped to
   the acting vendor** and fails if it doesn't match, the same defence P3d used for its untrusted
   review-form product ids.
2. **`@@unique([vendorId, slug])` is a real collision surface** now that a human types slugs. A
   duplicate must surface as a field error on the form, not a `P2002` escaping as a 500. The
   `isUniqueViolation` helper currently private to `lib/repositories/discounts.ts` is **extracted
   and shared** rather than copied — reuse before create.

**Deliberately excluded:**

- **Product image upload — #167 (P6b2).** The product form displays existing `ProductImage` rows
  read-only; no upload control, no `StorageService` change, and `lib/storage.ts` is untouched.
- **Delete of any kind**, for products, categories, inventory or images (see above).
- **Bulk actions** — bulk price or stock edits, bulk activate/deactivate. #162 already tracks bulk
  order actions and notes that a bulk compare-and-set is a different concurrency problem; the same
  is true here.
- **A STAFF-visible stock-only surface.** A packer finding an empty shelf is arguably the right
  person to mark it out of stock, but that is a different form with a different role gate, not a
  weakening of this one. Filed as an issue at build-notes rather than assumed.
- **Review moderation, customer directory (#160) and reports (#161)** — all previously deferred out
  of P6, unchanged by this slice.
- **A `sku` field.** `Product` has none, and earlier notes referring to `products/{sku}/...` were
  describing something that does not exist. This slice does not add one; #167 keys images on the
  immutable `productId` instead.
- **Category reordering by drag**, and any change to `sortOrder`'s meaning — the field is editable
  as a plain number, nothing more.
- **Search and filtering on the admin product list.** It is keyset-paginated like every other list
  in this repo, and nothing more. `/staff/orders` got `?status=`/`?q=` in P6a because a packing
  queue is worked every day against hundreds of rows; a catalogue of this size is a few pages.
  Filed as an issue at build-notes rather than assumed — and #163 already records that the search
  shape this repo keeps reaching for wants `pg_trgm`, which needs `$queryRaw` and is forbidden in
  application code.
- **Reconciling live carts and pending orders against an edited product.** Deactivating or
  re-pricing a product does not touch `CartItem` or `OrderItem`, and it does not need to: `P3b`
  snapshots price onto `OrderItem` at checkout, so no past order re-prices, and `CartItem`
  deliberately stores no price and re-reads the product at render time. A shopper may find an item
  has changed or gone between adding it and checking out, which is the correct behaviour for a
  grocery shop, not a defect this slice must prevent.

**Open items carried forward:**

- **#167 (P6b2)** — image upload, and its two owner-provided prerequisites: bucket CORS allowing
  `PUT` from the vendor origins, and `S3_ACCESS_KEY`/`S3_SECRET_KEY` in the Worker's runtime secret
  set (`wrangler secret put --env <env>`, a different store from `secrets/*.vars`). Neither blocks
  this slice, which is why it goes first.
- **#163** — the staff order search is an unindexed scan; the product list this slice adds has the
  same shape and the same eventual `pg_trgm` wall. Not re-filed, and not a problem at a catalogue
  of this size.
