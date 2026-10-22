# Catalogue safety layer — restrictions, explicit stock states, bulk review, audit (requirements / acceptance criteria)

Issue `#1211`. These are the acceptance criteria for the owner's Gate 1 rulings in
`specs/decisions/ADR-007-storefront-scope-restrictions-stock-states.md`.

In one line: a product can be marked restricted. `PROHIBITED` and `AGE_RESTRICTED` can never be
enabled. `NOT_DELIVERABLE` and `NEEDS_REVIEW` can be enabled only by an ADMIN who confirms and gives
a reason, which is audited. Stock has three explicit states, `UNKNOWN`, `TRACKED` and `UNTRACKED`,
and one function decides purchasability everywhere. `/staff/products` gains bulk
enable/disable/untrack. An import policy creates everything hidden. `plan.md` holds the reasoning
and the decision tables these requirements cite.

"Actor ADMIN" means `requireVendorRole` returned `via: "ADMIN"` or `via: "platform-admin"`.
"Actor STAFF" means `via: "STAFF"`.

## Schema and migration

R1. `prisma/schema.prisma` declares:
- `enum ProductRestriction { PROHIBITED AGE_RESTRICTED NOT_DELIVERABLE NEEDS_REVIEW }`;
- `Product.restriction ProductRestriction?`;
- `enum StockMode { UNKNOWN TRACKED UNTRACKED }`;
- `Inventory.stockMode StockMode @default(UNKNOWN)` (non-null).

R2. `prisma/schema.prisma` declares `model ProductRestrictionAuditLog` with exactly these fields:
- `id` (uuid);
- `vendorId` (FK Vendor);
- `productId` (FK Product, no `onDelete`, so the default `Restrict`);
- `action ProductRestrictionAuditAction` (`RESTRICTION_SET | RESTRICTION_CLEARED`);
- `fromRestriction ProductRestriction?`;
- `toRestriction ProductRestriction?`;
- `actorUserId String?` (FK User, `onDelete: SetNull`);
- `source ProductRestrictionChangeSource` (`PRODUCT_FORM | BULK_ACTION | IMPORT`);
- `reason String?`;
- `createdAt DateTime @default(now())`;
- `@@index([vendorId, productId, createdAt])`.

R3. Exactly one new migration directory exists under `prisma/migrations/` for this slice. Its header
comment states that it was hand-authored because `migrate dev` refuses on dev (`#895`). Its SQL:
- (a) contains no `DROP`;
- (b) adds `Inventory.stockMode` with `DEFAULT 'TRACKED'` and then
  `ALTER COLUMN "stockMode" SET DEFAULT 'UNKNOWN'`, and contains no `UPDATE` statement;
- (c) adds `CONSTRAINT "Product_restricted_inactive_check" CHECK (NOT ("isActive" AND "restriction" IS NOT NULL))`.

R4. After the migration is applied to the **dev** database (never staging or production in this
slice):
- (a) every `Inventory` row that existed before it has `stockMode = 'TRACKED'`;
- (b) a new `Inventory` row created with no `stockMode` gets `UNKNOWN`;
- (c) updating a product to `isActive = true` while its `restriction` is non-null is rejected by
  Postgres. This must be shown through **both** `getPrisma()` (HTTP adapter) and `getPrismaWs()`
  (WebSocket adapter).

R5. `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <dev shadow>`
reports no difference other than the `CHECK` constraint (which Prisma cannot model), **or** the
validation step records why the shadow comparison could not run. Whichever applies, the migration's
column, enum, index and FK names match Prisma's conventions (`<Model>_pkey`, `<Model>_<col>_fkey`,
`<Model>_<cols>_idx`).

## One purchasability rule

R6. `lib/cart-rules.ts` exports `purchasableQuantity(input)`, where `input` is
`{ isActive: boolean; restriction: ProductRestriction | null; inventory: { stockMode: StockMode; quantity: number } | null | undefined }`.
It returns:

| Input | Result |
| --- | --- |
| `restriction` non-null | `0` |
| `isActive` false | `0` |
| `inventory` null/undefined, or `stockMode` `UNKNOWN` | `0` |
| `TRACKED` | `max(quantity, 0)` |
| `UNTRACKED` | `MAX_ADD_QUANTITY`, whatever `quantity` is |

