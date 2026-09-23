# P876 — Expected Restock Date on Out-of-Stock Products (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

This slice touches the **database** (a migration and a write path that moves between Prisma
clients) and **storefront UI**. So every DB-touching row runs under `npm run preview`, never
`npm run dev`, which cannot load `@prisma/client/wasm` and silently renders an error state
(`CLAUDE.md`). Before any live row, diff `.env` and `.dev.vars` against
`secrets/staging.vars`/`secrets/production.vars` and confirm both local files point at the **dev**
Neon branch. This slice's live rows write to that database, and must never write to staging or
production.

**Vendor today** below means today's date in `Europe/London` (both seeded vendors' timezone). Check
with `node -e "console.log(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date()))"`.

## Testing Areas

1. **Unit:** form parsing (R7), the two pure helpers (R10), display conditions (R12–R13).
2. **Integration:** the migration SQL (R5), the write paths and client (R2, R3, R8), and the
   facade filter (R11), all proven live because they are only meaningful against a real adapter.
3. **System / E2E:** R16, the whole journey under `npm run preview`.
4. **Regression:** Gate 3 (R20). Existing ProductCard and quick-view tests keep passing with the new
   field in their fixtures.
5. **Accessibility:** R6 (labelled input), R15 (no sub-AA alpha text).

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Integration  | Open `specs/2026-09-23-p876-expected-restock-date/build-notes.md` and confirm it records the pre-fix create attempt's outcome verbatim (an error message, or an explicit statement that it succeeded). Then confirm that attempt happened before the R2 change: `git log --format=%H -S "createProductForVendorRepo(getPrismaWs()" -- lib/products-service.ts` names the commit that made the switch, and build-notes places the reproduction before it. If build-notes says it did **not** crash, also confirm a follow-up issue is filed and cited there. |
| R2  | Integration  | `grep -n "createProductForVendorRepo(getPrismaWs(), vendorId, input)" lib/products-service.ts` prints one line, and `grep -c "createProductForVendorRepo(getPrisma()," lib/products-service.ts` prints `0`. Read the file and confirm the function is below the `transaction-bearing writes: WebSocket client only (#382)` banner. |
| R3  | Integration  | Under `npm run preview`, sign in as a store admin, open `/staff/products/new`, and create a product with a unique name, quantity `0` and restock day `2026-12-01`. It saves without an error banner. Query the dev database (`npx tsx` one-off or `prisma studio` against `DIRECT_URL`): the `Product` row exists, its `Inventory` row exists with `quantity = 0`, and `expectedRestockDate = 2026-12-01T00:00:00.000Z`. Afterwards switch the test product off (inactive) so it doesn't show in the dev storefront, and note its slug in build-notes. |
| R4  | Unit         | Read `prisma/schema.prisma`'s `model Inventory`. It contains `expectedRestockDate DateTime?` and an adjacent comment naming the UTC-midnight-of-a-vendor-local-day convention. |
| R5  | Integration  | `git diff --name-only --diff-filter=A origin/staging...HEAD -- prisma/migrations/` lists exactly one new `migration.sql`. Its content adds `"expectedRestockDate"` to `"Inventory"`, and `grep -c "DROP" <that file>` prints `0`. |
| R6  | Accessibility | Read `components/staff/ProductForm.tsx`. There is an `<input type="date">` with `id="expectedRestockDay"` and `name="expectedRestockDay"`, a `<label htmlFor="expectedRestockDay">`, and a `defaultValue` taken from the product's stored day (empty string when absent). Under `npm run preview`, `/staff/products/new` shows the field empty, and the edit page of a product saved with a day shows that day. |
| R7  | Unit         | `npx vitest run tests/catalogue-form.test.ts` exits 0. The file contains assertions for an empty value (maps to `null`), a valid day, `2026-02-31` rejected on field `expectedRestockDay`, and `tomorrow` rejected on field `expectedRestockDay`. |
| R8  | Integration  | Read the diff of `lib/repositories/products.ts`: both the nested `inventory.create` in `createProductForVendor` and the `create` and `update` branches of the `inventory.upsert` in `updateProductForVendor` set `expectedRestockDate` from `calendarDayToUtcMidnight` (or `null`). Live proof is R3 (create) and R16(d) (update to null). |
| R9  | Integration  | Read `ProductSummary` and confirm the `expectedRestockDay: string \| null` field. Confirm both `toProductSummary` and `getProductBySlug` derive it from the inventory row they already select (the `select` gains `expectedRestockDate`, with no new `findMany`/`findUnique`). `npm run typecheck` exits 0. |
| R10 | Unit         | `npx vitest run tests/restock.test.ts` exits 0 and covers yesterday, today, tomorrow and `null`, plus `formatRestockDay("2026-09-28")` containing `Mon` and `28`. Then run the same command with `TZ=NZ` (UTC+12/+13) and again with `TZ=PST8PDT` (UTC−8/−7) prefixed. Both exit 0, which proves the output does not depend on process timezone. **Use those exact slash-free values.** On this project's Windows machine, a `TZ` containing a slash (e.g. `Pacific/Kiritimati`) is silently dropped (`docs/developer-portal/local-dev-playbook.md`), and a POSIX offset string like `JST-9` resolves to UTC, so either would pass vacuously. First confirm each value took effect: `TZ=NZ node -e "console.log(-new Date().getTimezoneOffset()/60)"` prints 12 or 13, and the same with `PST8PDT` prints −8 or −7. `grep -n "process.env\|headers()\|cookies()" lib/restock.ts` prints nothing. |
| R11 | Integration  | Read `lib/products-service.ts`: `list`, `listByCategory`, `search` and `getBySlug` each apply `currentRestockDay` with vendor today from `calendarDayInZone(new Date(), …)` and `getCurrentVendorProfile()` (falling back to `STORE_TIMEZONE`). Live proof is R16(a) (future day shown) and R16(b) (past day hidden) on the category page (`listByCategory`), the quick view (`getBySlug`) and the product page (`getBySlug`). Also run `/search?q=<product name>` during R16(a) and R16(b) (`search`). |
| R12 | Unit         | `npx vitest run` on the ProductCard restock test file exits 0, with three cases: out of stock with a day (text present), in stock with a day (absent), and out of stock with `null` (absent). |
| R13 | Unit         | `npx vitest run tests/quick-view.test.tsx` (or the named restock test) exits 0, with the present case and the `null` absent case for `QuickViewDrawer`. |
| R14 | E2E          | Covered by R16(a) and R16(b) on the product page `/products/<slug>`. Also read `app/(storefront)/products/[slug]/page.tsx` and confirm the notice is conditioned on `!product.inStock` and a non-null `expectedRestockDay`. |
| R15 | Accessibility | Run `git diff origin/staging...HEAD -- components/product/ProductCard.tsx components/product/QuickViewDrawer.tsx "app/(storefront)/products/[slug]/page.tsx" \| grep "^+" \| grep -E "#[0-9a-fA-F]{3,6}\|text-primary/"`. It prints nothing. |
| R16 | E2E          | Under `npm run preview` as a store admin, pick one in-stock seeded product and note its slug and category. **(a)** Edit it: quantity `0`, restock day = vendor today + 3. Confirm `Back in stock` and that date on its category page card, in its quick view (click the name) and on `/products/<slug>`. **(b)** Edit the day to vendor today − 1. `Back in stock` is gone from all three, and the DB row still has the date. **(c)** Edit it to quantity `5` with the day at vendor today + 3. `Back in stock` is gone from all three. **(d)** Clear the day and save. `Inventory.expectedRestockDate` is `NULL`. Restore the product's original quantity afterwards. |
| R17 | Acceptance   | Read `docs/staff-playbook/staff-tabs-guide.md`. The Catalogue (`/staff/products`) section names the expected restock date and both conditions (out of stock only, until the date passes). The Live Inventory section's switch-off advice mentions the restock date for a product that is coming back. Front-matter `version` is higher than `2.3.0`, and `updated` is set to the change date. Trace the sentence to the real control: the field exists on `/staff/products/<id>` (R6). |
| R18 | Regression   | `npm run kms:validate` exits 0 with zero failing. Then `npm run kms:assemble:internal`, then `(cd kms/site-internal && npx next build --webpack)`. Read the **real** exit status (`echo $?` directly after, not piped through `tail`). Both are 0. |
| R19 | Gate 4       | `git diff origin/staging...HEAD -- CHANGELOG.md` shows an entry under `## [Unreleased]` citing `#876` and `#878`. |
| R20 | Gate 3       | `npm run lint`, `npm run typecheck` and `npm run format:check` exit 0. `npx vitest run` exits 0 when run **alone** (not beside or straight after a build — the forks-pool trap), and its summary line reports no file-level failures. |
