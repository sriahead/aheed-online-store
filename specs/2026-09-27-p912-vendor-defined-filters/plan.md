---
id: p912-vendor-defined-filters-plan
title: "#912 — Vendor-defined product filters, with #601's filter-key consolidation (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-27
visibility: internal
summary: Each vendor defines its own pick-from-list product filters (e.g. Colour, Connectivity for SriMart) as data; shoppers filter by them and see them on the product page. Folds in #601 (one filter-key definition) and closes #916 with a live create-path check.
tags: [catalogue, filters, facets, multi-tenancy, p10]
related: [architecture, p905-vendor-product-labels-plan]
---

# #912 — Vendor-defined product filters (plan)

`requirements.md` holds the checkable criteria; this file holds the reasoning. Gate 1 was approved
by the owner on 2026-09-26; the approved scope is recorded as a comment on `#912`.

**Goal:** a vendor that is not a grocer can give shoppers the filters its own catalogue needs
("Colour", "Connectivity" for SriMart's electronics) without a migration or a code change, and a
shopper who filters by one sees the same value on the product they open.

## Why this exists

Every storefront filter beyond price, stock, brand, origin and pack size is a hardcoded grocery
yes/no column (`isHalal`, `isFresh`, `isOrganic`, `isVegetarian`, `isGlutenFree`,
`isHmcCertified`). `#905` let each vendor switch those off; it did not let a vendor add its own.
Adding one today takes a migration plus six code edits (discovery log, 2026-09-07) and the result
shows for every vendor. SriMart, a real electronics tenant, asked for filters that fit its products.

## Scope (this slice)

1. **Schema** — three new vendor-scoped models, one additive migration:
   - `VendorAttribute` — a vendor's filter ("Colour"): `name`, immutable `slug` unique per vendor,
     `sortOrder`.
   - `VendorAttributeOption` — an allowed value ("Black"): `name`, immutable `slug` unique per
     attribute, `sortOrder`.
   - `ProductAttributeValue` — one product's value for one attribute, **unique on
     (product, attribute)**. Composite foreign keys make "the option belongs to that attribute" and
     "the attribute belongs to that vendor" true in the database, not only in code — the same
     technique `Product.category` already uses with `[categoryId, vendorId]`.
   - Deleting an attribute or option cascades to the product values that use it. Products are
     never deleted by this.
2. **`/staff/attributes`** — staff and store admins add, rename, reorder and delete filters and
   their values, mirroring `/staff/brands` (same role gate, same `PanelRefusal`, same three
   surfaces). Deleting something in use needs an explicit confirmation tick showing how many
   products it is removed from. No browser `confirm()` dialog.
3. **Product form** — one select per vendor filter, first option "Not set". Only the filter
   fields actually submitted are written; one absent from the submission is left untouched (the
   same "absent means leave alone" posture `#905` took for disabled labels). Every submitted
   option is checked against the vendor and the attribute before writing.
4. **Storefront** — the filter panel shows one select per vendor filter that has at least one
   value among the products in the current context (the rule every existing facet follows).
   URL key `attr_<attributeSlug>=<optionSlug>`; single value per filter. Unknown slugs, empty
   values and repeated parameters apply nothing and render no chip. Chips read
   `<Filter>: <Value>`. The facet probe stays one `Promise.all` round trip and, like every
   existing facet, is computed with **all** facet filters excluded, so an active filter can always
   be removed.
5. **Product detail page** — a "Specifications" list of the product's filter values, in the
   vendor's filter order, only when the product has at least one. Not on product cards.
6. **`#601`, folded in as the first, behaviour-preserving commit.** The three hand-maintained
   filter-key lists (`filter-chips.ts`'s `REMOVABLE`, `search-href.ts`'s `CARRIED`, and the
   hand-written `if (params.X) qs.set(...)` chain in `app/(storefront)/categories/[slug]/page.tsx`)
   become one module, `components/product/filter-params.ts`, holding the fixed keys **and** the
   `attr_` prefix rule. The category page's href builders move to
   `components/product/category-href.ts` so a test can import them. Dynamic keys are what force
   this: no fixed list can register a key a vendor invents at runtime, so without #601 every new
   filter would be dropped one click into "Next page".
7. **`#916`, closed here.** This slice changes the product create path anyway, so the live
   new-product check `#916` asks for (a label switched off, and all six on) is a row in
   `validation.md`.
8. **Seed** — SriMart gets two demo filters on its dev/demo catalogue: **Colour** (Black, White)
   and **Connectivity** (Wired, Wireless), on its audio and charger products only. Its lighting and
   home products get none, which is what proves a filter hides where nothing carries it. Aheed gets
   none, so Aheed's storefront is unchanged. (`#912`'s body suggested "Storage"; SriMart's seeded
   catalogue has no product with a storage size, so Connectivity replaces it.)

## Two filter mechanisms, side by side — deliberately

The six grocery booleans stay as columns (`#569`'s reasoning about index shape still holds for
them) and stay switchable per vendor (`#905`). Vendor filters are a second mechanism for
value-holding, vendor-invented attributes. `specs/architecture.md` records this as a standing
decision so the next reader does not "unify" them by accident.

## Deliberately excluded

- **Variants (`#398`).** A product stays one thing with one price and one stock row; "128GB Blue"
  and "256GB Black" remain two products. Electronics and fashion genuinely need variants
  (discovery log, 2026-09-07). This slice delivers filtering, not a variant model.
- **Moving the six grocery booleans into the new model.**
- **Numeric range filters** (screen size 13–15"). Pick-from-list only.
- **Multi-select within one filter** (Black *or* White). One value per filter per URL, matching
  brand/origin/pack size.
- **Filter values on product cards.** Detail page only.
- **Production data entry.** Real SriMart products need values entered by the owner, or the
  filters will not appear (the `#697` lesson). The seed does not run in CI or against staging/
  production.
- **Search matching on filter values** (typing "wireless" finding products by their Connectivity
  value). Filters narrow results; they do not feed the text search.
- **A hidden passthrough for an active filter whose control is not rendered.** A control hides
  only when no product in context carries the filter, in which case the active filter already
  yields zero results and dropping it on Apply is harmless.

## Known risks and how they are handled

- **Two adapters, two error codes** — duplicate-slug detection uses the existing
  `isUniqueViolation`, which accepts both `P2002` and `23505`.
- **Implicit transactions** — the product create is a nested create (values alongside inventory)
  and already runs on `getPrismaWs()` since `#878`; the update runs inside the existing
  interactive transaction. No `createMany`/`updateMany` on the HTTP client.
- **`where` composition** — several attribute filters share the `attributeValues` relation key, and
  `onOffer` already uses `AND`. Both go into one `AND` array inside `buildFilterWhere`, per
  `specs/architecture.md`'s "never emit a bare top-level OR" rule; a unit test pins both together.
- **Dev database trap (`#895`)** — `prisma migrate dev --create-only` against dev offers a reset.
  Generate the migration with `prisma migrate diff`, as `#876`/`#613` did, read the SQL, confirm
  no trigram index is dropped.
- **One visible behaviour change from #601.** Category-page pagination now carries every fixed
  filter key, so a stray `featured` or `category` in a category URL survives "Next page". The
  category page reads neither, so the listing is unchanged; generated query strings may also list
  parameters in a different order.
- **SriMart cannot be signed into locally** (Better Auth refuses `srimart.localhost`), so the
  signed-in staff proof runs on the Aheed host locally and on SriMart's staging host after merge.

## Open items carried forward

- `#398` (variants), `#697` (real-product data), `#911` (reference coverage) are unaffected and
  stay open.
