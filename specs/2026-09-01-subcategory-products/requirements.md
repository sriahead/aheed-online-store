# Products in every subcategory, for both vendors (requirements / acceptance criteria)

Issue **#521**, following **#518**. Production's 31 subcategories were all empty because
`prisma/seed.ts`'s `CATALOGUE` assigns every curated product to a top-level category, and the only
path that fills a subcategory — `seedGeneratedCatalogue` — was called for Aheed only.

**This spec was revised mid-slice.** The first implementation filled the second tier with
`generateProducts` output and was wrong: that generator assigns a noun from one global
**groceries-only** pool to a **random** subcategory, so it produced "Everyday Rice" under
`cleaning` and "Value Lentils" under SriMart's `sri-chargers-cables` — SriMart being an electronics
vendor. The requirements below describe the curated replacement that shipped. See `plan.md`.

R1. `prisma/seed.ts` defines a product fixture keyed on **subcategory slug** for each vendor, and
    every subcategory slug appearing in that vendor's `children` entries is a key with at least two
    products.

R2. Every product in those fixtures is plausibly a member of the subcategory it is keyed under, and
    SriMart's fixture contains only electronics/homeware — no grocery products.

R3. `seedSubcategoryProducts(vendorId, map)` creates those products against the subcategory
    resolved by slug, uploads each product's placeholder object **before** writing its row, and
    creates a primary `ProductImage` row plus an `Inventory` row for each.

R4. `seedSubcategoryProducts` is idempotent **per product slug**, so adding a product to one
    subcategory later reaches a database that already holds the others. A re-run creates zero and
    says so.

R5. `seedSubcategoryProducts` skips any fixture key with no matching category for that vendor, so
    one vendor's fixture is harmless when only the other vendor is seeded.

R6. No product slug in either subcategory fixture collides with an existing top-level fixture slug.
    (Slugs are unique per vendor, so a collision silently seeds one fewer row rather than failing —
    this is how `juices-soft-drinks` first shipped with a single product.)

R7. `seedGeneratedCatalogue` is called for **Aheed only**. `SEED_SCALE_PRODUCTS_SRIMART` does not
    exist: a groceries-only generator must never target the electronics vendor.

R8. `SEED_REMOVE_GENERATED` calls `removeGeneratedCatalogue` for **both** `AHEED_VENDOR_ID` and
    `SRIMART_VENDOR_ID`.

R9. `prisma/generate-catalogue.ts` is unmodified by this slice — in particular `GENERATOR_SEED` and
    `GENERATED_SLUG_PREFIX` are unchanged.

R10. In production, **every** category — top-level and subcategory, both vendors — has at least one
     product, and every subcategory has at least two.

R11. In production, zero products have a slug beginning `gen-`, for either vendor.

R12. In production, at most one product's images are all placeholders, and any such product is
     recorded in `build-notes.md` with the reason. (`Halal Chicken Thighs 1kg` is permanently
     refused by Workers AI — **#523**.)

R13. The curated subcategory products do not share image keys: among those with a non-placeholder
     image, the count of distinct `storageKey` values equals the number of such rows.

R14. A sample of at least five curated subcategory products' primary image keys return HTTP 200
     from **production's** `CDN_BASE_URL`.

R15. `CHANGELOG.md` updated (Gate 4).

R16. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
