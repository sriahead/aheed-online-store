# Catalogue safety layer — restrictions, explicit stock states, bulk review, audit (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
> 
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Setup (every DB-touching row)

- **Dev database only.** Before any Prisma CLI or script run, run
  `for v in DIRECT_URL DATABASE_URL; do if printenv "$v" >/dev/null 2>&1; then echo "$v SET"; fi; done`.
  It must print nothing. If it prints a variable, prefix every command with
  `env -u DIRECT_URL -u DATABASE_URL`. Then confirm that `npx prisma migrate status`'s datasource
  host matches the dev host in `secrets/` (print the **host only**). Stop if it names staging or
  production.
- **Fixtures.** `scripts/verify-restrictions-stock-states.ts` (built in this slice) creates its own
  fixture products under Aheed, prefixed `zz-1211-`. It **deletes them, their inventory rows and
  their audit rows on exit, including on failure**. Rows R4, R10, R11, R15, R18, R19, R26 and R27
  are checks inside that script. Each check prints `PASS <Rn> …` or `FAIL <Rn> …`, and the script
  exits non-zero on any FAIL.
- **The script must exercise the adapter each check targets.** It constructs **both** `getPrisma()`
  (`PrismaNeonHttp`) and `getPrismaWs()` (`PrismaNeon`), and names which one each check used. A
  check that used the wrong adapter is a FAIL, not a pass (CLAUDE.md, `#232`).
- **UI rows** run under `npm run preview`, never `npm run dev`. Sign in as Aheed's demo ADMIN and
  STAFF accounts. Server actions may be driven with `curl` per
  `docs/developer-portal/local-dev-playbook.md`; prefix `MSYS_NO_PATHCONV=1` in Git Bash.
- **Reset first.** Run the script's cleanup before starting. A previous run's fixtures must not
  carry over.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `grep -nE "enum ProductRestriction\|enum StockMode\|restriction +ProductRestriction\?\|stockMode +StockMode +@default\(UNKNOWN\)" prisma/schema.prisma` shows all four. `npm run db:generate` exits 0. |
