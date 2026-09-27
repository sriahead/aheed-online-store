# #912 — Vendor-defined product filters, with #601 and #916 (requirements / acceptance criteria)

Read `plan.md` in this directory for the reasoning. Gate 1 was approved on 2026-09-26, and the
approved scope is a comment on `#912`. This file is the checklist.

In summary:

- each vendor defines its own pick-from-list filters as data;
- staff manage them at `/staff/attributes` and set them on the product form;
- shoppers filter by them;
- the product page lists them under "Specifications".

`#601`'s three filter-key lists become one module. `#916`'s create-path check is proven live here.
There is one additive migration.

Terms used below:

- **Aheed host** is `localhost:8787` and **SriMart host** is `srimart.localhost:8787`, both under
  `npm run preview` against the dev database.
- **Aheed admin** is `demo-store-admin@example.com`.
- **Attribute param** is a query-string key matching `^attr_[a-z0-9-]+$`. The part after `attr_`
  is a `VendorAttribute.slug`, and the value is a `VendorAttributeOption.slug`.
- **Fixed filter keys** are exactly these 15, in this order: `category`, `brand`, `origin`,
  `packSize`, `inStock`, `onOffer`, `isHalal`, `isFresh`, `isOrganic`, `isVegetarian`,
  `isGlutenFree`, `isHmcCertified`, `featured`, `minPrice`, `maxPrice`. This is today's
  `REMOVABLE`.

## Schema and migration

R1. `prisma/schema.prisma` gains three models, and `Vendor` and `Product` gain only the matching
    back-relation fields.
    - `VendorAttribute` has:
      - fields `id` (uuid), `vendorId`, `name`, `slug`, `sortOrder Int @default(0)` and
        `createdAt`;
      - `@@unique([vendorId, slug])` and `@@unique([id, vendorId])`;
      - a `vendor` relation with `onDelete: Cascade`.
    - `VendorAttributeOption` has:
      - fields `id` (uuid), `attributeId`, `name`, `slug`, `sortOrder Int @default(0)`;
      - `@@unique([attributeId, slug])` and `@@unique([id, attributeId])`;
      - an `attribute` relation with `onDelete: Cascade`.
    - `ProductAttributeValue` has:
      - fields `id` (uuid), `vendorId`, `productId`, `attributeId` and `optionId`;
      - `@@unique([productId, attributeId])` and `@@index([vendorId, optionId, productId])`;
      - a `product` relation with `onDelete: Cascade`;
      - an `attribute` relation on `[attributeId, vendorId]` referencing `[id, vendorId]`, with
        `onDelete: Cascade`;
      - an `option` relation on `[optionId, attributeId]` referencing `[id, attributeId]`, with
        `onDelete: Cascade`.

    A comment above the three models says why they coexist with `Product`'s six label booleans.

R2. Exactly one new directory exists under `prisma/migrations/`. Its `migration.sql` contains only
    these statements for the three R1 tables:
    - `CREATE TABLE`;
    - `CREATE UNIQUE INDEX` and `CREATE INDEX`;
    - `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`.

    It contains no `DROP`, no `ALTER TABLE "Product"`, and no statement naming a `_trgm` index.

R3. After the migration is applied to the dev database, `npx prisma migrate status` against dev
    reports the new migration as applied.

## One filter-key definition (#601)

R4. A new pure module `components/product/filter-params.ts` exports:
    - `FIXED_FILTER_KEYS`, the fixed filter keys in the order defined above;
    - `ATTRIBUTE_PARAM_PREFIX = "attr_"`;
    - `isAttributeParamKey(key)`, true exactly for an attribute param key;
    - `filterEntries(params, omit)`, which returns `[key, value]` pairs.

    `filterEntries` returns the fixed keys in order, then attribute param keys sorted by key. It
    skips:
    - any key in `omit`;
    - any value that is empty or not a string (an array value is skipped);
    - any key that is neither a fixed key nor an attribute param key.

