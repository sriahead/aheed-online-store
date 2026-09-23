---
id: p876-expected-restock-date
title: "P876 — Expected Restock Date on Out-of-Stock Products (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-23
visibility: internal
summary: Staff can record when an out-of-stock product is expected back, and shoppers see "Back in stock" with that date on the card, quick view and product page until it passes. Also fixes the product-create path (#878).
tags: [inventory, stock, catalogue, storefront, staff-panel]
related: [architecture]
---

# P876 — Expected Restock Date on Out-of-Stock Products (plan)

The narrative: why this slice exists, what it proves, and where its edges are. `requirements.md`
holds the checkable acceptance criteria. This file holds the reasoning behind them.

**Goal:** a shopper who finds a product out of stock can see when it is expected back, and the staff
member who knows that date can record it on the product form they already use. As a prerequisite,
the product-create path this form submits through is moved onto the client it must use (#878).

## Where this came from

`#400` asked for three things: per-store stock counts, an expected restock date, and asynchronous
loading of the stock badge. At `/propose` (2026-09-23) it was split. Per-store counts stay on `#400`,
blocked on `#422` (whether Aheed trades from more than one site). The other two were moved here.

At `/spec` the same day, the async half was **dropped on measurement**. `#400` justified it by saying
storefront HTML is edge-cached, so a server-rendered count is stale by construction. It is not.
Production and staging were both measured (`/`, two category pages, `/search?q=rice`): every
response carries `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, with no
`cf-cache-status` and no `Age` header. Storefront pages render per request, so the stock count is
already fresh at render time. Moving it to a second request would add a fetch per grid and a
layout-shift risk and fix nothing. The measurement is recorded on `#876` and `#400`. If storefront
edge caching is ever deliberately switched on, async stock becomes a real fix again and should be
re-proposed against that change.

## Scope (this slice)

**1. Prerequisite: the product-create client (#878).** `lib/products-service.ts`'s
`createProductForVendor` passes `getPrisma()` (HTTP) to a repository function that performs a
singular `product.create` with a **nested** `inventory: { create }`. `CLAUDE.md` says that shape
opens an implicit transaction and crashes through `getPrisma()` (measured under #116, 2026-09-18,
after this call site was wired). Its sibling `updateProductForVendor` already uses `getPrismaWs()`.
This slice adds a field to that nested create, so the create path must work for the slice to be
verifiable. Build **reproduces first** and records the real pre-fix outcome in `build-notes.md`,
then switches the call to `getPrismaWs()`. If the reproduction does **not** crash, the switch still
happens, because the rule is about transaction shape, not observed failure. But the non-crash is
evidence against a `CLAUDE.md` rule, and Build records it and flags it for a separate issue rather
than silently moving on.

**2. Schema.** `Inventory.expectedRestockDate DateTime?`, nullable, additive. It stores a
**calendar day**, not an instant: the UTC midnight of the vendor-local day, exactly the convention
`Order.fulfilmentDate` uses since #811, read and written through the existing helpers in
`lib/local-datetime.ts` (`calendarDayToUtcMidnight`, `calendarDayInZone`). `#400` named the field
`expectedRestockAt`. This slice uses `expectedRestockDate`, because an `…At` name reads as an
instant, and the #811 defect came from treating a day as one. Generated with `--create-only` and
read before applying, because Prisma has proposed dropping the hand-authored `pg_trgm` indexes on
every migration since #508.

**3. Staff write surface.** One optional date input on `components/staff/ProductForm.tsx`, named
`expectedRestockDay`, next to the existing stock-quantity and low-stock-threshold fields. The
`/staff/products` pages already admit `STAFF` as well as `ADMIN` (`requireVendorRole("STAFF",
"ADMIN")`), so this satisfies "staff-editable" without touching `/staff/inventory`.
`lib/catalogue-form.ts`'s `parseProductForm` accepts empty (maps to null) or a real `YYYY-MM-DD`
day, and rejects anything else as a field error. Both write paths store it: the nested create, and
the `inventory.upsert` inside `updateProductForVendor`'s transaction. The edit page prefills it.

**4. Storefront read.** `ProductSummary` gains `expectedRestockDay: string | null` (`YYYY-MM-DD`).
It is built in exactly two places in `lib/repositories/products.ts`: `toProductSummary`, behind every
listing path, and `getProductBySlug`. Both map it from the joined `Inventory` row they already
select. Neither adds a query.

**5. Hiding a date that has passed.** A stale "Back in stock Mon 21 Sep" shown on the 23rd is worse
than no date at all. Deciding "has it passed" needs today in the **vendor's** timezone, which a
client component cannot know (the shopper's clock is not the vendor's, and #363 made the vendor
zone data precisely so the code stops assuming). The repository layer may not read request
context (`tests/repository-purity.test.ts`). So the rule is applied in the request-scoped facade,
`getProductRepository()` in `lib/products-service.ts`, the one place with both. Its four methods
that return `ProductSummary` (`list`, `listByCategory`, `search`, `getBySlug`) pass each summary's
day through a pure helper, `currentRestockDay(day, today)`, with today computed as
`calendarDayInZone(new Date(), timezone)`. The timezone comes from `getCurrentVendorProfile()`,
which is `React.cache`d and already called by the storefront layout, so this costs no query.
`/api/products/quick-view` goes through `getBySlug`, so the quick view is covered too. Every
`ProductCard` consumer (category page, search page, `ProductRow`) gets its data through those
methods. `CategorySpotlight` carries no stock fields and is unaffected.

**6. Display.** The notice renders only when the product is **out of stock** (`inStock === false`)
and `expectedRestockDay` is non-null after step 5. It appears in three places, each where that
surface already says "out of stock" or shows the low-stock line: `ProductCard`,
`QuickViewDrawer`, and the product detail page. The text is `Back in stock ` followed by
`formatRestockDay(day)`, an absolute short date such as "Mon 28 Sep". The exact month
abbreviation is whatever `Intl`'s en-GB data gives, and requirements deliberately don't pin it.
It is formatted with `timeZone: "UTC"` because the value is a day label, not an instant, so the
output cannot shift with the server's or the browser's timezone. Styling uses semantic token
classes only, with no raw hex and no `text-primary/NN` alpha modifier (#649 measured those below
4.5:1).

**7. Operator guide.** `docs/staff-playbook/staff-tabs-guide.md` documents the new field in its
Catalogue section. It also revises the Inventory section's advice, which today says a product that
won't be back soon should be switched off rather than set to zero. With a restock date, "set it to
zero and give the date" becomes the better option for a product that *is* coming back, and the
guide says so. `CLAUDE.md` notes that no test checks a documented capability exists, so this
sentence is traced to the real control in `validation.md`.

## Deliberately excluded

- **Async / uncached stock loading.** Dropped on measurement (see above). Not deferred to another
  issue, because there is nothing to fix until storefront caching exists.
- **Per-store stock counts.** Stays on `#400`, blocked on `#422`.
- **Relative wording** ("today", "tomorrow"). The notice is an absolute date. Relative wording
  would need the vendor-local today on the client, or presentation text in the data shape. Not
  worth either for this slice.
- **Automatic clearing.** Restocking (quantity back above zero) does not clear the date. It doesn't
  need to: the notice only shows while out of stock, and a passed date is hidden. A future-dated
  leftover can reappear if the product sells out again before that date. Staff clear it on the
  form. Recorded here rather than solved.
- **Rejecting a past date on the form.** A past date is harmless, because it's hidden. Rejecting it
  would need the vendor's today inside the otherwise pure form parser.
- **`/staff/inventory` quick edit.** That table edits quantity and availability only. The restock
  date lives on the product form. Adding a column there is a separate UI decision.
- **Cart, checkout, emails, "notify me when back".** Out of stock products can't be added to a cart
  today. A back-in-stock notification is a different feature.
- **Search-suggestion rows** (`ProductSuggestion`) carry only `inStock`, and stay that way.

## Open items carried forward

- If Build's pre-fix reproduction of #878 does **not** crash, that contradicts a `CLAUDE.md` rule
  and becomes its own issue (see Scope 1).
- `#400` stays open for per-store counts, and this slice does not close it.