| R2  | Unit | `awk '/^model ProductRestrictionAuditLog \{/,/^\}/' prisma/schema.prisma`: the field list and index equal R2 exactly. `productId`'s relation has no `onDelete`; `actorUserId`'s has `onDelete: SetNull`. |
| R3  | Unit | `git diff --name-only origin/staging -- prisma/migrations` lists exactly one new directory. Its `migration.sql`: the header names `#895`; `grep -ci "drop"` on the non-comment lines = 0; `grep -ciE "^\s*update "` = 0; it contains both `DEFAULT 'TRACKED'` and `SET DEFAULT 'UNKNOWN'`, and the exact `CHECK` text from R3(c). |
| R4  | Integration | Before applying, record `SELECT count(*) FROM "Inventory"` on dev. Apply with `npx prisma migrate deploy` once the dev host is confirmed (if auto mode blocks it, hand the user the `!` command). Then: (a) `SELECT count(*) FROM "Inventory" WHERE "stockMode" <> 'TRACKED'` = 0 before the script creates any fixture; (b) script check `PASS R4b`; (c) script checks `PASS R4c-http` and `PASS R4c-ws`, each attempting the forbidden update through the named adapter, expecting a rejection, and printing the error `.code` it observed. |
| R5  | Integration | Run R5's `migrate diff` against dev's shadow URL. Expected output: empty, or only the `CHECK` constraint. If no shadow database is available, record that, and compare the migration's identifier names by hand against `prisma/migrations/20260927140000_p918_attribute_kinds_numbers/migration.sql`. |
| R6  | Unit | `tests/cart-rules.test.ts` has a table test covering every case in R6, including `UNTRACKED` at quantity −5 (returns 99), `TRACKED` at −3 (returns 0), and a restricted active product (returns 0). |
| R7  | Unit | `grep -rn "effectiveStock" lib app features components` prints nothing. |
| R8  | Unit | The guard test exists and passes. Temporarily add `inStock: (row.inventory?.quantity ?? 0) > 0,` to any file under `lib/`: the test fails. Revert. |
| R9  | Unit | `grep -n "purchasableQuantity" lib/repositories/cart.ts lib/repositories/orders.ts lib/repositories/bundles.ts lib/repositories/products.ts` shows a call in each file. Each select feeding it includes `restriction: true` and `stockMode: true`. |
| R10 | Integration | Script checks, each running `placeOrder` through `getPrismaWs()`, the client it uses in production: `PASS R10a` (an `UNKNOWN` line and a restricted line each throw `LINE_UNAVAILABLE`); `PASS R10b` (a `TRACKED` quantity-1 line decrements to 0); `PASS R10c` (an `UNTRACKED` line places an order, and that product's `Inventory.quantity` and `updatedAt` are unchanged). |
| R11 | Unit + Integration | `grep -n -B4 "increment" lib/repositories/orders.ts`: every `inventory.updateMany` `where` shows `stockMode: "TRACKED"`. Script check `PASS R11`: cancelling the R10c order leaves the `UNTRACKED` product's quantity unchanged. |
| R12 | E2E | Under `npm run preview`, open the storefront page of each of three fixture products (`/products/zz-1211-…`) and one category page listing them, and read the rendered text. (a) `UNTRACKED`: "In stock", Add enabled, no "Only" text. (b) `UNKNOWN`: "Out of stock", Add disabled. (c) `TRACKED` quantity 2 with threshold 3: "Only 2 left". Then add the `UNTRACKED` product to the cart and reach `/checkout` without an availability error. |
| R13 | Unit | A test calls `buildFilterWhere({ inStockOnly: true })` and asserts that `Object.keys(result)` excludes `OR` and that `result.inventory.OR` holds the two branches. |
| R14 | Unit | A test for the reports repository, with a double `prisma` returning rows of all three modes, asserts that `UNTRACKED` and `UNKNOWN` rows contribute to neither count. |
| R15 | Unit + Integration | `grep -nE "inventory.*(create\|upsert\|createMany)" -A6 lib/repositories/products.ts prisma/seed.ts`: each block includes `stockMode: "TRACKED"`. Script check `PASS R15`: `quickUpdateInventory` with a quantity, on a product with no inventory row, creates a `TRACKED` row. |
| R15a | E2E + Unit | `tests/` covers `lib/catalogue-form.ts` accepting the three values and rejecting `"FOO"`. Under `npm run preview`, as STAFF: a new product's select shows `TRACKED`. Change a fixture `TRACKED` product with quantity 4 to `UNTRACKED` and save: dev shows `stockMode UNTRACKED`, `quantity 4`. |
| R15b | E2E | Under `npm run preview`, open `/staff/inventory`: an `UNTRACKED` fixture row shows its mode and no +/- control; a `TRACKED` row shows the control. Toggle a `NEEDS_REVIEW` fixture active: the refusal message renders, the toggle returns to inactive, and dev still shows `isActive false`. |
| R16 | Unit | `tests/product-restriction.test.ts` enumerates all 5×2×2×2 = 40 combinations against an inline copy of `plan.md`'s table, and separately asserts that every `PROHIBITED` and `AGE_RESTRICTED` combination returns `HARD_BLOCK`. |
| R17 | Unit | The same file covers every (from, to) pair over the 5 values (including null), for both actors, against R17's outcomes. |
| R18 | Integration | Script checks over `getPrismaWs()`: `PASS R18-set` (restriction written, `isActive` false, one audit row); `PASS R18-clear` (`NEEDS_REVIEW` cleared, product active, one audit row with the reason); `PASS R18-hard` (clearing `AGE_RESTRICTED` writes nothing and adds no audit row); `PASS R18-stale` (a clear that confirmed `NEEDS_REVIEW`, against a product now `NOT_DELIVERABLE`, writes nothing, adds no audit row, and returns the skip). |
| R19 | Integration | Script checks `PASS R19-form` and `PASS R19-quick`: each function returns `ok: false` naming the restriction, and the product row is identical before and after. |
| R20 | E2E | Under `npm run preview`, drive each path listed in R20 (browser or `curl`), as STAFF and as ADMIN, against one fixture product of each class. Then read the rows back from dev. Pass means every product's final `isActive`/`restriction` matches R20 (a)–(d), and no refused attempt produced an audit row. Record each attempt and its result as a table in `build-notes.md`. |
| R21 | Unit | In the new `"use server"` file, `grep -nE "^export " <file> \| grep -v "^[0-9]*:export async function"` prints nothing. |
| R22 | E2E | Open `/staff/products` as STAFF: checkboxes, select-all, the perPage control and the three actions all render. `?perPage=100` shows up to 100 rows; `?perPage=7` shows 25. `?restriction=any` lists only the restricted fixtures; `?restriction=none` excludes them; `?stock=UNKNOWN` lists only `UNKNOWN` fixtures; `?restriction=bogus` lists as unfiltered. A unit test covers the `lib/staff-products-query.ts` parsing. |
| R23 | Unit | `tests/product-restriction.test.ts` builds a list covering every class, for both actors, and asserts: each `planBulkAction("ENABLE", …)` entry equals `decideEnable` for that product alone; `DISABLE` and `MARK_UNTRACKED` plans carry no restriction change; `MARK_UNTRACKED` carries no `isActive` change; a foreign product id is `SKIPPED: NOT_FOUND`. |
| R24 | E2E | Select the R26 fixture set and Preview, first as ADMIN and then as STAFF. Read the warning text: both headings, and every restricted product's name and class, are present. ADMIN sees the checkbox copy and the reason field. STAFF sees neither, and sees the overridable products marked `ADMIN_ONLY`. |
| R25 | Integration | Submit Apply with a tampered client payload that claims the `AGE_RESTRICTED` product as "enable". It is still reported skipped (`HARD_BLOCK`), and the rendered summary shows all three lists. |
| R26 | Integration + E2E | Script checks `PASS R26-admin` and `PASS R26-staff`, calling the service with each actor through `getPrismaWs()`. Then repeat the ADMIN case once through the real UI under `npm run preview`, and confirm the same end state on dev. |
| R27 | Integration | Script check `PASS R27`: three fixture products (one with no inventory row, one `TRACKED` at quantity 4, one `UNKNOWN`) are all `UNTRACKED` afterwards, with `isActive` and `restriction` unchanged. |
| R28 | Unit | The guard test exists and passes. Temporarily add `prisma.productRestrictionAuditLog.delete({ where: { id: "x" } })` to a file under `lib/`: the test fails. Revert. |
| R29 | E2E | Open `/staff/products/<fixture id>` for each class, as ADMIN and as STAFF, and read the controls against R29. The ADMIN restriction selector on a `NOT_DELIVERABLE` product offers only `NOT_DELIVERABLE`, `AGE_RESTRICTED` and `PROHIBITED`. The audit list shows the R18/R26 entries, with "Import" for a null-actor row; the script seeds one `source IMPORT` row for this. |
| R30 | Unit | `grep -niE "tobacco\|alcohol\|lottery\|stamps\|aheed\|srimart\|\"DEFAULT\"" lib/catalogue-import-policy.ts` prints nothing. The three exports exist. |
| R31 | Unit | `tests/catalogue-import-policy.test.ts` asserts each R31 case. |
| R32 | Unit | The same file loops over every restriction value plus `null`. |
| R33 | Unit | The same file runs the full cross product (5 existing restrictions × 2 isActive × 5 incoming) and asserts all five R33 properties for each. |
| R34 | Manual | Read the new section of `docs/staff-playbook/staff-tabs-guide.md`. For each capability sentence, name in `build-notes.md` the control (file and element) that implements it. A sentence with no control is a FAIL. `npx vitest run tests/staff-nav-parity.test.ts --maxWorkers=4` passes. |
| R35 | Unit | `grep -n "Restricted products and stock states" specs/architecture.md` matches. ADR-007's front-matter has `status: approved`. `npm run kms:validate` exits 0. |
| R36 | Manual | `gh issue view <n> --comments` for 1196, 1200 and 1201 (with `GH_TOKEN` for `sriahead`) each shows the comment. `gh pr view <PR> --json closingIssuesReferences` lists `#1211` only. |
| R37 | Manual | `build-notes.md` records the dev host (host only) printed by every Prisma CLI run in this slice, and states that no staging or production command was run. |
| R38 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1211`. |
| R39 | Unit | CI `gates` on the PR is green. Locally: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run kms:validate` and `npm run kms:coverage` exit 0, and `npx vitest run --maxWorkers=4`, run alone and not beside a build, is green. |
