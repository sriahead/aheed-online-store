# Catalogue safety layer — restrictions, explicit stock states, bulk review, audit (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

Issue `#1211`. Built on `feature/catalogue-restrictions-stock-states` from `staging` at `2e35710`;
the spec commit is `62039c8`. Owner rulings: `specs/decisions/ADR-007-…`.

**State at Clear:**
- **The migration is NOT applied to any database yet, including dev.** Applying it to dev is the
  first validation step (R4); see "Known-shaky areas".
- **Nothing was pushed.** No PR exists. No staging or production command ran in this slice (R37).
- **Local gates, as of the build commit:**
  - `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run kms:validate` are all
    green.
  - `npx vitest run --maxWorkers=4`: **3822 passed, 1 failed**. The failure is
    `tests/concurrency-slot-booking.test.ts`, which writes to the real dev DB through
    `DATABASE_URL` and fails with `The column stockMode does not exist in the current database`.
    It's expected until the migration is applied to dev, and CI skips this test because it has no
    `DATABASE_URL`.

## What changed and why

**Schema and migration.**
- `prisma/schema.prisma` gains:
  - `Product.restriction` (`ProductRestriction?`);
  - `Inventory.stockMode` (`StockMode @default(UNKNOWN)`);
  - two audit enums;
  - `model ProductRestrictionAuditLog`, with back-relations on `Vendor`, `User` and `Product`.
- **The diff is noisy but harmless.** `prisma format` realigned the columns of the
  `User`/`Vendor`/`Product` models, so the `git diff` looks large. `git diff -w` shows 63 added
  lines and nothing removed.
- **`prisma/migrations/20261022120000_p1211_restrictions_stock_states/migration.sql`** is Prisma's
  own offline output (`migrate diff --from-schema-datamodel <pre-change copy>
  --to-schema-datamodel prisma/schema.prisma --script`, touching no database), with the two
  deliberate edits its header describes:
  - `ADD COLUMN … DEFAULT 'TRACKED'` followed by `SET DEFAULT 'UNKNOWN'`;
  - the `CHECK "Product_restricted_inactive_check"`.

**One purchasability rule (`lib/cart-rules.ts`).**
- **New exports:**
  - `purchasableQuantity()`, `stockModeOf()`, `showsLowStock()` and `isStockMode()`;
  - `STOCK_MODES` and the `StockMode`/`ProductRestriction` string unions, kept here so the module
    stays Prisma-free;
  - two select fragments: `PURCHASABILITY_SELECT` (isActive, restriction and
    inventory{quantity, stockMode}) and `ELIGIBILITY_SELECT` (isActive and restriction only).