R5. `filter-chips.ts`, `search-href.ts` and the category page all derive their keys from R4. None of
    them keeps its own list of filter keys.
    - `filter-chips.ts`: `REMOVABLE` is `FIXED_FILTER_KEYS`, re-exported or assigned. Chip hrefs
      and `clearAllHref` build their query from `filterEntries`, so attribute params are carried,
      removed and cleared like fixed keys.
    - `search-href.ts`: `searchPageHref` and `categoryFilterHref` carry `q` plus `filterEntries`.
      `categoryFilterHref` still replaces `category` and drops `cursor`.
    - New module `components/product/category-href.ts` exports `nextCategoryPageHref(slug,
      params, nextCursor)` and `prevCategoryPageHref(slug, params)`. They carry `filterEntries`
      plus the existing `cursor`/`back` behaviour.
    - `app/(storefront)/categories/[slug]/page.tsx` uses those two `category-href.ts` functions,
      and the file contains no `qs.set(`.

R6. `tests/filter-params.test.ts` exists and passes. For a params object with every fixed filter key
    set, plus `attr_colour=black`, it asserts:
    - (a) `searchPageHref`, `categoryFilterHref` (apart from `category`), `nextCategoryPageHref`
      and `prevCategoryPageHref` each preserve every one of those keys with its value;
    - (b) the chip for `attr_colour` removes only that key;
    - (c) `clearAllHref` removes every fixed filter key and every attribute param key, and keeps
      `q`;
    - (d) a repeated `attr_colour` (an array value) and a key `attr_Colour!` are carried by none of
      the builders.

    The existing `tests/filter-chips.test.ts` also passes. Assertions that depended only on
    query-parameter order may be rewritten to compare parsed parameters instead.

## Filter management (repository, service, actions, page)

R7. A new `lib/repositories/attributes.ts` holds the attribute repository, with a sibling request-scoped facade
    `lib/attributes-service.ts`. Every repository export takes a Prisma client and `vendorId` as
    explicit parameters. `tests/repository-purity.test.ts` and
    `tests/repository-client-injection.test.ts` pass unmodified. The repository exports:
    - `listAttributesForVendor(prisma, vendorId)`: the attributes in (`sortOrder`, `name`) order,
      each with its options in (`sortOrder`, `name`) order. Each attribute and option carries
      `productCount`, the number of `ProductAttributeValue` rows that use it.
    - Create, rename and delete writes for attributes and options, returning
      `CatalogueWriteResult`. Rename also sets `sortOrder`; the slug never changes.

    Every write that targets an existing attribute or option matches it by id **and** `vendorId`.
    A row belonging to another vendor behaves as not found.

R8. A new pure module `lib/attribute-form.ts` (no `"use server"`) validates attribute and option
    input. It refuses each case with the exact message given, attached to field `name`:
    - (a) a name that is empty after trimming: `Enter a name.`;
    - (b) a name longer than 40 characters after trimming: `Keep the name to 40 characters or
      fewer.`;
    - (c) a name whose `slugify` result is empty: `Use at least one letter or number.`

    The repository refuses these, with no row written:
    - (d) a duplicate attribute slug for the vendor, detected with `isUniqueViolation`: `This store
      already has a filter with that name.`;
    - (e) a duplicate option slug within the attribute: `That filter already has that value.`;
    - (f) a 21st attribute for one vendor: `A store can have at most 20 filters.`;
    - (g) a 51st option for one attribute: `A filter can have at most 50 values.`
    - (h) a `sortOrder` that is not a whole number from 0 to 999 is refused on field `sortOrder`
      with `Enter a position from 0 to 999.`

    `tests/attribute-form.test.ts` covers (a), (b), (c) and (h), and passes.

