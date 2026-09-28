# #917/#918 — Brand deletion and vendor-filter follow-ups (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

No front-matter — like `requirements.md` and `validation.md` this is slice-local, not a KMS
artifact, and it does not get an `ARTIFACT_INDEX.md` entry.

Branch `feature/917-918-brand-delete-filter-followups`, cut from `origin/staging` at `a090b30`, with
**no upstream** set (it was created tracking `origin/staging`; the tracking was removed so a bare
`git push` cannot target `staging`). Push with `git push -u origin feature/917-918-brand-delete-filter-followups`.
Commits, oldest first:

| Commit | What |
|---|---|
| `236a678` | R1 carry-forward: `specs/roadmap.md` row for PR #921, `docs/model-handoff.md` shows `#912` in production. |
| `4607759` | Spec (`plan.md`, `requirements.md`, `validation.md`) and `specs/architecture.md` 1.36.0 (R39, written at Spec). |
| `0b5a085` | `#917`: brand deletion (repository, service, action, form) and `tests/brands-delete.test.ts`. |
| `3254b08` | `#918`: schema, migration (applied to dev), staff management, product form and save path, storefront URL/facets/chips/panel, cards, search, and their tests. |
| `d37239c` | Staff guide 2.7.0 (R6, R15), seed (R33), and a `validation.md` note that `staging` means `origin/staging`. |
| `355a0f8` | `tests/products-service.test.ts` stub gained `attributeValues` and `productAttributeValue.findFirst`. |
| (this commit) | Build notes, Gate 4 CHANGELOG, handoff in-flight entry, KMS index. |

## What changed and why

**`#917` — brand deletion (R2–R6).**
- `deleteBrandForVendor` in `lib/repositories/brands.ts` copies `deleteAttributeForVendor`: a vendor-scoped
  `findFirst` with `_count.products`, then `brand.deleteMany({ where: { id, vendorId } })` on the HTTP client.
  The existing `Product_brandId_fkey ... ON DELETE SET NULL` does the product side; no product write in code.
- `BrandRepository.delete(id, confirmed)` → `lib/brands-service.ts` (uses `getPrisma()`), `deleteBrand` action in
  `features/admin/brands.ts`, and a delete form in `BrandManager.tsx` reusing `confirmDeleteLabel` from
  `lib/attribute-form.ts` and the same danger-token button class as `AttributeManager.tsx`.
- `revalidateBrandSurfaces` now also revalidates `/products` (layout) — applies to rename/image-key too.

**Schema (R7–R9).** `prisma/migrations/20260927140000_p918_attribute_kinds_numbers/migration.sql`.
- Generated with `prisma migrate diff --from-schema-datamodel <origin/staging schema> --to-schema-datamodel
  prisma/schema.prisma --script` (the `#895` trap rules out `migrate dev`). **The diff was taken against
  `origin/staging`, not local `staging`** — local `staging` is stale (pre-`#912`) and produced a diff that
  re-created all three `#912` tables.