- **`effectiveStock` is deleted.**
- **Callers moved to the rule:**
  - `lib/repositories/cart.ts` (line mapping and `stockMap`);
  - `lib/repositories/orders.ts` (`placeOrder`'s availability check);
  - `lib/repositories/bundles.ts`;
  - `lib/repositories/products.ts`: the summary mapper, `getProductBySlug`, the suggest
    candidates and the list-match candidates.
- `ProductSummary`/`ProductDetail` gain `stockMode`.
- `components/product/ProductCard.tsx` and `QuickViewDrawer.tsx` use `showsLowStock()`, so "Only N
  left" appears only for `TRACKED`.
- `buildFilterWhere({inStockOnly})` now nests
  `inventory: { OR: [{stockMode:"UNTRACKED"},{stockMode:"TRACKED",quantity:{gt:0}}] }`.

**`placeOrder` and the cancellation paths.**
- Each line carries `tracked`. The decrement loop skips untracked lines, and its `WHERE` includes
  `stockMode: "TRACKED"`.
- Both `inventory.updateMany … increment` restores (in `releaseOrder` around line 639, and in
  `cancelConfirmedOrder` around line 1987) filter `stockMode: "TRACKED"`.
- `lib/repositories/reports.ts` `getCatalogueHealth` reads `TRACKED` rows only.

**Restriction rules (`lib/product-restriction.ts`, pure).**
- `decideEnable`, `decideSetRestriction`, `allowedRestrictionTargets` and `planBulkAction`.
- Helpers: `bulkEnableOutcome`, `summarisePlanRisks`, `stricterOf`, `severity`, `isHardBlock` and
  `actorFromVia`.
- Labels and copy: `RESTRICTION_LABELS`, `STOCK_MODE_LABELS`, `ENABLE_CONFIRMATION_TEXT` (exactly
  the plan.md sentence), `BULK_SKIP_LABELS` and `restrictedEnableError`.

**Writes (`lib/repositories/product-restrictions.ts`, with the facade
`lib/product-restrictions-service.ts`).**
- `setProductRestriction`, `clearRestrictionAndEnable` (plus the shared `clearAndEnableInTx`),
  `loadBulkCandidates`, `previewBulkAction`, `applyBulkAction` and `listRestrictionAudit`.
- **Every write is one WebSocket `$transaction`.**
- **Every per-product write is conditional on the state the plan was made from**, so a product that
  changed underneath is reported, never forced.
- **The repository refuses role-agnostically:** it never clears a hard block, never loosens via
  set, and never clears a restriction other than the one confirmed.
- **R19's guard lives in `updateProductForVendor` and `quickUpdateInventory`**
  (`lib/repositories/products.ts`). Both now select `restriction` and refuse `isActive: true` on a
  restricted product before writing anything.

**Server actions (`features/admin/product-restrictions.ts`, `"use server"`, async exports only).**
- The actions are `setRestrictionAction`, `clearAndEnableAction` and `bulkProductAction`
  (intent = preview, apply or reset).
- State shapes, initial values, parsers and `BULK_PRODUCTS_FORM_ID` live in the plain module
  `lib/product-restriction-form.ts`.
- **The actor is always derived from `requireVendorRole`'s `via`**, never from the form.

**UI.**
- **Product form** (`components/staff/ProductForm.tsx`, fed by `lib/catalogue-form.ts`, which
  requires `stockMode`):
  - a "Stock tracking" select;
  - the "Visible in the shop" checkbox is replaced by explanatory text when the product is
    restricted, so a restricted product's save submits no `isActive`.
- **`components/staff/ProductRestrictionPanel.tsx`**, rendered on `/staff/products/[id]`:
  - the current restriction;
  - an ADMIN tighten-only selector;
  - an ADMIN clear-and-enable form (confirmation checkbox and required reason), shown only for an
    overridable restriction;
  - for a hard block, explanation text and no control;
  - the restriction history (newest 20).
- **`/staff/products`:**
  - Restriction, Stock and Per page filters, parsed in `lib/staff-products-query.ts`;
  - a checkbox per row bound with `form="bulk-products"`;
  - restriction and stock badges;
  - `components/staff/BulkProductActions.tsx`: preview, the warning lists, confirmation, apply,
    and the summary.
- **`/staff/inventory` (`InventoryTable.tsx`):**
  - the +/- control is shown only for `TRACKED`, and other rows show their mode label;
  - the restriction label sits under the toggle;
  - a refused toggle reverts and shows the message.
- `lib/products-service.ts` `listProductsForAdmin` now takes the repository's own options type.

**Import policy (`lib/catalogue-import-policy.ts`, pure, no department names).**
- `classifyImportRow`, `newImportedProductState`, `reimportedProductState` and
  `normaliseDepartment`.

**Inventory creates now state their mode explicitly (R15).**
- `prisma/seed.ts` (three sites);
- `prisma/fish-products-write.ts`;
- `scripts/verify-repository-injection.ts` and `scripts/verify-unit-price-sort.ts`.

**Tests.**
- **New files:**
  - `tests/cart-rules.test.ts` (R6);
  - `tests/product-restriction.test.ts` (R16, R17, R23);
  - `tests/catalogue-import-policy.test.ts` (R31–R33);
  - `tests/purchasability-single-source.test.ts` (R8);
  - `tests/product-restriction-audit-append-only.test.ts` (R28);
  - `tests/catalogue-health-stock-modes.test.ts` (R14).
- **Extended:**
  - `tests/search-repository.test.ts` (R13);
  - `tests/catalogue-form.test.ts` (R15a);
  - `tests/staff-products-query.test.ts` (R22).
- **Fixtures updated for the new fields:** `cart-add-outcome`, `cart-bulk-add-report`,
  `cart-notes`, `concurrency-slot-booking`, `orders`, `products-repository`,
  `search-suggest-route`, the five card/quick-view/label fixtures, and `cart.test.ts` (its
  `effectiveStock` block moved to `cart-rules.test.ts`).
- **The new fixture fields are fail-closed by design.** `purchasableQuantity` treats a missing
  `restriction` (undefined) as restricted, and a missing `stockMode` as `UNKNOWN`. Every
  pre-existing double therefore had to say `restriction: null` and `stockMode: "TRACKED"`.
  `tests/orders.test.ts` supplies both defaults inside its `product.findMany` double instead of
  restating them in 30 fixtures.

**`scripts/verify-restrictions-stock-states.ts`** is the dev-DB checks for R4b/c, R10, R11, R15,
R18, R19, R26, R27, plus the R29 IMPORT-row fixture and the R12 storefront fixtures.

**Docs.**
- `docs/staff-playbook/staff-tabs-guide.md` 2.14.0 (R34).
- `specs/architecture.md` 1.43.0 and ADR-007 were written at Spec (commit `62039c8`).

**Deferred items, filed at Build-notes (Project #2, Phase P11, Backlog):**
- **`#1212`:** age verification at handover with a record of the check (`#1200` option 2). Until it
  ships, `AGE_RESTRICTED` stays a hard block.
- **`#1213`:** bulk actions applied across a whole filter, and bulk set-restriction.
- **`#1214`:** no audited path to correct a mis-tagged hard-blocked product.

## Decisions taken during the build

- **The migration was generated offline, not hand-typed.** Following `#1134`'s precedent, I used
  `prisma migrate diff` from a saved copy of the pre-change schema, so the DDL is exactly Prisma's
  apart from the two marked edits. No database was touched to generate it.
- **A missing `restriction` field reads as restricted.** In `purchasableQuantity`, `undefined !==
  null` is true, so a query that forgot to select `restriction` blocks the sale rather than
  allowing it. That is why `PURCHASABILITY_SELECT`/`ELIGIBILITY_SELECT` exist and every caller
  spreads one.
- **`ELIGIBILITY_SELECT` exists for a reason beyond tidiness.**
  `tests/storefront-product-visibility.test.ts` reads every inline `isActive: true` object literal
  in `products.ts` (above the admin marker) as a storefront WHERE that must carry
  `visibleCategoryWhere`. A `select` containing `isActive: true` false-positives that guard, so the
  two select blocks spread a named constant instead. I didn't weaken the guard.
- **The form parser refuses a missing `stockMode`** (blank, unknown or lower-case) rather than
  defaulting it. The form always submits the field, so absence means a broken caller.
- **`MARK_UNTRACKED` creates missing rows.** For products with no `Inventory` row it creates one
  (`quantity 0`, `UNTRACKED`) with `createMany({skipDuplicates})`, then runs `updateMany` for the
  rest, both inside the transaction. A product already `UNTRACKED` plans as `NO_CHANGE`.
- **Bulk outcome kinds.** A bulk ENABLE of an already-active clean product plans `NO_CHANGE` and is
  reported under **skipped**, with the reason "Already in that state". A conditional write that
  matches 0 rows is reported under **failed** ("Changed since you selected it — nothing was
  written").
- **`applyBulkAction` writes per product, not as one set-based `updateMany`.** That costs up to 100
  statements, but it lets the summary say exactly which products changed.
- **`listRestrictionAudit` shows `actor.name || actor.email`**; a null actor renders as "Import"
  when `source` is IMPORT, otherwise "Unknown user".
- **Preview has no hidden `intent` input;** each button carries its own `name="intent"`. A hidden
  `intent=apply` would precede the Cancel button's value in `FormData`, so Cancel would have
  applied.
- **The bulk confirmation and reason are offered only for ENABLE** and only to an ADMIN with at
  least one overridable product selected (`offersConfirmation`). For Hide and Mark untracked, the
  preview still lists the restricted products in the selection, under "Restricted products in this
  selection (they stay restricted)".

## Deviations from the spec

1. **R8: the guard excludes one generated file.** `tests/purchasability-single-source.test.ts`
   skips `app/(admin)/staff/runbook/docs.ts`. That file is generated by `kms:build-index` and embeds
   the specs and `architecture.md` as text, which quote both forbidden patterns. It is
   documentation, not code. No other exclusion exists.
2. **R15: the form-driven paths write `input.stockMode`, not the literal `"TRACKED"`.**
   `createProductForVendor` and `updateProductForVendor` (create and update branches) write the
   form's value, because R15a, added at Spec, makes the mode a form field that defaults to
   `TRACKED` for a new product. `ProductWriteInput.stockMode` is **required**, so these paths still
   can never fall through to the DB's `UNKNOWN` default, which was R15's intent.
   `quickUpdateInventory`'s create branch and every seed/script site do write the literal
   `"TRACKED"`. So R15's validation grep for `stockMode: "TRACKED"` matches the seed and quick
   paths; for `products.ts` create/update, check for `stockMode: input.stockMode` instead.
3. **R23: `planBulkAction` takes the requested ids as well.** Its signature is
   `planBulkAction(action, requestedIds, products, actor, confirmation)`, adding `requestedIds` to
   the spec's `(action, products, actor, confirmation)`. It needs the ids to report a foreign id as
   `SKIPPED: NOT_FOUND` and to keep request order; `products` holds only what the vendor-scoped
   query found.
4. **The validation fixture model changed** (already amended in `validation.md` "Setup"). The spec
   said the script deletes its fixtures and their audit rows on exit, but R28 forbids deleting
   audit rows anywhere in `scripts/`, and the audit FK is `Restrict`. The fixtures are therefore
   persistent `zz-1211-*` products, reset at every run start, left hidden on exit; audit
   assertions count only rows since the run started. Dev accumulates a few fixture products and
   audit rows. That is by construction, not a leak.
5. **R4c:** the script prints the observed `.code` for each adapter rather than asserting a
   specific value. The requirement is "rejected"; the codes are evidence for a future `error.code`
   predicate (CLAUDE.md).

## Known-shaky areas

- **Apply the migration to dev first, and confirm the host.**
  - Run the per-variable `printenv` check from `validation.md` Setup first.
  - Then run `npx prisma migrate status` and confirm the datasource host is the dev host from
    `secrets/`.
  - Then `npx prisma migrate deploy`. Auto mode has blocked `migrate deploy` even on dev before, so
    hand the user a `! …` command if needed.
  - **`#895`:** dev also carries a modified, already-applied migration. `migrate deploy` (unlike
    `migrate dev`) should not demand a reset; if it does, stop. **Never accept `migrate reset`.**
- **`placeOrder` from a Node script is unproven.** The script deletes `STRIPE_SECRET_KEY` from its
  process to get the stub payment adapter, and calls `placeOrder` through a PrismaNeon client cast
  to the app type. No script in this repo had driven `placeOrder` before. If R10 fails on setup
  (address, slot, `CheckoutError` codes) rather than on the rule, read the error before concluding
  a defect.
- **Untracked line cap:** an `UNTRACKED` cart line is capped at `MAX_ADD_QUANTITY` (99) by
  `purchasableQuantity`, and placeOrder doesn't decrement. The accepted race (UNTRACKED→TRACKED
  mid-checkout sells one order without a decrement) is documented in `plan.md`.
- **The quick-view drawer** fetches `ProductDetail` through an API route as JSON. Check that
  `stockMode` actually arrives, or the low-stock line silently never shows for `TRACKED` either
  (R12c is checked on the product card; check the drawer by eye too).
- **R20 and R24 need a browser or curl as STAFF and as ADMIN.** The repo's demo accounts are in
  `docs/developer-portal/local-dev-playbook.md`. Product form refusal: a restricted product's form
  shows no checkbox, so to prove the server refuses, post the action with `isActive=on` by curl.
- **`InventoryTable` result typing:** `updateInventoryAction` returns `{ok:false,error}` in three
  shapes; the toggle reads `result.error`. Check the refusal message text renders (R15b).
- **CLAUDE.md asks for a second vendor (SriMart)** for UI checks. The restriction UI uses semantic
  tokens only (`text-danger`, `bg-danger-tint`, `bg-surface-muted`), but nothing was eyeballed.
- **Not yet run:** `npm run build` (webpack), `npm run preview`, and `kms:assemble:internal` plus
  the `kms/site-internal` Next build after the guide edit. Run them in Validate.
