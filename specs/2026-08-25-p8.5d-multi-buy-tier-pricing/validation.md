# P8.5d — Multi-buy Tier Pricing (validation)

## Before any row below that touches the database

This slice **ships a migration**. CI applies migrations via `prisma migrate deploy` only at merge, so
a fresh-context `/validate` runs against a schema one migration behind this branch. Skipping this is
not a soft failure — the write-path rows crash with a real Postgres error that looks exactly like a
code defect.

1. **Confirm which database the Worker is actually on.** `npm run preview` reads `.dev.vars`;
   `prisma migrate` and `db:seed` read `.env`. Diff both against `secrets/staging.vars` and
   `secrets/production.vars` before trusting any live result (CLAUDE.md — two files drift into
   agreement on the *wrong* target as easily as they drift apart). Confirm the target host is **not**
   production.
2. `npx prisma migrate status` — expect this slice's migration reported as pending.
3. `npm run db:migrate` (or `db:migrate:dev`) against `DIRECT_URL`. Additive and safe.
4. `npm run db:seed`.
5. `npm run preview` — **never `npm run dev`**, which cannot load `@prisma/client/wasm` and renders a
   silent error state on every DB-touching route.

If `npm run preview` fails to build with `EBUSY ... rmdir '.open-next\assets'`, an orphaned
`workerd.exe`/`wrangler` chain from a previous run still holds the directory — enumerate with
`Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='workerd.exe'"`, match on this repo's
path, and `taskkill /F /PID` the whole chain.

## Rows