R9. `features/admin/attributes.ts` is a `"use server"` file that exports only async functions:
    `createAttribute`, `renameAttribute`, `deleteAttribute`, `createAttributeOption`,
    `renameAttributeOption` and `deleteAttributeOption`.
    - Each calls `requireVendorRole("STAFF", "ADMIN")` itself. A failed check returns a refusal
      state and never throws.
    - The vendor comes from the auth result and never from a form field.
    - On success, each revalidates `/staff/attributes`, `/staff/products`, `/categories`
      (layout), `/search` and `/products` (layout).

R10. Deleting an attribute or an option in use needs explicit confirmation. "In use" means
     `productCount > 0`.
     - The delete form renders a required checkbox named `confirmDelete`, labelled `Also remove it
       from N products` (`1 product` when N is 1).
     - Without `confirmDelete=on`, the action refuses with `Tick the box to confirm.`, and nothing
       is deleted.
     - With it, the row and its product values are deleted, and no `Product` row is changed or
       deleted.
     - An attribute or option not in use deletes without the checkbox.

R11. `app/(admin)/staff/attributes/page.tsx` exists.
     - It gates with `requireVendorRole("STAFF", "ADMIN")`, redirects to `/login` on 401, and
       renders `PanelRefusal` on any other refusal.
     - Its `<h1>` reads `Product filters`.
     - It renders an add-filter form, and a card for each attribute. Each card holds a rename and
       position form, a delete form, the attribute's options (each with a rename and position form
       and a delete form), and an add-value form.
     - With no attributes, it says so and says the storefront shows no custom filters until one
       exists and a product carries a value.

R12. The page is on all three surfaces:
     - a `NavLink` to `/staff/attributes` labelled `Product filters` in `components/staff/PanelNav.tsx`,
       wherever `/staff/brands` appears;
     - a hub card linking to `/staff/attributes` in `app/(admin)/staff/page.tsx`;
     - a `## Product filters — /staff/attributes` section in `docs/staff-playbook/staff-tabs-guide.md`,
       carrying the seven labelled parts `tests/operator-doc-coverage.test.ts` requires, with
       `Who can access` set to `Staff and store admins`.

     `tests/staff-nav-parity.test.ts`, `tests/panel-refusal-coverage.test.ts` and
     `tests/operator-doc-coverage.test.ts` pass. Every capability sentence in the guide section
     traces to an R9–R11 control.

## Product form and save path

R13. A new pure module `lib/product-attribute-form.ts` exports `readAttributeValues(form)`.
     - It reads every form key matching `^attribute_[0-9a-f-]{36}$` as an `{ attributeId, optionId }`
       entry, with `optionId` `null` when the value is `""`.
     - It returns only the keys present in the submission.
     - A non-empty value that is not uuid-shaped is refused, on that field, with `Choose a value
       from the list.`

     `tests/product-attribute-form.test.ts` covers: an absent key, an empty value, a valid value,
     a malformed value, and a key that is not an attribute key being ignored. It passes.

R14. `ProductWriteInput` gains `attributeValues: { attributeId: string; optionId: string | null }[]`.
     - `saveProduct` fills it from R13 and passes it to both create and update.
     - Before writing, the repository confirms that each `attributeId` belongs to the vendor, and
       that each non-null `optionId` belongs to that attribute.
     - Any failure returns `{ ok: false, error: "Choose a value from this store's list.", field:
       "attribute_<attributeId>" }`, and nothing is written.

R15. `createProductForVendor` writes the non-null entries as a nested
     `attributeValues: { create: [...] }` inside the existing `product.create`. It still reaches
     Prisma through `getPrismaWs()` (`lib/products-service.ts`).

     `updateProductForVendor`, inside its existing `$transaction`, handles each submitted entry:
     - it upserts the value when `optionId` is non-null;
     - it deletes that product's value for the attribute when `optionId` is `null`;
     - it leaves every attribute absent from `attributeValues` unchanged.

     `tests/repository-transaction-safety.test.ts` passes.

