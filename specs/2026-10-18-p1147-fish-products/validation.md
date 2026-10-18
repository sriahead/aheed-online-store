# Fish products: 18 reviewable products under Fresh Fish and Frozen Fish (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice writes data, so the weight is on the pure planner (unit), the script against a real dev
database (integration), and proof that a live shop cannot be exposed to an invented price (safety).

1. **Unit Testing** — the data, the planner, the writer's failure handling, the seed mapping.
2. **Integration Testing** — the script against the dev database: dry run, apply, re-run, blocked.
3. **System / End-to-End Testing** — the products in the real storefront and staff panel.
4. **Regression & Acceptance Testing** — nothing outside the Fish tree changes.
5. **Security & Accessibility Testing** — no claim about a product that nobody has verified.

---

## Setup for the live rows

**Reading the table:** a Markdown table cell cannot hold a bare pipe, so every `\|` in a command below
stands for a single `|` (a shell pipe or a regex alternation). Type it without the backslash. Commands
are written for Git Bash.

1. `npm ci`, then `npm run db:generate`.
2. Confirm the target is the **dev** database: compare the host in `DIRECT_URL` with the hosts in
   `secrets/staging.vars` and `secrets/production.vars`, by reading single keys
   (`grep '^DIRECT_URL=' <file>`). Never `source` an env file. If it matches staging or production, stop.
3. The dev database must already hold the Fish tree and **no** Fish products. Dry run first
   (R12): it must list 18 products. If it lists none because the products exist, the seed ran after
   this slice: report the live rows R12 to R16 as not run, and say why.
4. Do **not** run `npx prisma db seed` before the live rows R12 to R16: the seed would create the 18
   products and leave nothing for the script to create.
5. Staging and production rows are **owner-run**. A validator without those credentials reports them
   as not run, never as passed. This slice writes nothing to staging or production during validation.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `ls prisma/fish-products.ts` succeeds. `grep -nE "export (const\|function) (FISH_PRODUCTS\|planFishProducts\|toSeedProducts)" prisma/fish-products.ts` prints three lines. `grep -nE "@prisma/client\|@/lib/db\|node:fs\|process\.env" prisma/fish-products.ts` prints nothing. |