| Req | How to verify |
|-----|---------------|
| R1  | `npx prisma validate` exits 0; read the `ProductPriceTier` block in `prisma/schema.prisma` and confirm each of `id`, `vendorId`, `productId`, `groupQuantity`, `groupPricePence`, `isActive`, `createdAt`, `updatedAt` plus the `Vendor` and `Product` relations is present. |
| R2  | `grep -n "@@unique(\[vendorId, productId\])" prisma/schema.prisma` and `grep -n "@@index(\[vendorId, isActive\])" prisma/schema.prisma` each return a line inside the `ProductPriceTier` block (confirm by line number against R1's block, since other models carry similar attributes). |
| R3  | `ls prisma/migrations` shows exactly one directory not present on `c2564e9`. In its `migration.sql`, `grep -icE "^ *ALTER TABLE"` counts only statements adding foreign keys for `ProductPriceTier` itself — read each matched line; any `ALTER TABLE` naming `Product`, `Order`, `OrderItem`, `DiscountCode` or `DiscountRedemption` as its target is a failure. |
| R4  | `git diff c2564e9 -- prisma/schema.prisma` — confirm no hunk falls inside the `DiscountCode`, `DiscountRedemption`, `OrderItem` or `enum DiscountKind` blocks. Relation back-references added to `Vendor` and `Product` are expected and are not a failure. |
| R5  | `grep -nE "^import .*(@/lib/db\|@prisma/client\|next/headers\|@/lib/tenant\|@/lib/auth)" lib/tier-pricing.ts` returns no matches. `npx vitest run tests/repository-purity.test.ts` exits 0. |
| R6  | `npx vitest run tests/tier-pricing.test.ts` exits 0. Then independently re-derive one case by hand: qty 7, `groupQuantity` 3, `groupPricePence` 1000, `basePrice` 400 → `2 × 1000 + 1 × 400 = 2400`. Confirm the function returns `2400`, not `2333` or `2400.5`. |
| R7  | Covered by R6's test run. Confirm the specific case exists: a tier of `groupQuantity` 2 / `groupPricePence` 1000 against `basePrice` 400 (i.e. the "tier" is worse than base) returns `800` for qty 2, not `1000`. |
| R8  | Covered by R6's test run. Confirm the saving for the R6 hand-derived case is `2800 - 2400 = 400`, and that a `null` tier yields `0`. |
| R9  | `npx vitest run tests/tier-pricing.test.ts` — read the test file and confirm cases exist at quantities `groupQuantity - 1`, `groupQuantity`, `groupQuantity + 1` and `2 × groupQuantity` for a non-divisible tier (3 for £10.00). A passing run with only one quantity tested does **not** satisfy this row. |
| R10 | `npx tsc --noEmit` exits 0. Read `TotalsLine` and confirm the new field is optional (`?`). `npx vitest run tests/order-totals.test.ts` exits 0, and `git diff c2564e9 -- tests/order-totals.test.ts` shows only **additions** — if any pre-existing case was modified to keep it passing, the field is not backward-compatible and this row fails. Note `lib/repositories/orders.ts` *is* an edited call site by design (it supplies the new field); the row is about callers that don't. |
| R11 | Read `lib/repositories/cart.ts` around the `lineTotalPence` assignment and confirm it calls `lib/tier-pricing.ts`'s function rather than multiplying. Then live: with the seeded tiered product in a guest cart at a qualifying quantity, load the cart under `npm run preview` and confirm the rendered line total equals the hand-derived figure from R6. |
| R12 | Read `placeOrder`'s line construction and `OrderItem` create in `lib/repositories/orders.ts`; confirm `lineTotalPence` comes from the tier function and `unitPricePence` is still the product's base price. Then live: place a real order through `npm run preview` at a tiered quantity and query the resulting `OrderItem` row — `unitPricePence` is the base price, `lineTotalPence` is the tiered total. |
| R12a | `npx vitest run` — read the test asserting cross-vendor isolation and confirm it seeds a tier under vendor A and checks vendor B's identical product prices at base. Additionally `grep -n "productPriceTier" lib/repositories/*.ts` and confirm every `where` clause on that model names `vendorId`. A test that only ever exercises one vendor does not satisfy this row. |
| R13 | **The row guarding this slice's most likely defect — run it, don't infer it.** Under `npm run preview`, build a basket qualifying for a tier, record the cart's displayed subtotal, complete checkout, then read `Order.subtotalPence` for the created order. The two figures must be equal. Cart display (`lib/repositories/cart.ts`) and checkout (`lib/repositories/orders.ts`) are independent code paths; no unit test comparing either to itself can prove this. |
| R14 | `grep -n "minimumOrderPence" lib/repositories/orders.ts` — read the surrounding comment and confirm it states a tier is a price inside the judged subtotal. Then live: set a basket whose base subtotal clears the vendor minimum but whose tiered subtotal does not, and confirm checkout refuses with the below-minimum error. |
| R15 | Live under `npm run preview`: create a `PERCENTAGE` code at a known basis-point value via `/staff/discounts`, apply it to a tiered basket, complete checkout, and confirm `Order.discountPence` equals `floor(tieredSubtotal × value / 10000)` — specifically that it is computed from the tiered subtotal, not the pre-tier one. Record both figures so the distinction is visible in the result. |
| R16 | Live under `npm run preview`: load a category page containing the seeded tiered product and confirm the badge renders with its group quantity and group price. Load a page containing a product with no tier and confirm no such badge appears. Verify against **rendered HTML**, not the component source. |
| R17 | Live: view a product carrying both an `originalPrice` markdown and an active tier. Confirm both claims render and that the struck-through `originalPrice` figure and the tier badge figure are different numbers describing different things. Do **not** check this by grepping for the absence of the word "save" — `ProductCard` has rendered a legitimate per-product saving since P2.5b1, and P8.5c's `plan.md` records this exact trap. |
| R18 | Live: with the tiered product in the cart at a qualifying quantity, confirm the cart line displays the saving figure hand-derived in R8. |
| R19 | Live, signed in as a vendor `ADMIN`: create a tier on a product through `/staff/products`, reload and confirm it persisted; edit its group price and confirm the change; deactivate it and confirm the storefront badge disappears. Separately: read `features/admin/catalogue.ts` and confirm every `export` is an `async function` — a same-file value export makes **every** action in that file 500 at runtime while `build`/`typecheck`/`test` all stay green (#159). |
| R20 | `npm run db:seed` exits 0 against a database already carrying this slice's migration. Then query `ProductPriceTier` grouped by `vendorId` and confirm both seeded vendors have at least one active row — a one-vendor seed passes a naive count and is the exact gap #276 exists for. |
| R21 | Read `specs/roadmap.md`'s P8.5 paragraph and confirm it no longer claims P8.5d discharges #147, and that it names #147/#146/#148/#149 as remaining open. Confirm by reading the prose, not by grepping for an absent word. |
| R22 | `git log --format=%B c2564e9..HEAD \| grep -inE "(close\|fix\|resolve)[sd]? +#(146\|147\|148\|149\|151)"` returns no matches. After opening the PR, `gh pr view <N> --json closingIssuesReferences` lists **only** #348. Run the same regex against the PR body text. Scoped to commit messages and the PR body deliberately — those are the only surfaces GitHub's closing-keyword scanner reads; file prose is not one, and checking it would only reward deleting the explanation. |
| R23 | `ls specs/2026-08-25-p8.5d-multi-buy-tier-pricing/` shows all four files. `npm run kms:validate` exits 0 reporting `invalid front-matter (failing): 0`. Because this slice edits `specs/*.md`, also run `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` and **read its real exit status** — do not pipe it through `tail`, which reports the pipe's success rather than the build's. |
| R24 | `git diff c2564e9 -- CHANGELOG.md` is non-empty and describes what shipped, why, and what is deferred. |
| R25 | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` each exit 0 locally; then confirm the `gates` workflow is green on the PR. **CI is the authority** — a local `format:check` disagreement is real drift now that `.gitattributes` pins LF (PR #328), not the old `core.autocrlf` artifact. |

## Rows that cannot be checked without a live environment

R11–R20 all require `npm run preview` against a migrated, seeded database. If the validating
environment has no outbound network, report each as **unverified with the reason** — never as
passing. R13 and R15 in particular have no static substitute: both exist precisely because reading
the code cannot prove what two independent paths do at runtime.