R7. `lib/cart-rules.ts` no longer exports `effectiveStock`. `grep -rn "effectiveStock" lib app
features components` returns nothing.

R8. A test in `tests/` fails if any file under `lib/`, `app/`, `features/` or `components/`
(excluding `*.test.*`) contains the regex `inventory\??\.quantity\s*\?\?\s*0\)\s*>\s*0` or
`quantity:\s*\{\s*gt:\s*0\s*\}` outside `lib/repositories/products.ts`'s `buildFilterWhere`.

R9. Each of the following derives availability by calling `purchasableQuantity` and selects
`restriction` and `inventory.stockMode` for it:
- the cart (`lib/repositories/cart.ts`, line mapping and `stockMap`);
- `placeOrder` (`lib/repositories/orders.ts`);
- bundles (`lib/repositories/bundles.ts`);
- every storefront product mapper in `lib/repositories/products.ts` that sets `inStock` or
  `stockQuantity`.

R10. In `placeOrder`:
- (a) a cart line whose product has `purchasableQuantity === 0` throws `CheckoutError` code
  `LINE_UNAVAILABLE`;
- (b) the stock-decrement `updateMany` runs only for lines whose product's `stockMode` was
  `TRACKED`, and its `where` includes `stockMode: "TRACKED"`;
- (c) a line for an `UNTRACKED` product issues no `inventory` write.

R11. Every `inventory.updateMany` in `lib/repositories/orders.ts` whose `data` contains
`increment` includes `stockMode: "TRACKED"` in its `where`.

R12. Storefront display, under `npm run preview`:
- (a) a product with `stockMode UNTRACKED` (active, unrestricted) shows "In stock", has an enabled
  Add button, and shows no "Only N left" text and no low-stock badge;
- (b) a product with `stockMode UNKNOWN` (active, unrestricted) shows "Out of stock" with a
  disabled Add button;
- (c) a `TRACKED` product with quantity 2 and threshold 3 still shows "Only 2 left".

R13. `buildFilterWhere({ inStockOnly: true })` returns a `where` whose `inventory` filter matches
`UNTRACKED` rows and `TRACKED` rows with quantity > 0. That `OR` is nested under `inventory`, never
at the top level of the returned object.

R14. The staff low-stock report (`lib/repositories/reports.ts`) counts only `TRACKED` rows in its
out-of-stock and low-stock figures.

R15. Every code path that creates an `Inventory` row from a staff-entered quantity sets
`stockMode: "TRACKED"` explicitly:
- `createProductForVendor`;
- `updateProductForVendor`'s upsert `create`;
- `quickUpdateInventory`'s upsert `create`;
- every `inventory` create/createMany in `prisma/seed.ts`.

R15a. The staff product form (`components/staff/ProductForm.tsx`) has a "Stock tracking" select
with the three values `TRACKED`, `UNTRACKED` and `UNKNOWN`. It defaults to `TRACKED` for a new
product and to the stored value for an existing one. `lib/catalogue-form.ts` validates it, and
saving persists it to `Inventory.stockMode`. Saving never changes `quantity` because of a mode
change.

R15b. `/staff/inventory`:
- shows each row's stock mode;
- renders the quantity +/- control only for `TRACKED` rows;
- when the active toggle is refused (R19), shows the refusal message and reverts the optimistic
  state, instead of leaving the toggle showing "active".

## Restriction rules

R16. `lib/product-restriction.ts` (no `"use server"`, no I/O) exports `decideEnable`. Its result
for every combination of restriction (5 values including none) × actor (STAFF, ADMIN) × confirmed
(true/false) × reason (blank/non-blank) equals the table in `plan.md` "Hard block versus admin
override". `PROHIBITED` and `AGE_RESTRICTED` return `REFUSED: HARD_BLOCK` for **every**
combination.

R17. `decideSetRestriction(from, to, actor)` returns:

