# Products in every subcategory, for both vendors (requirements / acceptance criteria)

Issue **#521**, following **#518**. Production's 31 subcategories were all empty because
`prisma/seed.ts`'s `CATALOGUE` assigns every curated product to a top-level category, and the only
path that fills a subcategory — `seedGeneratedCatalogue` — was called for Aheed only despite
already taking `vendorId` as a parameter. This slice makes generation opt-in per vendor, extends
the documented undo to match, and populates both vendors' second tier in production with images.
See `plan.md` for the trade-off this accepts about generated rows in a live store.

R1. `prisma/seed.ts` exports no new behaviour by default: with neither `SEED_SCALE_PRODUCTS` nor
    `SEED_SCALE_PRODUCTS_SRIMART` set, a seed run creates zero products whose slug begins with
    `gen-`, for either vendor.

R2. `prisma/seed.ts` contains a single helper that reads a named environment variable and seeds one
    vendor's generated catalogue, and it is called exactly twice — once with `SEED_SCALE_PRODUCTS`
    and `AHEED_VENDOR_ID`, once with `SEED_SCALE_PRODUCTS_SRIMART` and `SRIMART_VENDOR_ID`. The
    inline parsing it replaces is gone.

R3. An invalid value for either variable (a non-integer, or a negative number) throws an error
    whose message names the offending variable, and no products are created.

R4. `SEED_REMOVE_GENERATED` calls `removeGeneratedCatalogue` for **both** `AHEED_VENDOR_ID` and
    `SRIMART_VENDOR_ID`.

R5. `prisma/generate-catalogue.ts` is unmodified by this slice — in particular `GENERATOR_SEED` and
    `GENERATED_SLUG_PREFIX` are unchanged (`git diff` against the base branch reports no change to
    that file).

R6. After the production seed run, **every** category in production — top-level and subcategory,
    for both vendors — has at least one product. Zero categories report a product count of 0.

R7. Production holds exactly 54 `gen-` products for Aheed across its 27 subcategories, and exactly
    8 for SriMart across its 4, with no subcategory holding fewer than 2.

R8. After the image fill, production has zero products whose image rows are all placeholders.

R9. The 62 newly generated products do not share image keys: the count of distinct non-placeholder
    `storageKey` values among them equals the number of them that have a non-placeholder image.

R10. A sample of at least five of the newly filled products' primary image keys return HTTP 200
     from **production's** `CDN_BASE_URL`.

R11. `CHANGELOG.md` updated (Gate 4).

R12. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