| R2  | Unit | `npx vitest run tests/add-fish-products.test.ts` exits 0, and its cases assert the 18 rows against the plan's table (slug, name, subcategory, pence, amount, unit), the 8 and 10 split, the slug pattern, uniqueness and the 80-character limit. Read the test: the expected values are written out in the test, not imported from the module. |
| R3  | Unit | Same run. A case asserts each change's `unitLabel` equals `deriveUnitPriceLabel(price, netContent)` and is not null. The test must import `deriveUnitPriceLabel` and call it, not repeat its arithmetic. |
| R4  | Unit | Same run. Cases assert the neutral values on every change, the description regex, `Crustaceans.` on exactly `raw-king-prawns-300g` and `raw-king-prawns-peeled-500g`, `Molluscs.` on exactly `squid-rings-500g`, and the forbidden-word list. Then `grep -niE "halal\|organic\|msc\|hmc\|certified\|sustainab\|wild\|farmed\|caught\|scottish\|norwegian\|british\|local\|premium\|freshly" prisma/fish-products.ts` prints only lines inside the test-facing constant that lists those words, or nothing. |
| R5  | Unit | Same run. A case with the full Fish tree and no products expects 18 `create-product` changes in table order and `blocked` null. |
| R6  | Unit | Same run. Cases: no `fish`; no `fresh-fish`; no `frozen-fish`; `fresh-fish` under another parent. Each expects `blocked` to contain `scripts/apply-department-changes.ts` and `changes` to equal an empty array. |
| R7  | Unit | Same run. Cases: one existing slug (in a different category) gives 17 changes and a note naming it; all 18 existing gives none; a plan computed after applying its own changes is empty. `grep -n "kind:" prisma/fish-products.ts` shows only `create-product`. |
| R8  | Unit | Same run. A case with `fish` inactive expects 18 changes and a note containing `hidden`. |
| R9  | Unit | Same run. Cases with a fake create function: a `{ ok: false, field: "slug" }` result is counted as skipped and the next product is still attempted; a `{ ok: false, field: "name" }` result stops the run, the report names the slug, and the products before it stay in the created list; a thrown error behaves the same. Further cases assert the input the fake create function receives: with `active` false and `stock` 0 it gets `isActive` false and `quantity` 0; with `active` true and `stock` 10 it gets `isActive` true and `quantity` 10; `categoryId` comes from the map; `isFeatured` is false. `grep -nE "@prisma/client\|@/lib/db" prisma/fish-products-write.ts` prints nothing. |
| R10 | Integration | `DIRECT_URL= npx tsx scripts/add-fish-products.ts; echo $?` prints a message naming `--vendor` and `1`. `npx tsx scripts/add-fish-products.ts --vendor aheed-food-centre --stock abc; echo $?` and with `--stock 1001` and `--stock -1` each exit `1` before any `target database host` line. With `--vendor aheed-food-centre` and `DIRECT_URL=` (empty), the exit is `1`. |
| R11 | Integration | `DIRECT_URL="postgresql://u:p@example.invalid/db" npx tsx scripts/add-fish-products.ts --vendor aheed-food-centre 2>&1 \| head -1` prints exactly `target database host: example.invalid`. |
| R12 | Integration | On the dev database: `npx tsx scripts/add-fish-products.ts --vendor aheed-food-centre` prints 18 product lines, the line `Dry run only: nothing written. Add --apply to write these products.`, and `products in the Fish tree: 0`. Run it twice: the count printed is `0` both times. |
| R13 | Integration | `grep -n "createProductForVendor" scripts/add-fish-products.ts` prints an import and a use; `grep -nE "queryRaw\|executeRaw\|Prisma\.sql" scripts/add-fish-products.ts prisma/fish-products*.ts` prints nothing. Then `npx tsx scripts/add-fish-products.ts --vendor aheed-food-centre --apply` on dev: the log ends `products in the Fish tree: 18`. In `/staff/products` signed in as dev staff, the 18 products are listed, each unchecked on "Visible in the shop", and `/staff/inventory` shows quantity 0 for each. Then edit one product's price in `/staff/products` for R14. The effect of `--active` and `--stock` is proved by R9's cases, and live by the staging rows below. |
| R14 | Integration | Using the product edited in R13 (price changed to a value that is not in the table): `npx tsx scripts/add-fish-products.ts --vendor aheed-food-centre --apply` prints that there are no products to create and `products in the Fish tree: 18`. Reopen the product in `/staff/products`: the edited price is still there. |
| R15 | Integration | `npx tsx scripts/add-fish-products.ts --vendor srimart --apply; echo $?` on dev (SriMart has no Fish tree) prints the blocked message naming `scripts/apply-department-changes.ts`, writes nothing and exits `1`. If the dev database has no `srimart` vendor, report the row as not run and rely on R6. |
| R16 | Integration | For one created product with net content, `/products/<slug>` is not reachable while hidden, so check in `/staff/products` that net content amount and unit are filled in as in the table. After temporarily ticking "Visible in the shop" on `whole-silver-pomfret-800g` (tick it back afterwards and record that you did), `/products/whole-silver-pomfret-800g` shows a price per kilo equal to the output of `deriveUnitPriceLabel(699, { amount: 800, unit: "GRAM" })` (699 pence over 0.8 kg, about 8.74 pounds a kilo). Compute the expected text by calling the function from a scratch file kept outside the repo (a `-e` one-liner does not work: dynamic import puts the exports under `default`): `import { deriveUnitPriceLabel } from "<repo>/components/product/unit-price"; console.log(deriveUnitPriceLabel(699, { amount: 800, unit: "GRAM" }));`, run with `npx tsx <file>`. At the time of writing it prints `£8.74 / kg`. |
| R17 | Unit | `npx vitest run tests/add-fish-products.test.ts` exits 0 with cases for `toSeedProducts()`: the two keys, 8 and 10 entries, `quantity` 20, the unit label of R3. `grep -n "toSeedProducts" prisma/seed.ts` prints one import and one spread inside `AHEED_SUBCATEGORY_PRODUCTS`. `grep -n "toSeedProducts" prisma/seed.ts` shows no use in `SRIMART_SUBCATEGORY_PRODUCTS`. `grep -n "products: \[\]" prisma/department-changes.ts` still prints the Fish entry. A clean-database seed run is not part of this row (it needs a new database); report it as not run. |
| R18 | Regression | `git diff origin/staging --stat -- prisma/schema.prisma prisma/migrations package.json package-lock.json prisma/department-changes.ts scripts/apply-department-changes.ts lib/repositories/products.ts tests/apply-department-changes.test.ts` prints nothing. |
| R19 | Regression | `grep -rnE "fish-products" app components lib features` prints nothing. `grep -rnE "runtime *= *.edge." app components lib features` prints nothing. |
| R20 | Unit | `npx vitest run tests/add-fish-products.test.ts` exits 0. `git diff origin/staging --name-status -- tests/` shows exactly `A tests/add-fish-products.test.ts`. |
| R21 | Docs | `grep -n "^version" docs/staff-playbook/staff-tabs-guide.md` shows `2.12.0`. Read the new paragraph in the Catalogue section. Trace each named control: `grep -rn "Visible in the shop" components/staff/ProductForm.tsx` prints the checkbox label; `ls "app/(admin)/staff/inventory"` succeeds; the photo step is the product photographs control the section already describes. Any sentence naming a control that does not exist fails the row. |
| R22 | Gate 4 | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1147`, the 18 products, hidden and zero stock, `--active`, `--stock`, `--apply`, and the two production commands in the order `apply-department-changes.ts` then `add-fish-products.ts`. Once the PR is open, `gh api repos/sriahead/aheed-online-store/pulls/<n> --jq '.base.ref, (.body \| test("Closes #1147"))'` prints `staging` and `true`. |
| R23 | Gate 3 | Stop preview first. One at a time, each alone: `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check`, `npm run build`. Then `npm run kms:validate` (prints `invalid front-matter (failing): 0`), `npm run kms:build-index`, `npm run kms:check-generated` (after committing), `npm run kms:assemble:internal`, and `(cd kms/site-internal && npm ci && npx next build --webpack)`. `grep -nE "<[0-9]" specs/2026-10-18-p1147-fish-products/plan.md` prints nothing, and `grep -n "{" specs/2026-10-18-p1147-fish-products/plan.md` prints nothing outside a backtick span. CI on the PR (`quality.yml`) is the ground truth. |

## After merge: owner-run rows (not required for the slice to pass validation)

These need staging or production credentials. A validator without them reports each as not run.

| Step | How to verify |
|------|---------------|
| S1 staging dry run | With `DIRECT_URL` from `secrets/staging.vars`: `npx tsx scripts/add-fish-products.ts --vendor aheed-food-centre` prints the staging host first, 18 product lines, and `products in the Fish tree: 0`. |
| S2 staging apply | Same command with `--apply --active --stock 10`. The log ends `products in the Fish tree: 18`. On the staging storefront, Fish, then Fresh Fish shows 8 products and Frozen Fish shows 10, each with a price per kilo or per each, none with a photo. A product can be added to the cart (stock 10). |
| S3 owner review | The owner confirms or corrects the 18 names, weights and prices. A correction is a follow-up change. |
| S4 production order | After the promotion to `main` and a green `deploy-production`: `npx tsx scripts/apply-department-changes.ts --vendor aheed-food-centre --apply`, then `npx tsx scripts/add-fish-products.ts --vendor aheed-food-centre --apply` (no `--active`, no `--stock`). Then `/staff/products` on production lists 18 products, all unchecked on "Visible in the shop", and the storefront Fish pages show none of them. |

<!--
  Final step for the validator: record which dev database was used, which products you created on it
  (18, hidden, stock 0), the one price you edited for R14, and that you re-hid the product you made
  visible for R16.
-->
