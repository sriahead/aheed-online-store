# Fish products: 18 reviewable products under Fresh Fish and Frozen Fish (build notes)

## What changed and why

- **`prisma/fish-products.ts` (new, pure):** `FISH_PRODUCTS` (the plan's 18 rows), `planFishProducts`
  (creates only; blocked until the Fish tree exists; skips a slug that already exists, in any
  category; notes a hidden department), `toSeedProducts` (the dev-seed shape, stock 20) and
  `describeFishChange`. Each change is shaped like `ProductWriteInput`, with the claim fields set to
  explicit neutral values, so the writer can spread it straight into the repository call.
- **`prisma/fish-products-write.ts` (new, no Prisma import):** `writeFishProductChanges(create,
  categoryIds, changes, { active, stock })` and `toProductInput`. The create function is an argument so
  the skip, stop and thrown-error behaviour is tested with a fake instead of a database. A
  `field: "slug"` refusal is counted as skipped; any other refusal or a throw stops the run.
- **`scripts/add-fish-products.ts` (new):** modelled on `scripts/apply-department-changes.ts`. Arguments
  are validated before `DIRECT_URL` is read, the target host is printed before connecting, dry run is
  the default, and writes go through `createProductForVendor` using the Node client and the WebSocket
  adapter (the nested inventory create needs it).
- **`prisma/seed.ts`:** one import and `...toSeedProducts()` at the end of `AHEED_SUBCATEGORY_PRODUCTS`.
  The existing `seedSubcategoryProducts` pass does the writing, with its per-product-slug idempotency
  and placeholder images. SriMart's map and `FISH_DEPARTMENT.products` are unchanged.
- **`tests/add-fish-products.test.ts` (new, 24 cases):** the expected table is written out in the test,
  not imported, so a changed price in the module fails it.
- **`docs/staff-playbook/staff-tabs-guide.md` 2.12.0:** one paragraph in the Catalogue section on
  products that arrive switched off. It names only controls that exist: "Visible in the shop"
  (`components/staff/ProductForm.tsx`) and Live Inventory & Availability (`/staff/inventory`).
- **`CHANGELOG.md`** (Gate 4) and regenerated `ARTIFACT_INDEX.md` / `app/(admin)/staff/runbook/docs.ts`.

## Decisions taken during the build

- **No separate net content in the dev seed.** The seed's `CatalogueProduct` shape has no net content,
  so a seeded Fish product shows its stored unit label. The module computes that label with
  `deriveUnitPriceLabel`, so it reads the same as the derived one would. Widening the seed type was
  rejected as out of scope.
- **Claim flags are passed as `false`, not left `undefined`.** `ProductWriteInput` allows `undefined`
  (the vendor's label settings strip a switched-off label). Passing `false` writes the column default
  explicitly and is what R4 asks for.
- **`lowStockThreshold` is 3**, the schema default, as a named constant in the writer. It is not a
  decision about Fish.
- **Unit label for each-priced fish is `£3.99 / each`**, whatever `deriveUnitPriceLabel` returns for the
  `EACH` unit, rather than the seed's older `£3.20 each` style. R3 requires equality with the
  function, so the module follows it.
- **The writer receives `categoryIds` from the plan** (`FishProductPlan.categoryIds`), so the script
  does not look categories up a second time.
- **`--stock` is parsed strictly** (digits only, 0 to 1000): `-1`, `1001`, `abc` and a missing value are
  all refused before any connection.
- **Output order:** dry run prints the count and then the "Dry run only" line last; `--apply` prints
  `done: ...` and then the count last, so each run ends on the line a reader looks for.
- **Descriptions avoid every unverifiable word**, including "skin-on", "boneless" and "freshly". They
  name the cut or form, the pack size and the allergen only.

## Deviations from the spec

Two rows of `validation.md` were wrong and were corrected in the build commit. Neither changes a
requirement.

- **R4 grep.** The row grepped the whole module for the forbidden words, which also matches the
  module's own header comment and field names such as `isHalal`. It is now limited to `description:`
  lines, where the rule applies. The test already covers the same words per description.
- **R19 grep.** The row grepped `app/` for the text `fish-products`, which matches the generated
  `app/(admin)/staff/runbook/docs.ts` that embeds this slice's plan. It is now an import check
  (`from ... fish-products`), which is what R19's wording says. `#1145`'s spec excluded that file for
  the same reason.

The module exports a few names beyond R1's three (`describeFishChange`, the types, `FISH_PRODUCTS`'s
`FishProduct`). They are used by the script and the writer; nothing outside the slice imports them.

## Known-shaky areas

- **The write path has not been run against a database.** This build session had no dev database or
  credentials. Everything under R12 to R16 (dry run count, `--apply`, the second run, the blocked
  vendor, the stored unit-price key) is verified only by the unit tests and by running the script
  without a database (R10 and R11 behave as specified: no `--vendor`, bad `--stock`, empty
  `DIRECT_URL`, and `target database host: example.invalid` as the first line). The validator must run
  the live rows. Typecheck proves `createProductForVendor` accepts the script's Node client (a
  deliberate type error in the script was caught), but not that the nested create commits over the
  WebSocket adapter. That is the single most likely failure.
- **Setup order matters for the live rows.** Do not run `npx prisma db seed` first: the seed would
  create the 18 products and leave the script nothing to create (`validation.md` setup step 4).
- **R17 is proved by the unit test and a grep, not a seed run.** A clean-database seed needs a new
  database. Report it as not run.
- **The script's `main()` has no automated test.** Argument handling was exercised by hand. A future
  refactor of `parseArgs` has no regression net beyond the live rows.
- **The prices are indicative.** Hilsa (Ilish) Cuts 1kg at 14.99 and Kingfish (Seer) Steaks 1kg at 9.99
  are the figures most likely to be wrong. Owner review is tracked on `#1148`.
- **Mutation checks done in the build session:** changing a price, setting a claim flag, and adding
  "organic" to a description each failed the suite, and the module was restored afterwards. They are
  not repeatable from a script.
- **Branch hygiene.** `docs/p1142-merged-handoff` (pushed, no PR) edits `docs/model-handoff.md`, which
  the Document stage will also edit. Tracked on `#1149`.

## Project-State Handoff Check

Yes, and deliberately deferred to `/document`: `docs/model-handoff.md` is the file the unmerged
`docs/p1142-merged-handoff` branch edits, so editing it here would conflict. What the Document stage
must record there:

- `#1145` is merged to `staging` (PR #1146, `66b25d5`) and `deploy-staging` succeeded.
- `#1147`: the script, the production order (department script, then this script, hidden), and that
  production has none of the Fish tree yet.
- Environment facts a future session would rediscover: `gh pr` and `gh project` use GraphQL and fail
  here, so use `gh api` (REST) for PRs and issues, and the delivery board cannot be updated from a
  session; `gh auth status` reports an invalid token but REST calls still work.
- Open follow-ups: `#1148` (owner data for the Fish products), `#1149` (docs loose ends).