R16. `AdminProductDetail` gains `attributeValues: Record<string, string>` (attribute id to option
     id).

     `components/staff/ProductForm.tsx` takes a required prop `attributes` (the vendor's attributes
     with their options) and renders a section headed `Product filters` only when `attributes` is
     non-empty. For each attribute, that section has a `<select>`:
     - named `attribute_<id>` and labelled with the attribute's name;
     - with a first option `Not set` whose value is `""`;
     - with each option's name as its label and its id as its value;
     - defaulting to the product's stored value.

     `/staff/products/new` and `/staff/products/[id]` pass the current vendor's attributes.

## Storefront

R17. `ProductFilters` gains `attributeOptionIds?: readonly string[]`.
     - When the array is non-empty, `buildFilterWhere` emits one `{ attributeValues: { some: {
       optionId } } }` clause per id. The clauses go inside the same `AND` array the `onOffer`
       clause uses, and no top-level `OR` is emitted.
     - An empty or absent array emits nothing.

     `tests/search-repository.test.ts`, or a new test file, asserts:
     - with `onOffer: true` and two option ids, the result has one top-level `AND` holding three
       clauses;
     - `searchProducts`, `listProducts` and `listProductsByCategory` each keep the attribute
       clauses.

R18. `AvailableFacets` gains `attributes: { slug: string; name: string; options: { slug: string;
     name: string }[] }[]`.
     - It lists only attributes and options carried by at least one active product in the facet
       context, in (`sortOrder`, `name`) order.
     - It is computed inside `getAvailableFacets`'s existing single `Promise.all`.
     - `FacetContext` does not gain `attributeOptionIds`.

R19. A new pure module `lib/attribute-filters.ts` exports `resolveAttributeFilters(params,
     attributes)`. It returns:
     - `optionIds`, one per resolved attribute param;
     - `labels`, a map from each resolved param key to `<Attribute name>: <Option name>`.

     A param resolves only when its attribute slug and its option slug both exist for the vendor
     and its value is a string. Unknown slugs, empty values and array values resolve to nothing.

     `tests/attribute-filters.test.ts` covers each of those cases, plus two attributes resolved
     together, and passes.

R20. `app/(storefront)/search/page.tsx` and `app/(storefront)/categories/[slug]/page.tsx` each:
     - read the vendor's attributes once and resolve the request's attribute params with R19;
     - pass `optionIds` as `attributeOptionIds` to the product query;
     - pass `labels` to `FilterChips`, which renders a chip only for a key present in `labels`.

     `activeFilterChips` takes the labels as an optional parameter. An attribute param with no
     label renders no chip.

R21. `components/product/ProductFilterForm.tsx` renders one `<select>` for each entry in
     `facets.attributes`, after the pack-size control.
     - The `<select>` is named `attr_<slug>` and wrapped in a label showing the attribute's name.
     - Its first option is `Any <name>`, with value `""`.
     - Each option shows the option's name and has the option's slug as its value.
     - It defaults to the current param value.
     - It has no `id` attribute.

## Product detail page

R22. `ProductDetail` gains `specifications: { name: string; value: string }[]`, ordered by
     attribute `sortOrder` then `name`. `getProductBySlug` fills it in the same query as the rest
     of the product.

     `app/(storefront)/products/[slug]/page.tsx` renders, only when `specifications` is non-empty:
     - a heading `Specifications`;
     - then a `<dl>` with one `<dt>`/`<dd>` pair per entry.

     `components/product/ProductCard.tsx` is unchanged by this slice.

## Seed

R23. `prisma/seed.ts` seeds SriMart, inside the existing SriMart-only branch, with:
     - an attribute `Colour` (options `Black`, `White`);
     - an attribute `Connectivity` (options `Wired`, `Wireless`);
     - these values:
       - `sri-over-ear-headphones`: Black / Wireless;
       - `sri-earbuds`: White / Wireless;
       - `sri-bluetooth-speaker`: Black / Wireless;
       - `sri-usb-c-cable-2m`: Black / Wired;
       - `sri-phone-charger`: White / Wired;
       - `sri-gan-charger-65w`: White / Wired.

     No other product gets a value. Aheed gets no attributes. The seed uses upserts on the R1
     unique keys, so running it twice leaves the same row counts.

