# Production catalogue seed, cross-environment image copy, and scheduled image fills (requirements)

Issue **#518**; answers the decision deferred in **#504**. Production holds 21 real-catalogue
products and 11 top-level categories with no subcategories, while the storefront code promoted in
PR #517 renders subcategories, a featured row and `/bundles`. This slice seeds production's real
catalogue (never the `gen-*` scale set), carries the eight already-generated images for the newly
added products across from staging rather than paying to regenerate them, and adds a capped
scheduled job that fills images for products added later. See `plan.md` for why the copy must be
slug-keyed and driven by the destination's need rather than the source's contents.

R1. `lib/storage.ts`'s `StorageService` interface declares `getObject(key: string):
    Promise<ArrayBuffer | null>`, and the `aws4fetch`-backed implementation returned by
    `getStorage()` implements it: an existing key resolves to an `ArrayBuffer` whose byte length
    equals the object's size, and a key with no object resolves to `null` rather than throwing.

R2. A unit test asserts `getObject` returns `null` for a 404 response and an `ArrayBuffer` for a
    200 response, without performing real network I/O.

R3. `scripts/copy-product-images.ts` exists and requires both `--from <env-file>` and
    `--to <env-file>`; invoked with either flag missing it exits non-zero and prints a usage line
    naming both flags.

R4. Before performing any read or write, `scripts/copy-product-images.ts` prints the resolved
    source and destination database hosts and bucket names — host and bucket only, never a full
    connection string or any credential.

R5. `scripts/copy-product-images.ts` exits non-zero without copying anything when the source and
    destination resolve to the same `S3_BUCKET`.

R6. `scripts/copy-product-images.ts` selects its work from the **destination** database: products
    whose image rows are all placeholders (`storageKey` ending `/main.svg`) or which have no image
    row at all. It never enumerates products from the source database as the driving set, so a
    product absent from the destination (for example staging's `p5b-validation-fixture`) is never
    created there.

R7. For each such destination product, `scripts/copy-product-images.ts` matches the source product
    by `(vendorId, slug)` and copies the bytes of the source's primary non-placeholder image to a
    **newly minted destination key** from `buildProductImageKey(<destination product id>)` — not
    the source's key. A destination product with no matching source product, or whose source match
    has no non-placeholder image, is skipped and reported, not failed.

R8. After `scripts/copy-product-images.ts` copies an image for a product, that product has exactly
    one `isPrimary: true` image row, it points at the newly minted key, and the placeholder row it
    replaced no longer exists.

R9. Running `scripts/copy-product-images.ts` a second time against the same pair of environments
    copies 0 images and reports 0, leaving every row and object from the first run unchanged.

R10. `scripts/fill-product-images.ts` exists, requires `--env-file <path>`, accepts `--limit <N>`,
     and fills at most `N` products in one run. It prints the resolved database host and bucket
     before acting. Its default limit, applied when `--limit` is omitted, is a finite number no
     greater than 25.

R11. `scripts/fill-product-images.ts` constructs its own `PrismaClient` from the bare
     `@prisma/client` specifier and passes it explicitly to every repository function it calls. The
     file contains no import of `@/lib/products-service`, `@/lib/db`, or `@prisma/client/wasm`.

R12. `npx tsx scripts/fill-product-images.ts --env-file <file> --limit 0` runs to completion and
     exits 0, performing no image generation — proving the script loads and runs in real Node
     without the WASM query compiler.

R13. A GitHub Actions workflow file exists that runs `scripts/fill-product-images.ts` on both a
     `schedule:` cron and a `workflow_dispatch:` trigger, passes an explicit `--limit`, and reads
     its database and storage configuration from GitHub environment secrets rather than a committed
     file.

R14. `prisma/seed.ts` is unmodified by this slice (`git diff` against the base branch reports no
     change to that file).

R15. After the production seed run, production's database contains the four previously-missing
     Aheed top-level categories, at least 29 real-catalogue products, at least 31 subcategories, and
     zero products whose slug begins with `gen-`.

R16. After the production seed and copy runs, production has zero products whose images are all
     placeholders, and every one of the eight newly added products
     (`dog-food-2kg`, `cat-litter-5kg`, `infant-formula-900g`, `baby-wipes-80pk`,
     `toothpaste-100ml`, `shampoo-400ml`, `frozen-chicken-nuggets`, `frozen-peas-1kg`) has a
     primary image whose object returns HTTP 200 from production's CDN.

R17. `CHANGELOG.md` updated (Gate 4).

R18. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