- The generated SQL is: `CREATE TYPE`, the three `VendorAttribute` columns, `numericValue` plus
  `optionId DROP NOT NULL`, the new index. Prisma did **not** drop/re-create the option foreign key (R8 allowed
  it; it just didn't happen). The `CHECK` constraint is hand-appended at the end.
- Applied to dev (`ep-dry-morning-zab7dx08`) with `npx prisma migrate deploy`; `migrate status` up to date.
  **Staging and production do not have it** until merge/promotion.

**Staff management (R10–R15).**
- `lib/attribute-form.ts`: `parseAttributeKind`, `parseAttributeUnit`.
- `lib/repositories/attributes.ts`: `AttributeKind` type; `AttributeRow`/`AttributeDefinition` gain
  `kind`/`unit` (+`showOnCard` on the row). `createAttributeForVendor` is the only writer of `kind`, and nulls
  `unit` for LIST. `renameAttributeForVendor` now does a `findFirst` for the kind, then one `updateMany` that sets
  `unit` only for NUMBER. `createAttributeOptionForVendor` refuses NUMBER filters.
- `components/staff/AttributeManager.tsx`: add form gains `kind` select and `unit` input; the card header reads
  `Number filter · attr_<slug> · N products` (or `List filter …`); `RenameForm` takes children for the unit input
  (NUMBER only) and the `showOnCard` checkbox; NUMBER cards render no values list or add-value form.

**Product form and save path (R16–R19).**
- `lib/attribute-number.ts` (new): `NUMBER_RULE`, `ATTRIBUTE_NUMBER_ERROR`, `parseAttributeNumber`,
  `formatAttributeNumber`. Shared by the product form reader and URL bound parsing.
- `lib/product-attribute-form.ts`: `AttributeValueWrite` is now a union with `kind`; reads
  `attributeNumber_<uuid>` keys.
- `lib/repositories/products.ts`: `assertOwnAttributeValues` also compares kinds and picks the field prefix by
  kind; create's nested `attributeValues.create` writes `numericValue` entries; update upserts
  `{ optionId, numericValue }` with the other side explicitly `null`; `getAdminProductById` returns
  `attributeNumbers` (strings via `Decimal.toString()`, so `13.30` comes back as `13.3`).
- `components/staff/ProductForm.tsx`: number input per NUMBER filter.

**Storefront (R20–R27).**
- `components/product/filter-params.ts`: list/range key regexes, `isAttributeListParamKey`,
  `parseAttributeRangeParamKey`, and new export **`attributeParamValues(key, value)`** — the single place that
  says which values a key carries (list arrays expand, de-duplicated; range/fixed arrays yield nothing).
  `filterEntries`, `resolveAttributeFilters` and `ProductFilterForm` all use it.
- All three builder modules `append` instead of `set`. `filter-chips.ts` gained `attributePairKey` and a pair
  omission in `buildHref`; attribute chips are keyed by pair.
- `lib/attribute-filters.ts` rewritten: returns `optionGroups`, `ranges`, pair-keyed `labels`.
- `ProductFilters.attributeOptionIds` → `attributeOptionGroups` + `attributeRanges`; `buildFilterWhere` emits one
  `optionId: { in }` clause per group and one `{ attributeId, numericValue: { gte?, lte? } }` per range.
- `getAvailableFacets`: list probe adds `optionId: { not: null }`; new number probe (`numericValue not null`,
  `distinct: ["attributeId"]`) in the same `Promise.all` (12 probes now). `FacetAttribute` gains `kind`/`unit`.
- `ProductFilterForm.tsx`: checkbox fieldset per LIST filter, min/max pair per NUMBER filter.

**Cards and detail (R28–R30).** A shared `attributeValueDisplaySelect` + `toSpecifications` in
`lib/repositories/products.ts` feed both `ProductDetail.specifications` and the new
`ProductSummary.cardSpecifications` (via `productSummarySelect`, filtered to `attribute.showOnCard`).
`ProductCard.tsx` renders `<p data-card-specs>`.

**Search (R31–R32).** `filterValueMatch(variant)` added to the direct and broad predicates. New
`hasFilterValueMatch` (one `productAttributeValue.findFirst` over the candidate ids) runs only after
`hasNameTierCandidate` fails and candidates exist (the `||` short-circuits).

**Seed (R33).** `AttributeFixture` is a LIST/NUMBER union. The upsert's `update` now sets `showOnCard`
(was `{}`), and value upserts null the other value column. SriMart: Colour `showOnCard: true`; new `Power`
(`W`): phone charger 20, GaN charger 65, speaker 10.

**Docs.** `docs/staff-playbook/staff-tabs-guide.md` 2.7.0 (Brands and Product filters sections).
`specs/architecture.md` 1.36.0 was written at Spec (R39) and still matches the implementation.

## Decisions taken during the build

- **`ProductDetail` also carries `cardSpecifications`** (it extends `ProductSummary`). Filled by filtering the
  detail query's own rows on `attribute.showOnCard`, rather than `[]`, so a quick-view card built from a detail
  agrees with a grid card.
- **Rename reads the kind first** (`findFirst` then `updateMany`, both on `getPrismaWs()`), instead of two
  conditional `updateMany`s. Two queries either way; this keeps a single write.
- **Chip `key` for attribute chips is the pair** (`attr_colour=black`); fixed chips keep the bare key.
- **A range label's pair key uses the raw submitted value** (e.g. `attr_power_max=65.50`), because chips iterate
  raw `filterEntries` values; the label text uses the formatted number (`up to 65.5 W`).
- **`attributeParamValues` lives in `filter-params.ts`** (not `lib/attribute-filters.ts`) so the form, the chips,
  the links and the predicate share one reading of a key.
- **`lib/attribute-filters.ts` imports `attributePairKey` from `components/product/filter-chips.ts`.** `lib`
  already imported from `components/product/filter-params.ts` for `#912`, so this follows existing direction.
- **The card line truncates** (`truncate` class) as well as capping at three values.
- **Test file placement:** R23's test stayed in `tests/attribute-filter-where.test.ts` (the `#912` file); R24's
  cases went into `tests/filter-params.test.ts`; R29 is `tests/product-card-specs.test.tsx`; R32 is in
  `tests/search-repository.test.ts` (`a filter-value match counts as a direct match (#918 R32)`).
- **`#912`'s R6d test was rewritten, not deleted.** It asserted a repeated `attr_colour` is carried by no
  builder; that is now deliberately false for list keys. The block now asserts the same for a malformed key, a
  repeated fixed key (`minPrice`) and a repeated range key, with a comment naming the reversal.

## Deviations from the spec

None. Two wording notes for the validator:

- **R8** allowed a drop/re-add of the option foreign key; the generated SQL has none. Its absence is fine.
- **R14** says a NUMBER card "shows the text `Number filter`". It does, inside the header line
  `Number filter · attr_<slug> · N products`; LIST cards show `List filter` in the same place.

## Known-shaky areas

1. **The CHECK constraint versus the update `upsert`.** The update writes `{ optionId: null, numericValue }`
   (or the reverse) in one statement, which satisfies the CHECK. Never run against a real row. R35(b)/(e) and R17's
   live row are the first runs.
2. **`Decimal` round-trips.** Numbers are written as strings (`"13.3"`) and read back with `.toString()`. Prisma's
   WASM client + Neon adapter returning `Decimal` for a `Decimal(10,2)` column is assumed, not observed. If a read
   returns something without `.toString()` behaving as expected, R35(b) and R36(f) show it.
3. **Range `where` with string bounds** (`numericValue: { gte: "15" }`) typechecks and is standard Prisma, but has
   only run against stubs. R35(d) and R36(c) are its first live runs.
4. **The number facet probe** (`distinct: ["attributeId"]` with a `product: base` relation filter) has only run
   against a stub. R36(a) is its first live run; `/search?q=charger` on SriMart exercises the deepest `base`.
5. **`hasFilterValueMatch`** uses an `OR` of `option: { name: { contains } }` over a nullable relation. Only
   stub-tested. R36(g) (`/search?q=wired`) is its first live run.
6. **Repeated params through Next's `searchParams`.** The pages receive `attr_colour` as `string[]` at runtime;
   `ProductFilterForm`'s `defaultChecked` and the chips rely on that. R36(b) is the live proof.
7. **The seed has not been run** against dev for this slice. R33 runs it. Set `SEED_AHEED_HOST=localhost:8787`
   and `SEED_SRIMART_HOST=srimart.localhost:8787` on the command line; it also refreshes images (`putObject`
   lines are existing behaviour). Dev already has `#912`'s seeded Colour/Connectivity rows, so the first run
   updates `Colour.showOnCard` and adds `Power`.
8. **Brand delete on the HTTP client** — `deleteMany` is documented safe, and `#912`'s attribute delete proved it
   live for a single-table `where`. The brand `where` is also single-table. R34(c) is the live proof.
9. **Full-suite timeouts (`#538` class).** In a full `npx vitest run`, `tests/vendor-neutral-copy.test.ts` and
   `tests/token-alpha-purity.test.ts` each failed once at ~8s; both pass alone (2.1s). Neither was touched by
   this slice. CI's `quality` job is the arbiter for R43.
10. **KMS docs-site build (R40)** was run at build-notes, after every spec/doc edit in this slice:
    `kms:assemble:internal` exit 0 (203 docs), `npx next build --webpack` in `kms/site-internal` exit 0
    (208 static pages). If Validate re-runs R40, read the build's own exit status, not a piped one.

## Found during this slice, filed rather than fixed

- **`#923`** (Backlog, P10): the deliberately excluded follow-ups from `plan.md` — changing a filter's type, number-filter min/max hints, negative numbers, ranking filter-value
  matches, autocomplete over filter values, and removing a deleted brand's stored image.
- The local `staging` branch in this checkout is stale (pre-`#912`). Not a repository defect; recorded in
  `validation.md`'s "Before you start".

## Validate record (2026-09-27, fresh context, Sonnet 5)

Every row R1–R43 checked; no defects found. All ten "Known-shaky areas" above got a live run and
closed clean: the CHECK constraint fired correctly in a rolled-back transaction (R9); `13.3` round-tripped
through `Decimal` and back as a string with no drift (R35(b)/(e)); the range `where` with string bounds
matched correctly live (R35(d)/R36(c)); the number facet probe correctly listed `Power` on
`sri-electronics` and not `sri-home` (R36(a)); `hasFilterValueMatch` correctly found `sri-usb-c-cable-2m`,
`sri-phone-charger` and `sri-gan-charger-65w` for `q=wired`, none of which have "wired" in their name or
description (R36(g)); repeated `attr_colour` params resolved correctly as `string[]` (R36(b)); the seed
ran twice against dev, idempotent (R33); brand `deleteMany` on the HTTP client worked live (R34(c)). The
one full-suite flake (`tests/vendor-neutral-copy.test.ts`) reproduced exactly as predicted and passed
alone.

**Tooling finding, not an artifact defect:** submitting a form field containing `£` via `curl -F` from
this Windows Git Bash session silently replaced it with the UTF-8 replacement character
(`0xEFBFBD` instead of `0xC2A3`) in two products' `unitLabel` during live proof (R34(a), R35(b)).
Caught by comparing stored byte hex against the expected encoding, not by reading the value back with
`console.log` (which renders the replacement character in a way that's easy to misread as correct).
Both restored to their exact original bytes via a direct Prisma `update`, verified byte-for-byte
afterward. Node's `fetch`/`FormData` (used for the R38 staging proof below) did not reproduce this —
prefer it over `curl -F` for any field carrying a non-ASCII character.

## Ship record (2026-09-27)

PR #924 (`feature/917-918-brand-delete-filter-followups -> staging`, `closes #917`, mentions `#918`
and `#922`) — `docs-gates`, `quality/kms` and `quality/quality` all green; merged (`26abc0ca`);
`deploy-staging` (run `36352280570`) completed **success**; staging `/api/health` confirmed serving
`26abc0c` with `db.ok: true`, `reference.drift: false`. `#917` moved to **In Review** on Project #2
(`#918` stays where it was — this PR doesn't close it; item 5, owner action `#922`, is still open).

**R38 run live**, signed in as `demo-srimart-admin@example.com` on `srimart-staging.nocaped.com`
(Node `fetch`, not `curl` — see the tooling finding above) via the `$ACTION_*` progressive-enhancement
protocol, same as local proof:
- Added and deleted an unused brand ("R38 Throwaway Brand", 0 products, no confirmation needed).
- Added a `NUMBER` filter ("R38 Weight", unit `g`), ticked `Show on product cards`, set it to `250`
  on a real catalogue product (`LED Desk Lamp`, `sri-home`).
- Confirmed live: the card's `data-card-specs` title read `R38 Weight: 250 g` on
  `/categories/sri-home`; `/products/led-desk-lamp` showed `Specifications` with `R38 Weight` /
  `250 g`; `/search?attr_r38-weight_min=200&attr_r38-weight_max=300` listed exactly
  `led-desk-lamp` with both range chips.
- Deleted the filter with the confirmation tick (it showed "1 product" first, confirming the tick
  was actually required). Afterward: the filter and brand are both gone, and `LED Desk Lamp`'s
  other fields (`name`, `slug`, `basePrice`, `unitLabel` — byte-verified `£18.99 each` — `quantity`,
  `lowStockThreshold`) are unchanged from before the row began.