| Case | Result |
| --- | --- |
| actor STAFF | `REFUSED: ADMIN_ONLY` |
| actor ADMIN, `to` less severe than `from` (severity `PROHIBITED` > `AGE_RESTRICTED` > `NOT_DELIVERABLE` > `NEEDS_REVIEW`) | `REFUSED: WOULD_LOOSEN` |
| `to` equals `from` | `NO_CHANGE` |
| otherwise | `ALLOWED` |

R18. The repository functions `setProductRestriction` and `clearRestrictionAndEnable`
(`lib/repositories/product-restrictions.ts`) each take `prismaWs`, `vendorId` and `actorUserId` as
parameters, read no request context, and run in one `$transaction`:
- **`setProductRestriction`** writes the restriction **and** `isActive = false`, and appends one
  `RESTRICTION_SET` audit row.
- **`clearRestrictionAndEnable`:**
  - refuses `PROHIBITED`/`AGE_RESTRICTED` without writing;
  - otherwise writes `restriction = null, isActive = true` with a `where` that includes the
    restriction the caller confirmed;
  - appends one `RESTRICTION_CLEARED` audit row carrying the reason;
  - when the conditional write matches 0 rows, it writes no audit row and returns a "changed since
    you loaded it" skip.

R19. `updateProductForVendor` and `quickUpdateInventory` return `{ ok: false }` with a message
naming the restriction, and write nothing, when asked to set `isActive = true` on a product whose
`restriction` is non-null. That holds whatever the caller's role.

R20. Through the real server actions, under `npm run preview`, as STAFF and as ADMIN against
fixture products for each restriction class:
- (a) STAFF cannot enable any restricted product through the product form, the inventory toggle,
  the clear-and-enable control or bulk Enable;
- (b) ADMIN cannot enable a `PROHIBITED` or `AGE_RESTRICTED` product through any of them, even
  with confirmation and a reason;
- (c) ADMIN enables a `NOT_DELIVERABLE` and a `NEEDS_REVIEW` product only when confirmation is
  ticked **and** the reason is non-blank;
- (d) STAFF cannot set a restriction.

R21. The new server actions live in a `"use server"` module that exports only async functions. Any
state constants, action result types and the confirmation copy live in a plain module.

## Bulk actions

R22. `/staff/products` renders a selection checkbox per row, a "select all on this page" control, a
`perPage` choice of 25 or 100 (default 25, any other value treated as 25), and the three actions
Enable, Disable and Mark stock untracked. It also gains two list filters, parsed in
`lib/staff-products-query.ts` with unknown values ignored:
- `restriction`: `any`, `none`, or one class;
- `stock`: one of the three modes.

Each row shows its restriction class and stock mode.

R23. `lib/product-restriction.ts` exports `planBulkAction(action, products, actor, confirmation)`:
- each product's outcome under `ENABLE` equals `decideEnable` for that product alone;
- `DISABLE` and `MARK_UNTRACKED` never change `restriction`, and `MARK_UNTRACKED` never changes
  `isActive`;
- products not belonging to the vendor are reported `SKIPPED: NOT_FOUND`.

R24. The bulk Preview response lists, by product name and restriction class:
- every hard-blocked product, under a heading containing "will be skipped";
- every overridable restricted product, under a heading containing "only if you confirm".

For an ADMIN with at least one overridable product selected, Preview renders the confirmation
checkbox (the copy from `plan.md`) and a required reason field. For STAFF, overridable products are
listed as skipped (`ADMIN_ONLY`) and no confirmation is offered.

R25. The bulk Apply action recomputes the plan from the database, ignoring any plan sent by the
client, and writes in one `getPrismaWs()` transaction. It returns `{ updated, skipped, failed }`,
each a list of `{ productId, name, reason? }`, and the page renders all three lists.

R26. Bulk Enable over a mixed selection of 6 fixture products (one clean, one `NEEDS_REVIEW`, one
`NOT_DELIVERABLE`, one `AGE_RESTRICTED`, one `PROHIBITED`, one already active), applied by an ADMIN
with confirmation and reason, ends with:
- clean, `NEEDS_REVIEW` and `NOT_DELIVERABLE` active, with the two restrictions cleared;
- `AGE_RESTRICTED` and `PROHIBITED` unchanged and reported skipped (`HARD_BLOCK`);
- the already-active product reported updated or skipped as no-op, never failed;
- exactly two new `RESTRICTION_CLEARED` audit rows, with `source BULK_ACTION`, the ADMIN's user id
  and the reason.

