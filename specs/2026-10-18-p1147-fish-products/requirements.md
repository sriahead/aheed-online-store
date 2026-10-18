# Fish products: 18 reviewable products under Fresh Fish and Frozen Fish (requirements / acceptance criteria)

Closes `#1147`. The reasoning is in `plan.md`; the 18 products, their slugs, prices and net content
are the table in `plan.md` ("The 18 products"). Data only: no schema change, no migration, no
live prices.

Terms. **Aheed** is the vendor `aheed-food-centre`. **The Fish tree** is the department `fish` with
its children `fresh-fish` and `frozen-fish`. **The table** is the plan's product table. **Created
hidden** means `isActive` false and inventory quantity 0. A **dry run** is the script without
`--apply`.

## A. The data module

R1. `prisma/fish-products.ts` exists and exports `FISH_PRODUCTS`, `planFishProducts` and
    `toSeedProducts`. Its text
    contains no import from `@prisma/client` or `@/lib/db`, no `node:fs`, and no `process.env`.

R2. `FISH_PRODUCTS` has exactly 18 entries that equal the table row for row: slug, name,
    subcategory slug, price in pence, and net content amount and unit. 8 entries are in `fresh-fish`
    and 10 in `frozen-fish`. Every slug matches `^[a-z0-9]+(-[a-z0-9]+)*$`, is at most 80 characters
    and is unique within the list. Every price is a positive integer and every net content amount is a
    positive integer.

R3. Every create-product change that `planFishProducts` returns carries a `unitLabel` equal to
    `deriveUnitPriceLabel(basePricePence, netContent)` from `components/product/unit-price.ts`, and
    that value is not null.

R4. Every create-product change carries `origin` null, `brandId` null, `originalPrice` null, no
    price tier, no attribute values, and `isHalal`, `isFresh`, `isOrganic`, `isVegetarian`,
    `isGlutenFree`, `isHmcCertified` and `isFeatured` all false. Every description matches
    `^.{10,200} Contains: (Fish|Crustaceans|Molluscs)\.$`, ends in `Crustaceans.` for exactly the two
    prawn slugs, ends in `Molluscs.` for exactly `squid-rings-500g`, and contains none of these words,
    ignoring case: halal, organic, msc, hmc, certified, sustainab, wild, farmed, caught, scottish,
    norwegian, british, local, premium, freshly.

## B. The planner

R5. `planFishProducts` takes the vendor's categories (id, slug, parent id, active flag) and the
    vendor's existing product slugs, and returns `changes`, `notes` and `blocked`. When the Fish tree
    is complete and no listed slug exists, `changes` holds 18 `create-product` changes in table order
    and `blocked` is null.

R6. When the department `fish` is missing, or `fresh-fish` or `frozen-fish` is missing, or either is
    not a child of the `fish` department, `blocked` is a non-empty string that names
    `scripts/apply-department-changes.ts` and `changes` is empty.

R7. A listed slug that already exists in the vendor's products, in any category, yields no change
    for that slug and one note that names it. When all 18 slugs exist, `changes` is empty. The only
    change kind that exists is `create-product`; there is no update or delete kind.

R8. When the department `fish` is inactive, the plan still lists the 18 changes and adds a note that
    the department is hidden.

## C. The writer and the script

R9. `prisma/fish-products-write.ts` exports `writeFishProductChanges`, which takes the create function,
    a map from subcategory slug to category id, and the options `active` and `stock` as arguments,
    imports nothing from `@prisma/client` or `@/lib/db`, and applies the changes one at a time in
    order. For each change it calls the create function with `categoryId` taken from the map,
    `isActive` equal to `active`, `quantity` equal to `stock`, `isFeatured` false, and every field the
    change defines passed through unchanged. A create result that is not ok with `field` equal to `"slug"` is counted as
    skipped and the run continues. Any other not-ok result, or a thrown error, stops the run, is
    reported with the product's slug, and leaves the products already created in place.

