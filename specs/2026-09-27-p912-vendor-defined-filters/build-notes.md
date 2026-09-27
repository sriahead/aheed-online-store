# #912 — Vendor-defined product filters, with #601 and #916 (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

No front-matter — like `requirements.md` and `validation.md` this is slice-local, not a KMS
artifact, and it does not get an `ARTIFACT_INDEX.md` entry.

Branch `feature/912-vendor-defined-filters`, cut from `staging` at `2432ac0`. Commits, oldest first:

| Commit | What |
|---|---|
| `ddf3f60` | Carried-forward `#905` post-promotion reconciliation (R30), left uncommitted by the previous session. |
| `f0519b3` | Spec: `plan.md`, `requirements.md`, `validation.md`, plus `specs/architecture.md` 1.35.0 (R29, written at Spec). |
| `a18045a` | `#601`: one filter-key definition. Behaviour-preserving apart from the one change `plan.md` names. |
| `54ba30b` | Schema, migration (applied to dev), repository, service, actions, `/staff/attributes`, nav, hub, guide. |
| `d747775` | Product form selects, and the vendor filter values on the create and update writes. |
| `83b1c86` | Storefront predicate, facet, chips, filter-panel selects and product-page Specifications. |
| `aff8cb3` | SriMart seed filters, and the facet-probe test update. |

## What changed and why

**`#601` — one filter-key definition (R4–R6).**
- `components/product/filter-params.ts` holds `FIXED_FILTER_KEYS` (today's `REMOVABLE`, same
  order), the `attr_` prefix, `isAttributeParamKey` (regex `^attr_[a-z0-9-]+$`) and
  `filterEntries`.
- `filter-chips.ts` sets `REMOVABLE = FIXED_FILTER_KEYS`, and its `buildHref`/`clearAllHref` go
  through `filterEntries`.
- `search-href.ts` builds both hrefs from `q` plus `filterEntries`. `CARRIED` still exists, but
  only as the derived `["q", ...FIXED_FILTER_KEYS]`, so the existing
  `tests/filter-chips.test.ts` pin keeps compiling. See Deviations.
- The category page's hand-written `qs.set` chain moved to `components/product/category-href.ts`
  (`nextCategoryPageHref`/`prevCategoryPageHref`).
- `tests/filter-params.test.ts` asserts all four builders against the one list plus
  `attr_colour`.
- Chip hrefs keep their old parameter order (`q`, then the fixed order). Search hrefs now follow
  the fixed order instead of the old `CARRIED` order. No test asserted that order.

**Schema (R1–R3).**
- Migration: `prisma/migrations/20260927000000_p912_vendor_attributes/migration.sql`.
- It was generated with `prisma migrate diff` from `staging`'s schema to this branch's schema, not
  `migrate dev` (the `#895` reset trap).
- It was read before applying: only CREATE TABLE, indexes and foreign keys, with no DROP and no
  trigram index. It was applied to dev (`ep-dry-morning-zab7dx08`) with `npx prisma migrate
  deploy`.
- `npx prisma format` realigned column whitespace in the `Vendor` and `Product` blocks. That is the
  17 deleted lines in the schema diff: formatting only, with no field changed.

**Staff management (R7–R12).**
- `lib/repositories/attributes.ts` (pure), `lib/attributes-service.ts` (facade),
  `lib/attribute-form.ts` (pure rules and the confirmation label), `features/admin/attributes.ts`
  (six async actions), `components/staff/AttributeManager.tsx` and
  `app/(admin)/staff/attributes/page.tsx`.
- Modelled on `/staff/brands`: the same `STAFF`+`ADMIN` gate, and the guide section sits beside
  Brands in `docs/staff-playbook/staff-tabs-guide.md` (2.6.0).
- The service functions take `vendorId` explicitly (from `requireVendorRole`) instead of
  resolving the current vendor, apart from `listCurrentVendorAttributeDefinitions`, which the
  storefront uses.

**Save path (R13–R16).**
- `lib/product-attribute-form.ts` reads `attribute_<uuid>` keys.
- `ProductWriteInput.attributeValues` is required, so every caller has to decide. The two scripts
  and `tests/product-label-settings.test.ts` pass `[]`.
- `assertOwnAttributeValues` in `lib/repositories/products.ts` runs one query for the whole
  submission, before any write, on both paths.
- Create adds a nested `attributeValues: { create }`. The create already runs on `getPrismaWs()`
  since `#878`.
- Update runs inside the existing `$transaction`: `upsert` on `productId_attributeId`, or
  `deleteMany` for "Not set".
- `saveProduct` composes `{ ...parsed.value, attributeValues }` before `applyProductLabelSettings`.

**Storefront (R17–R22).**
- `buildFilterWhere` now collects `onOffer` and the attribute clauses into one `and` array. It used
  to assign `where.AND` once, for `onOffer` only.
- `getAvailableFacets` adds one probe, `productAttributeValue.findMany`, with `where: { vendorId,
  product: base }` and `distinct: ["optionId"]`, inside the same `Promise.all`. The rows are grouped
  and ordered in TypeScript (`groupFacetAttributes`).
- `getProductBySlug` selects `attributeValues` with attribute and option in the same query, and
  orders them in TypeScript.
- Both browse pages call `resolveAttributeFilters(params, await
  listCurrentVendorAttributeDefinitions())`, which runs one extra query per page.