## Live proof

R24. Aheed admin, Aheed host:
     - (a) At `/staff/attributes`, create the filter `Test Colour` with the values `Black` and
       `White`. Rename `White` to `Ivory`, and set `Black`'s position to `5`. The page lists
       `Ivory` before `Black`.
     - (b) At `/staff/products/new`, create a product with `Test Colour` set to `Ivory`. Its
       `ProductAttributeValue` row exists in the dev database. Re-open it, set `Not set` and save.
       The row is gone.
     - (c) With one product set to `Black`, deleting `Black` without the tick shows `Tick the box
       to confirm.` and deletes nothing. With the tick, the option and its value row are gone and
       the product still exists.
     - (d) Delete `Test Colour`. Deactivate every product created in (b)–(c). Aheed ends with no
       attributes.

R25. `#916`, Aheed admin, Aheed host:
     - (a) With `showOrganicLabel` off at `/staff/storefront`, create a product at
       `/staff/products/new`. The save succeeds, and the new row's `isOrganic` is `false` in the
       dev database.
     - (b) With all six labels on, create a product with Organic ticked. Its `isOrganic` is
       `true`.
     - (c) Every setting changed is restored, and both products are deactivated.

R26. After the R23 seed runs against dev, on the SriMart host (signed out):
     - (a) `/categories/sri-electronics` shows `Colour` and `Connectivity` selects, and
       `/categories/sri-home` shows neither.
     - (b) `/search?attr_connectivity=wireless` lists exactly the three Wireless products and shows
       the chip `Connectivity: Wireless`. That chip's link has no `attr_connectivity`.
     - (c) `/search?attr_connectivity=nope` shows no attribute chip, and its result set equals
       `/search`'s.
     - (d) `/products/sri-earbuds` shows `Specifications` with `Colour` `White` and `Connectivity`
       `Wireless`. `/products/sri-smart-led-bulb` shows no `Specifications`.

R27. On the Aheed host, the Next-page link carries an attribute param:
     - `/search?attr_zz=1` renders a Next-page link whose href contains `attr_zz=1`;
     - so does any Aheed `/categories/<slug>?attr_zz=1` that renders a Next-page link.

     `attr_zz` matches no attribute, so it applies no filter, and the listing still paginates.

R28. After this slice merges to `staging`, a SriMart admin signed in on SriMart's staging host:
     - creates a filter with one value at `/staff/attributes`;
     - sets it on one product;
     - sees it as a storefront filter and in that product's `Specifications`;
     - then deletes the filter with the confirmation tick.

     If no SriMart admin credential is available, record that as the finding. Do not create or
     reset an account without the owner.

## Documentation, carry-forward, gates

R29. `specs/architecture.md` has a new subsection on vendor-defined filters, with a bumped
     `version` and `updated`. It was written at Spec (version 1.35.0); Build corrects it if the
     implementation differs. It states:
     - that the three models coexist with the six label booleans, and why;
     - the `attr_` URL key;
     - that `components/product/filter-params.ts` is the one place a filter key is defined.

R30. The branch's first commit is `ddf3f60`, the `#905` post-promotion reconciliation (roadmap row
     for PR #915, handoff, index). `npm run sdd:audit` reports all slices documented.

R31. `npm run kms:validate` exits 0 with no failing front-matter. After `npm run kms:build-index`,
     `npm run kms:check-generated` exits 0. `npm run kms:assemble:internal` exits 0, and so does
     `npx next build --webpack` run after it in `kms/site-internal`.

R32. `CHANGELOG.md` has a new entry on this branch citing `#912`, `#601` and `#916` (Gate 4).

R33. The pull request targets `staging`. Its body uses a closing keyword only for `#912`, `#601`
     and `#916`, and mentions `#398` and `#697` without one.

R34. `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0. `npx vitest run`,
     run alone, exits 0 with every test file executed. CI's `quality` job on the PR is green.