The same selection applied by STAFF ends with only the clean product active and no audit rows.

R27. Bulk Mark stock untracked over products with and without an `Inventory` row ends with every
selected product having `stockMode UNTRACKED`, and with `isActive` and `restriction` unchanged on
all of them.

## Audit

R28. No file under `lib/`, `app/`, `features/`, `scripts/` or `prisma/` (excluding `migrations/`)
calls `productRestrictionAuditLog.update`, `.updateMany`, `.upsert`, `.delete` or `.deleteMany`. A
test in `tests/` enforces this.

R29. `/staff/products/[id]` shows the product's restriction (or "None") and its newest 20 audit
entries with time, action, from → to, actor name (or "Import"), source and reason.
- For an ADMIN it renders a restriction selector offering only allowed values (R17).
- For an overridable restriction it renders a clear-and-enable control with the confirmation
  checkbox and reason field.
- For a hard block it renders explanatory text and **no** enable control.
- For STAFF it renders neither control.

## Import policy

R30. `lib/catalogue-import-policy.ts` (pure, no I/O, no vendor or department names in its source)
exports `classifyImportRow`, `newImportedProductState` and `reimportedProductState` with the
semantics in `plan.md` "Import policy".

R31. With a test fixture policy mapping `TOBACCO`/`ALCOHOL` → `AGE_RESTRICTED`, `INSTANT LOTTERY` →
`PROHIBITED`, `PHONE CARDS`/`NEWS`/`E-PAY`/`STAMPS` → `NOT_DELIVERABLE`, and
`uncertainDepartments: ["DEFAULT"]`:

| Row | Classification |
| --- | --- |
| `" tobacco "` | `AGE_RESTRICTED` (case- and whitespace-insensitive) |
| `DEFAULT` | `NEEDS_REVIEW` |
| any department at price `0` | `NEEDS_REVIEW`, unless the department maps to something stricter |
| `TOBACCO` at price `0` | `AGE_RESTRICTED` |
| `GROCERY` at £1.99 | `null` |

R32. `newImportedProductState` returns `isActive: false` and `stockMode: "UNKNOWN"` for every
restriction value **including `null`**.

R33. `reimportedProductState`, tested over every (existing restriction × existing isActive ×
incoming restriction) combination:
- never returns `isActive: true` when existing `isActive` is false;
- never returns a restriction less severe than the existing one;
- returns `isActive: false` whenever the returned restriction is non-null;
- does not re-apply an incoming `NEEDS_REVIEW` over an existing `null`;
- returns no `stockMode` or `quantity` key.

## Documentation and closure

R34. `docs/staff-playbook/staff-tabs-guide.md` documents:
- the restriction classes;
- who may enable which;
- the confirmation and reason;
- the three stock states;
- bulk actions and their summary.

Every capability sentence added there corresponds to a real control (traceable in the
`validation.md` row).

R35. `specs/architecture.md` gains a section "Restricted products and stock states (`#1211`,
ADR-007)" stating the `CHECK` invariant, the three stock states, the single purchasability
function and the import policy contract. `specs/decisions/ADR-007-…` exists with `status: approved`.

R36. `#1196` and `#1200` each carry a comment recording the owner's 2026-10-22 ruling and linking
ADR-007. `#1201` carries a comment adding "write every create and re-import through
`lib/catalogue-import-policy.ts`" to its requirements and restating that it remains blocked on the
client's answers. `#1201` is not closed or unblocked by this slice's PR: the PR body's closing
keywords name `#1211` only.

R37. No command in this slice runs against the staging or production database or Worker. Every
Prisma CLI command is run with `DIRECT_URL`/`DATABASE_URL` unset in the process environment, and
its datasource host is recorded as the dev host.

R38. `CHANGELOG.md` updated (Gate 4).

R39. `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run format:check`,
`npm run kms:validate` and `npm run kms:coverage` all remain green after this slice.