**Seed (R23).** `seedAttributes(SRIMART_VENDOR_ID, SRIMART_ATTRIBUTES)` runs after
`seedPriceTiers`, inside the SriMart-only branch. It upserts on each unique key and uses
`update: {}` on the definitions.

## Decisions taken during the build

- **New filters and values are appended.** A new filter or value gets `sortOrder` equal to the
  current count, not the schema default `0`. So R24(a)'s `Black` then `White` are positions 0 and
  1. After `White` is renamed to `Ivory` and `Black` is moved to 5, `Ivory` lists first, as R24(a)
  expects.
- **Delete runs on the HTTP client with `deleteMany`,** scoped by `vendorId`. For an option, the
  scope goes through the relation: `where: { id, attribute: { vendorId } }`. `CLAUDE.md` lists
  `deleteMany` as safe on `getPrisma()`. The cascade happens in the database.
- **Renames use `updateMany` on `getPrismaWs()`,** so the `vendorId` scope can sit in the `where`,
  the way brands do it.
- **A form submission can't clear an absent attribute.** Only submitted `attribute_*` keys are
  written. An attribute created after the form loaded is left untouched.
- **The page's own attribute list isn't cached per request.** Search and category each run one
  `vendorAttribute.findMany` per render. It's cheap, and memoising it would be new infrastructure.
- **Delete button styling** uses the existing `danger`/`danger-tint` tokens. There's no `Button`
  danger variant, and adding one would have widened scope.
- **Seed values** are chosen so the Lighting and Home categories carry none, which proves a filter
  hides where nothing carries it (R26(a)).
- **`tests/products-repository.test.ts`** was updated: the stub gained `productAttributeValue`, the
  probe count went from 10 to 11, and one new case checks that the attribute probe is scoped to the
  vendor and carries no `optionId`/`attributeValues`.
- **`tests/product-form-attributes.test.tsx` is new,** and covers R16 in jsdom.

## Deviations from the spec

- **R5 wording, "none of them keeps its own list of filter keys".** `search-href.ts` still exports
  `CARRIED`, but derived as `["q", ...FIXED_FILTER_KEYS]`. The only literal in it is `"q"`, which
  the spec defines as not a filter key. It's kept because `tests/filter-chips.test.ts` (R30 of
  `#569`) and one `packSize` case import it. The intent of R5 is met: no second hand-maintained
  list exists.
- **R6 wording, "`attr_Colour!` is carried by none of the builders".** The test puts `"attr_Colour!"`
  and an array-valued `attr_colour` in the params and asserts that neither appears in any builder's
  href, `clearAllHref` included. That matches R6(d).
- **R9 revalidation.** `/staff/products` is revalidated as a layout (`revalidatePath("/staff/products",
  "layout")`), which covers `/staff/products/new` and `/staff/products/[id]`. `/search` is
  revalidated as a page, and `/categories` and `/products` as layouts, as specified.

Otherwise none.

## Known-shaky areas

1. **The option delete goes through a relation filter on the HTTP client.** R24(c) is the first
   live run. If it throws "Transactions are not supported in HTTP mode", move
   `deleteAttributeOptionForVendor` (and, by symmetry, `deleteAttributeForVendor`) to
   `getPrismaWs()` in `lib/attributes-service.ts`. That's the whole fix.
2. **The facet probe `productAttributeValue.findMany({ where: { vendorId, product: base } ... })`**
   has only been run against a stub. `base` can carry a top-level `AND` (search terms) and relation
   filters (`inventory`), nested under the `product` relation. R26(a) and R26(b) are its first live
   runs. A shopper search with an active category on the SriMart host (for example
   `/search?q=wireless&attr_connectivity=wireless`) exercises the deepest shape.
3. **The nested create with `attributeValues` is new.** It uses the unchecked scalar form
   (`vendorId`, `attributeId`, `optionId`) inside `product.create`, and has only been typechecked.
   R24(b) is its first live run, and R25 is `#916`'s run of the same create path.
4. **Composite foreign keys under `upsert`.** The update-path `upsert` changes only `optionId`. If a
   crafted submission ever reached it with an option from a different attribute, the
   `[optionId, attributeId]` foreign key would reject it as a 500.
   `assertOwnAttributeValues` is meant to make that unreachable. R14's live row (a `curl` with an
   option id from a different attribute) is the proof.
5. **The seed has not been run.** `.env`/`.dev.vars` set no `SEED_AHEED_HOST`/`SEED_SRIMART_HOST`.
   To run R23, set both on the command line, to the seeded `VendorDomain` hosts `localhost:8787`
   and `srimart.localhost:8787`, then run `npm run db:seed`. It also refreshes product images in
   the dev bucket (existing behaviour, not new), so expect `putObject` lines.
6. **The full local test run hits two 5s timeouts:** `tests/slot-capacity.test.ts` and
   `tests/vendor-neutral-copy.test.ts:109`. Both pass alone, and neither is touched here. It's the
   same class as `#538` (commented there). CI's `quality` job is the arbiter for R34.
7. **The KMS docs site builds were run at this stage** (see the CHANGELOG commit). If Validate
   re-runs R31, run `kms:assemble:internal` and then the Next build in `kms/site-internal`, and
   read the build's own exit status.

## Found during this slice, filed rather than fixed

- **`#917`:** `docs/staff-playbook/staff-tabs-guide.md` says brands can be "removed", but no brand
  delete control exists.
- **`#918`:** follow-ups deferred from this slice: multi-select, ranges, values on cards, search
  matching filter values, and SriMart production data entry.
- **`#538`:** commented with the two further full-suite timeout files.