R10. `scripts/add-fish-products.ts` exists. Run without `--vendor`, it prints a message naming
     `--vendor` and exits 1 before reading `DIRECT_URL`. Run with an invalid `--stock` (not an
     integer from 0 to 1000), it exits 1 before connecting. Run with `DIRECT_URL` empty, it exits 1.

R11. With `DIRECT_URL` set, the script's first line of output is `target database host: <host>`, the
     host being that of `DIRECT_URL`, printed before any connection is attempted.

R12. Without `--apply`, the script writes nothing. It prints each planned product on its own line,
     a final line `Dry run only: nothing written. Add --apply to write these products.`, and a line
     `products in the Fish tree: <n>`. Two dry runs in a row print the same n.

R13. With `--apply`, the script creates each planned product through `createProductForVendor`
     (imported from `@/lib/repositories/products`), by way of `writeFishProductChanges`. Each product
     is created in its subcategory with `isActive` false and quantity 0 unless `--active` or
     `--stock <n>` is given. `--active` passes `active` true. `--stock <n>` passes `stock` n.
     The script contains no `$queryRaw`, `$executeRaw` or `Prisma.sql`.

R14. A second `--apply` on the same database prints that there are no products to create and
     creates none. A product whose price was edited between the two runs keeps the edited price.

R15. For a vendor without a complete Fish tree, the script writes nothing, exits 1, and prints the
     plan's `blocked` message.

R16. A product created by the script has a stored unit-price sort key equal to
     `deriveUnitPricePenceForSort(basePrice, netContent)`, and its storefront price per kilo or per
     each is the derived one, because it is created through `createProductForVendor`.

## D. The dev seed

R17. `toSeedProducts()` returns an object with exactly the keys `fresh-fish` (8 entries) and
     `frozen-fish` (10 entries), each entry having the table's slug, name and price, a description,
     the unit label of R3 and `quantity` 20. `prisma/seed.ts` spreads it into
     `AHEED_SUBCATEGORY_PRODUCTS` and nowhere else, so a seeded Aheed database holds those products
     active with the placeholder image. `FISH_DEPARTMENT.products` is still the empty list and the
     SriMart maps are unchanged.

## E. Containment

R18. `git diff origin/staging --stat` shows no change to `prisma/schema.prisma`,
     `prisma/migrations`, `package.json`, `package-lock.json`, `prisma/department-changes.ts`,
     `scripts/apply-department-changes.ts`, `lib/repositories/products.ts` or
     `tests/apply-department-changes.test.ts`.

R19. No file under `app/`, `components/`, `lib/` or `features/` imports `prisma/fish-products` or
     `prisma/fish-products-write`, and none of those folders contains `runtime = "edge"`.

## F. Tests, docs and the delivery gates

R20. `tests/add-fish-products.test.ts` exists and covers R2 to R9 without a database: the table
     equality, the claim and description rules, each planner case, and the writer's skip and stop
     behaviour with a fake create function. `npx vitest run tests/add-fish-products.test.ts` exits 0.

R21. `docs/staff-playbook/staff-tabs-guide.md` is at version 2.12.0, and its Catalogue section says
     that a product can arrive switched off with no stock, and names the steps to put it on sale: check
     the price, add a photo, set opening stock on the Inventory page, and tick "Visible in the shop".
     Each control and page it names exists in the code.

R22. `CHANGELOG.md` has an `[Unreleased]` entry naming `#1147`, the 18 products, the hidden and
     zero-stock defaults, `--active` and `--stock`, that nothing is written without `--apply`, and
     that the two production commands are run by hand, in order: `apply-department-changes.ts`, then
     `add-fish-products.ts`. The pull request base is `staging` and its body says `Closes #1147`.

R23. `npm run lint`, `npm run typecheck`, `npx vitest run` (alone), `npm run format:check` and
     `npm run build` all exit 0. `npm run kms:validate` prints `invalid front-matter (failing): 0`.
     `npm run kms:build-index`, `npm run kms:check-generated` (after committing),
     `npm run kms:assemble:internal` and a real Next build in `kms/site-internal` each exit 0. This
     slice's `plan.md` contains no bare `<` directly before a digit and no `{` outside a code span.
     CI on the pull request is green.
