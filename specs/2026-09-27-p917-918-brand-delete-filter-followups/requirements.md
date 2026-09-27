# #917/#918 — Brand deletion and vendor-filter follow-ups (requirements / acceptance criteria)

Read `plan.md` in this directory for the reasoning. Gate 1 was approved on 2026-09-27, and the
approved scope is a comment on `#917` and `#918`. This file is the checklist.

In summary:

- staff can delete a brand, with a required tick when products use it (`#917`);
- a vendor filter is either a **list** filter (today's kind) or a **number** filter with an optional
  unit;
- shoppers can tick several values of one list filter, and give a from/to range for a number filter;
- a filter can be shown on product cards;
- text search also matches list-filter values.

There is one additive migration.

Terms used below:

- **Aheed host** is `localhost:8787` and **SriMart host** is `srimart.localhost:8787` (the port is
  required), both under `npm run preview` against the dev database.
- **Aheed admin** is `demo-store-admin@example.com`.
- **List param** is a query key matching `^attr_[a-z0-9-]+$`. **Range param** is a query key matching
  `^attr_[a-z0-9-]+_(min|max)$`. **Attribute param** means either.
- **Number rule**: a string matching `^\d{1,8}(\.\d{1,2})?$` after trimming.
- **Pair label key**: `<query key>=<value>`, e.g. `attr_colour=black` or `attr_power_min=15`.
- **Fixed filter keys** are the 15 keys in `components/product/filter-params.ts`'s
  `FIXED_FILTER_KEYS`, unchanged by this slice.

## Carry-forward

R1. The first commit on this branch, before the spec commit, adds a `specs/roadmap.md` change-log
    row for PR #921 (merge `646f14d`), and corrects `docs/model-handoff.md` so that it no longer says
    `main` is at `f53913e` or that `#912`, `#601` and `#916` are `In Review`. After it,
    `npm run sdd:audit` prints no `pending carry-forward` line for PR #921.

## Brand deletion (`#917`)

R2. `lib/repositories/brands.ts` exports `deleteBrandForVendor(prisma, vendorId, { id, confirmed })`,
    where `prisma` is the HTTP client type (`ReturnType<typeof getPrisma>`).
    - A brand not found for that `vendorId` returns `{ ok: false, error: "That brand no longer
      exists.", field: "id" }`.
    - A brand with at least one product and `confirmed` false returns `{ ok: false, error: "Tick the
      box to confirm.", field: "confirmDelete" }`, and nothing is deleted.
    - Otherwise it calls `brand.deleteMany({ where: { id, vendorId } })` and returns `{ ok: true, id }`.

    `BrandRepository` gains `delete(id, confirmed)`, and `lib/brands-service.ts` wires it to
    `getPrisma()`. `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts`
    pass unmodified.

R3. `tests/brands-delete.test.ts` exists and passes. Against a stubbed client, it asserts:
    - (a) not found returns the R2 message, and `deleteMany` is not called;
    - (b) in use and unconfirmed returns the R2 message, and `deleteMany` is not called;
    - (c) in use and confirmed calls `deleteMany` with `{ where: { id, vendorId } }`;
    - (d) a brand with no products is deleted without confirmation.

R4. `features/admin/brands.ts` exports a new `deleteBrand(_prev, form)`.
    - It calls `requireVendorRole("STAFF", "ADMIN")` and returns the file's existing refusal state on
      failure.
    - It reads `brandId`, and treats the delete as confirmed only when `confirmDelete` is `on`.
    - On success it revalidates the brand surfaces.

    The file still exports only async functions. The brand surfaces now also include
    `revalidatePath("/products", "layout")`, because product pages and cards show the brand.

R5. `components/staff/BrandManager.tsx` renders a delete form for each brand, after its image-key
    form.
    - The form has a hidden `brandId`.
    - When the brand's `productCount` is above 0, it has a required checkbox named `confirmDelete`,
      whose label text is `confirmDeleteLabel(productCount)` from `lib/attribute-form.ts` (`Also remove
      it from 1 product`, or `… from N products`).
    - The submit button reads `Delete brand`.
    - Nothing calls `window.confirm` or `confirm(`.

R6. In `docs/staff-playbook/staff-tabs-guide.md`, the `## Brands — /staff/brands` section still says
    brands can be removed. The same section also says that:
    - removing a brand some products use needs the confirmation tick;
    - those products are kept, with no brand.

## Schema and migration

R7. `prisma/schema.prisma`:
    - has a new `enum AttributeKind { LIST NUMBER }`;
    - `VendorAttribute` gains `kind AttributeKind @default(LIST)`, `unit String?` and
      `showOnCard Boolean @default(false)`;
    - `ProductAttributeValue.optionId` becomes `String?`, and its `option` relation becomes optional,
      still on `[optionId, attributeId]` referencing `[id, attributeId]`, with `onDelete: Cascade`;
    - `ProductAttributeValue` gains `numericValue Decimal? @db.Decimal(10, 2)` and
      `@@index([vendorId, attributeId, numericValue])`.

    Every other existing field, unique key and index of these two models is unchanged. No other model
    changes.

R8. Exactly one new directory exists under `prisma/migrations/`. Its `migration.sql`:
    - creates the type `"AttributeKind"`;
    - adds the three `VendorAttribute` columns;
    - makes `"ProductAttributeValue"."optionId"` nullable, and adds `"numericValue" DECIMAL(10,2)`;
    - creates the R7 index;
    - adds `CONSTRAINT "ProductAttributeValue_one_value_check" CHECK (("optionId" IS NULL) <>
      ("numericValue" IS NULL))`.

    It may drop and re-add `ProductAttributeValue`'s option foreign key. It contains no other `DROP`
    (`DROP NOT NULL` excepted), no statement on `"Product"`, and no statement naming a `_trgm` index.

R9. After the migration is applied to the dev database with `npx prisma migrate deploy`,
    `npx prisma migrate status` reports no pending migration. An `INSERT` into
    `"ProductAttributeValue"` with both `optionId` and `numericValue` null is refused with an error
    naming `ProductAttributeValue_one_value_check`.

## Staff filter management

R10. `lib/attribute-form.ts` exports:
     - `parseAttributeKind(raw)`: `"LIST"` or `"NUMBER"` when the trimmed input equals one of them.
       Anything else is refused on field `kind` with `Choose a filter type.`;
     - `parseAttributeUnit(raw)`: `null` when blank after trimming. The trimmed string when it is 1–10
       characters. Longer is refused on field `unit` with `Keep the unit to 10 characters or fewer.`

     `tests/attribute-form.test.ts` covers each case and passes.

R11. `createAttribute` reads `name`, `kind` and `unit`, and creates the filter with that kind.
     - A `LIST` filter always stores `unit` as `null`.
     - No action or repository function changes an existing filter's `kind`: in
       `lib/repositories/attributes.ts`, `kind` is written only by the create.

R12. `renameAttribute` also reads `showOnCard` (`on` means true, and anything else, including
     absence, means false) and `unit`. The repository writes `showOnCard` for every kind. It writes
     `unit` only when the filter's kind is `NUMBER`, so a `LIST` filter's unit stays `null`.

R13. `createAttributeOption` on a `NUMBER` filter is refused with `This filter takes a number, not a
     list of values.` on field `name`, and no option row is written.

R14. `AttributeRow` and `AttributeDefinition` gain `kind` and `unit`, and `AttributeRow` also gains
     `showOnCard`. On `/staff/attributes`:
     - The add-filter form has a `<select name="kind">` with options `Pick from a list` (value
       `LIST`, selected by default) and `Number` (value `NUMBER`). It also has an `<input name="unit">`
       labelled `Unit (number filters only, optional)`.
     - Each filter card's rename form has a checkbox `name="showOnCard"` labelled `Show on product
       cards`, checked when stored true. For a `NUMBER` filter it also has an `<input name="unit">`
       labelled `Unit`, defaulting to the stored unit.
     - A `NUMBER` filter's card shows the text `Number filter`, and renders no values list and no
       add-value form.

R15. The `## Product filters — /staff/attributes` section of the staff guide describes:
     - choosing a list or number type when adding a filter, and that the type cannot be changed
       later;
     - the unit;
     - `Show on product cards`, including that saving with it unticked turns it off;
     - that shoppers can tick several values of one list filter, and give a from/to range for a
       number filter.

     `tests/operator-doc-coverage.test.ts` passes. Every capability sentence in the section traces to
     a control from R11–R14 or R17.

## Product form and save path

R16. `readAttributeValues(form)` in `lib/product-attribute-form.ts` returns entries with a `kind`:
     - For `attribute_<uuid>` keys, it returns `{ kind: "LIST", attributeId, optionId }`, with R13 of
       `#912` otherwise unchanged.
     - For keys matching `^attributeNumber_([0-9a-f-]{36})$`, it returns
       `{ kind: "NUMBER", attributeId, numericValue }`. `numericValue` is `null` for an empty value,
       and the trimmed string for a value passing the number rule.
     - Any other number value is refused on that field with `Enter a number from 0 to 99999999.99,
       with at most 2 decimal places.`

     `tests/product-attribute-form.test.ts` covers a valid number, an empty number, `abc`, `-1`,
     `1.234` and `123456789`, and passes.

R17. The repository's ownership check runs before any write, on both create and update.
     - It also refuses an entry whose `kind` differs from the filter's stored `kind`, with `Choose a
       value from this store's list.`
     - The refusal's field is `attribute_<id>` for a `LIST` entry, and `attributeNumber_<id>` for a
       `NUMBER` entry.

     Create writes a non-null number entry inside the existing nested `attributeValues: { create }`
     as `{ vendorId, attributeId, numericValue }`. Update, inside its existing `$transaction`,
     upserts `numericValue` (with `optionId: null`) or deletes the row when `numericValue` is `null`.
     `tests/repository-transaction-safety.test.ts` passes.

R18. `AdminProductDetail` gains `attributeNumbers: Record<string, string>` (attribute id to the stored
     value as a string). `attributeValues` keeps only list entries.

     For a `NUMBER` filter, `components/staff/ProductForm.tsx` renders
     `<input type="number" name="attributeNumber_<id>" step="0.01" min="0">`. It is labelled
     `<name> (<unit>)`, or `<name>` when there is no unit, and defaults to the stored value. `LIST`
     filters keep their select.

R19. No Prisma `Decimal` leaves `lib/repositories/`: every numeric attribute value in a returned
     object is a `string`. A new pure module `lib/attribute-number.ts` exports:
     - `formatAttributeNumber(value, unit)`, which removes trailing zeros after the decimal point
       (and a then-trailing `.`), and appends ` <unit>` when `unit` is non-null. So `("13.30", "in")`
       gives `13.3 in`, `("15.00", null)` gives `15`, and `("0.50", "m")` gives `0.5 m`;
     - `parseAttributeNumber(raw)`, which returns the trimmed string when `raw` is a string passing
       the number rule, and `null` otherwise (arrays included).

     `tests/attribute-number.test.ts` covers the three format examples and the parse cases, and
     passes.

## Storefront: URL keys, multi-select, ranges

R20. `components/product/filter-params.ts`:
     - `isAttributeParamKey(key)` is true exactly for list params and range params;
     - it exports `isAttributeListParamKey(key)` and `parseAttributeRangeParamKey(key)`, which returns
       `{ slug, bound: "min" | "max" }` for a range param and `null` otherwise;
     - `filterEntries` still returns `[key, value]` pairs. For a list param with an array value, it
       now yields one pair per distinct non-empty string element, in the order given. Array values
       for fixed keys and range params are still skipped.

     Order is unchanged otherwise: fixed keys in order, then attribute params sorted by key.

R21. Every href builder appends pairs rather than setting keys:
     - `filter-chips.ts` (chip hrefs and `clearAllHref`);
     - `search-href.ts` (`searchPageHref`, `categoryFilterHref`);
     - `category-href.ts` (`nextCategoryPageHref`, `prevCategoryPageHref`).

     `tests/filter-params.test.ts` adds a case with `attr_colour: ["black", "white"]` and
     `attr_power_min: "15"`. It asserts that every one of those five builders' output keeps
     `attr_colour=black`, `attr_colour=white` and `attr_power_min=15`, and passes.

R22. `resolveAttributeFilters(params, attributes)` in `lib/attribute-filters.ts`: each definition now
     carries `id`, `slug`, `name`, `kind`, `unit` and `options`. It returns:
     - `optionGroups: string[][]`: one group per `LIST` filter with at least one resolved value. The
       group holds the option ids of that filter's resolved values; values matching no option are
       dropped;
     - `ranges: { attributeId: string; min?: string; max?: string }[]`: one per `NUMBER` filter with
       at least one bound passing `parseAttributeNumber`;
     - `labels: Record<string, string>`, keyed by pair label key:
       - `<Filter>: <Option>` for a list value;
       - `<Filter>: from <formatAttributeNumber(min, unit)>` for a min bound;
       - `<Filter>: up to <formatAttributeNumber(max, unit)>` for a max bound.

     A list param naming a `NUMBER` filter, or a range param naming a `LIST` filter, resolves to
     nothing. `tests/attribute-filters.test.ts` covers:
     - two values of one filter;
     - one known and one unknown value;
     - a min-only range, and a min and max range;
     - `attr_power_min=abc`;
     - a repeated range bound;
     - each kind-mismatch case.

     It passes.

R23. `ProductFilters.attributeOptionIds` is replaced by
     `attributeOptionGroups?: readonly (readonly string[])[]` and
     `attributeRanges?: readonly { attributeId: string; min?: string; max?: string }[]`.
     `buildFilterWhere`:
     - emits one `{ attributeValues: { some: { optionId: { in: [...group] } } } }` per non-empty
       group;
     - emits one `{ attributeValues: { some: { attributeId, numericValue: { gte?, lte? } } } }` per
       range, with only the bounds present;
     - puts every one of these into the same `AND` array as the `onOffer` clause, and emits no
       top-level `OR`.

     A test asserts:
     - `onOffer: true`, one group of two ids and one min-and-max range give one top-level `AND` of
       three clauses;
     - `searchProducts`, `listProducts` and `listProductsByCategory` each keep both kinds of clause.

R24. `activeFilterChips`' attribute labels parameter is keyed by pair label key.
     - It renders one chip per attribute pair present in the labels. A chip's `key` is its pair label
       key.
     - A chip's `href` removes only that pair: another value of the same list param, and the other
       bound, are kept.
     - A pair absent from the labels renders no chip.
     - `clearAllHref` removes every attribute pair.

     `tests/filter-chips.test.ts` or `tests/filter-params.test.ts` asserts the first and second
     bullets for `attr_colour=black&attr_colour=white`.

R25. `components/product/ProductFilterForm.tsx`, for each entry in `facets.attributes`:
     - **`LIST`:** a `<fieldset>` whose `<legend>` is the filter name. It holds one label-wrapped
       `<input type="checkbox" name="attr_<slug>" value="<optionSlug>">` per option, checked when the
       current param (string or array) includes that slug.
     - **`NUMBER`:** a `<fieldset>` whose `<legend>` is `<name> (<unit>)`, or `<name>` without a
       unit. It holds two `<input type="number" step="0.01" min="0">` named `attr_<slug>_min` and
       `attr_<slug>_max`, with `aria-label` `Minimum <name>` and `Maximum <name>`, each defaulting to
       its current single-string value.

     None of these carries an `id`. No `<select name="attr_` remains in the file.

R26. `AvailableFacets.attributes` entries gain `kind` and `unit`, and a `NUMBER` entry has
     `options: []`. In `getAvailableFacets`:
     - the existing option probe adds `optionId: { not: null }`;
     - one new probe runs inside the same `Promise.all`:
       `productAttributeValue.findMany` with `where: { vendorId, numericValue: { not: null },
       product: base }` and `distinct: ["attributeId"]`, selecting the attribute.

     A `NUMBER` filter is listed only when an in-context active product carries a number for it. The
     combined list keeps (`sortOrder`, `name`) order. `FacetContext` gains no attribute field.
     `tests/products-repository.test.ts` passes, with its probe count updated.

R27. `app/(storefront)/search/page.tsx` and `app/(storefront)/categories/[slug]/page.tsx` pass
     `optionGroups` as `attributeOptionGroups` and `ranges` as `attributeRanges` to the product query,
     and pass `labels` to `FilterChips`.

## Product cards and detail page

R28. `ProductSummary` gains `cardSpecifications: { name: string; value: string }[]`.
     - `productSummarySelect` selects the product's values whose attribute has `showOnCard: true`.
     - `toProductSummary` maps them in the attribute's (`sortOrder`, `name`) order. `value` is the
       option name for a list value, and `formatAttributeNumber(numericValue, unit)` for a number.
     - The array is empty when there are none.

R29. `components/product/ProductCard.tsx`, when `cardSpecifications` is non-empty, renders one
     `<p data-card-specs>` after the unit line.
     - Its text is the first three entries' values, joined by ` · `.
     - Its `title` is every entry as `<name>: <value>`, joined by ` · `.

     When the array is empty, it renders no such element. A jsdom test covers an empty array (no
     element) and four entries (three values in the text, all four in the `title`), and passes.

R30. `ProductDetail.specifications` includes number values, formatted with `formatAttributeNumber`.
     `getProductBySlug` handles a value with no option.

## Search

R31. `buildDirectSearchWhere` and `broadSearchPredicate` add, for each variant,
     `{ attributeValues: { some: { option: { name: { contains: variant, mode: "insensitive" } } } } }`
     beside the existing `name` and `description` clauses. `identitySearchPredicate` is unchanged.
     `tests/search-repository.test.ts` passes, with its shape assertions updated to include the new
     clause.

R32. When the name check finds no name-tier candidate and candidates exist, `searchProducts` runs one
     extra query. It asks whether any candidate carries a value whose option name contains
     (case-insensitively) any variant of any term group. If one does, `directNameMatch` is `true`,
     and `suggestions` stays `null`.
     - The extra query is not run when a name-tier candidate exists, or when there are no
       candidates.
     - A stubbed test asserts both the run and the no-run cases, and passes.

## Seed

R33. `prisma/seed.ts`, for SriMart only:
     - `Colour` is created with `showOnCard: true`, and a re-run sets it true;
     - a new `NUMBER` filter `Power` (slug `power`, unit `W`) is added, with values
       `sri-phone-charger` 20, `sri-gan-charger-65w` 65 and `sri-bluetooth-speaker` 10;
     - Aheed still gets no filters.

     After the seed runs against dev, SriMart has exactly:
     - 3 filters and 4 options;
     - 15 `ProductAttributeValue` rows: 12 with `optionId`, and 3 with `numericValue`.

     A second run leaves the same counts.

## Live proof

R34. Brand deletion, as the Aheed admin on the Aheed host:
     - (a) At `/staff/brands`, add `Test Brand 917`. Set it on one product at
       `/staff/products/[id]`.
     - (b) Delete it without the tick: the page shows `Tick the box to confirm.`, and the brand still
       exists in the database.
     - (c) Delete it with the tick: the brand row is gone, and the product exists with
       `brandId` null.
     - (d) `/search?brand=test-brand-917` renders no brand chip, and its product grid matches
       `/search`'s.
     - (e) Restore the product's original brand.

R35. Number filter lifecycle, as the Aheed admin on the Aheed host:
     - (a) Add a filter named `Test Size`, type `Number`, unit `in`. Adding a value to it shows
       R13's message.
     - (b) On one active product in a category that renders `/categories/<slug>`, set `Test Size` to
       `13.3`. The database stores `13.30`, and `/products/<slug>` shows `Specifications` with
       `Test Size` and `13.3 in`.
     - (c) Tick `Show on product cards` on `Test Size`. That product's card on
       `/categories/<slug>` has `title` containing `Test Size: 13.3 in`.
     - (d) `/categories/<slug>?attr_test-size_min=13&attr_test-size_max=14` lists that product, and
       shows the chips `Test Size: from 13 in` and `Test Size: up to 14 in`. With `_min=14`, it does
       not list it.
     - (e) A `curl` save of that product with `attributeNumber_<id>=abc` shows R16's message and
       changes nothing. A save with the field empty removes the value row.
     - (f) Delete `Test Size`. Aheed ends with no filters and no card change.

R36. SriMart storefront, signed out, after the R33 seed:
     - (a) `/categories/sri-electronics` contains `name="attr_colour"` checkboxes for `black` and
       `white`, `name="attr_connectivity"` checkboxes, and inputs `attr_power_min` and
       `attr_power_max`. `/categories/sri-home` contains none of them.
     - (b) `/search?attr_colour=black&attr_colour=white` lists exactly the six products with a
       `Colour` value. It shows the chips `Colour: Black` and `Colour: White`. The `Colour: Black`
       chip's href contains `attr_colour=white` and not `attr_colour=black`.
     - (c) `/search?attr_power_min=15&attr_power_max=65` lists exactly `sri-phone-charger` and
       `sri-gan-charger-65w`, with the chips `Power: from 15 W` and `Power: up to 65 W`.
     - (d) `/search?attr_power_min=abc` shows no `Power` chip, and its product grid matches
       `/search`'s.
     - (e) On `/categories/sri-chargers-cables`, the `sri-gan-charger-65w` card has a `title`
       containing `Colour: White`.
     - (f) `/products/sri-gan-charger-65w` shows `Specifications` with `Power` `65 W`.
     - (g) `/search?q=wired` lists `sri-usb-c-cable-2m`, `sri-phone-charger` and
       `sri-gan-charger-65w`, none of whose names or descriptions contains `wired`. Any other product
       it lists has `wired` in its name or description (checked in the database). The page does not
       contain `These are loosely related`.

R37. On the Aheed host, `/search?attr_zz=1&attr_zz=2` renders a Next-page link whose href contains
     both `attr_zz=1` and `attr_zz=2`. After R35(f), neither `/search` nor any Aheed
     `/categories/<slug>` fetched here contains `name="attr_` or `data-card-specs`.

R38. After this slice merges to `staging`, as a SriMart admin signed in on SriMart's staging host:
     - add and then delete an unused brand;
     - add a `Number` filter with a unit and `Show on product cards` ticked, and set it on one
       product;
     - see it on that product's card, in its `Specifications`, and as a working range filter;
     - delete it with the confirmation tick.

     If no SriMart admin credential is available, record that as the finding. Do not create or reset
     an account without the owner.

## Documentation and gates

R39. In `specs/architecture.md` (`version` 1.36.0, `updated` 2026-09-27 or later), the `#912`
     vendor-filters subsection is updated to state:
     - the two kinds and the one-value `CHECK`;
     - that a repeated list param is meaningful, while other repeated keys still apply nothing
       (`#689`);
     - the range keys;
     - `showOnCard`;
     - that text search matches list-filter option names.

     The four paragraphs about search pagination (starting "This does not reopen `OFFSET`"), which
     currently sit inside that subsection, are moved back to the search pagination section they
     describe.

R40. `npm run kms:validate` exits 0 with no failing front-matter. After `npm run kms:build-index`,
     `npm run kms:check-generated` exits 0. `npm run kms:assemble:internal` exits 0, and so does
     `npx next build --webpack` run after it in `kms/site-internal`.

R41. `CHANGELOG.md` has a new entry on this branch citing `#917` and `#918` (Gate 4).

R42. The pull request targets `staging`. Its body uses a closing keyword only for `#917`, and
     mentions `#918` and `#922` without one.

R43. `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0. `npx vitest run`,
     run alone, exits 0 with every test file executed. CI's `quality` job on the PR is green.
