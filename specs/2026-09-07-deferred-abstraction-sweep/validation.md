# Deferred-abstraction sweep (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Before you start

Read these five notes. Four of them have each cost a validation round trip in this repo.

1. **Use `npm run preview`, never `npm run dev`, for anything touching the database or a rendered
   page.** `next dev` runs in real Node and cannot load `@prisma/client/wasm`, so a DB-touching
   route silently renders an error state with no crash and no signal.

2. **Resolve the local vendor hostnames from the database before using them.** Do **not** assume the
   `nocaped.com` convention — that assumption failed at `#649`'s `/validate` because the local dev
   DB was seeded with `localhost:8787` and `srimart.localhost`, and both requests silently
   redirected to `/coming-soon` with no error and no hint which of "wrong host" or "broken feature"
   was true. Query `VendorDomain` against the same `DATABASE_URL` the preview server uses, and use
   whatever hosts it prints wherever a row below says "the resolved Aheed host" or "the resolved
   SriMart host".

3. **Scope every absence-grep to a directory, and never to the repo root.** Anything written in this
   spec is machine-copied into `app/(admin)/staff/runbook/docs.ts` by `kms:build-index` and into
   `kms/site-internal/content/` by `kms:assemble:internal`, so a repo-root grep for a string these
   files discuss returns matches from this spec plus both generated copies. Every row below names
   its directory deliberately — do not widen it.

4. **Where a row greps for a symbol it targets call syntax, not the bare word**, because good code
   names what it deliberately excludes. `\.stopPropagation(` matches a call; `stopPropagation` also
   matches a comment explaining why one is no longer needed.

5. **A live-HTML grep for a colour literal is inconclusive against the vendor whose own brand
   primitive equals that literal.** Aheed's primitives are numerically identical to several values
   this slice touches. Where a row checks colour, it checks SriMart or compares the two vendors.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Regression | Resolve every `rounded-*` utility still in use under both revisions and compare. `git show origin/staging:design-system/tokens/tokens.css` gives the before; `design-system/tokens/tokens.css` the after; a step absent from either resolves to Tailwind's default in `node_modules/tailwindcss/theme.css`. Every utility in use must resolve to the SAME value in both, and `git diff origin/staging...HEAD -- design-system/tokens/tokens.css` must show no line where a `--radius-*` token's VALUE changed (added and removed token lines are expected; a changed value is not). A prettier radius is still a failure. |
| R2  | Unit | `grep -rnE "\brounded-(sm\|md)\b" app components features --include=*.tsx` returns no matches. Then `npx vitest run tests/radius-scale.test.ts` exits 0. |
| R3  | Unit | List the steps still used: `grep -rhoE "\brounded-(sm\|md\|lg\|xl\|2xl\|3xl\|full)\b" app components features --include=*.tsx \| sort -u`. Every step printed has a matching `--radius-*` line in `grep -n "radius" design-system/tokens/tokens.css`, and every `--radius-*` line corresponds to a step that was printed. |
| R4  | Unit | `npx vitest run tests/radius-scale.test.ts` exits 0. Then prove it bites **in the direction that matters**: temporarily reintroduce a single `rounded-sm` class into any `.tsx` file under `components/`, re-run, confirm it FAILS naming that file and the colliding pair (`rounded` vs `rounded-sm`, both `0.25rem`), then revert. **Not `rounded-md`** — post-fix, `md` is no longer overridden in `tokens.css` at all, so it resolves to Tailwind's un-overridden default (`0.375rem`) and collides with nothing currently in use; `rounded-sm` (colliding with bare `rounded`) is the probe that actually demonstrates a live collision. This row said `rounded-md` until `/fix` (2026-09-08) corrected it after `/validate` found the `rounded-sm` case was also the one masked by a real defect in `declaredTokens()`'s comment-unaware regex — see `build-notes.md`. |
| R5  | Unit | `grep -oE "\-\-radius-[a-z0-9]+" design-system/tokens/tokens.css \| sort -u` and the token column of the Shape table in `specs/design-system.md` produce the same set. |
| R6  | Unit | `ls components/ui/` lists `Card.tsx`, `Button.tsx`, `FormField.tsx`. For each, `head -1` is not `"use client"`. |
| R7  | Unit | `grep -n "form-classes" components/ui/Button.tsx components/ui/FormField.tsx` shows an import in both. For each of the four class constants, its literal value from `lib/form-classes.ts` does not appear as a string literal in either file. |
| R8  | Security & Accessibility | A vitest test renders `FormField` with an error and asserts the control carries BOTH `aria-invalid` and `aria-describedby`; renders it without an error and asserts neither is present. That test file exits 0. |
| R9  | Integration | For each primitive, count importers outside its own directory: `grep -rln "components/ui/Card" app components features --include=*.tsx \| grep -v "^components/ui/" \| wc -l` returns at least 3; same for `Button` and `FormField`. `grep -n "components/ui/Card\|from \"@/components/ui\"" components/product/ProductCard.tsx` shows `Card` is used there. |
| R10 | Security & Accessibility | Both scoped greps return no matches: `grep -rnE "\[#[0-9a-fA-F]{3,8}\]" components/ui/` and `grep -rnE "(text\|fill\|stroke\|decoration)-(primary\|action\|accent\|danger)[a-z-]*/[0-9]+" components/ui/`. Also `npx vitest run tests/token-alpha-purity.test.ts` exits 0 — it walks `components/`, so it covers the new files automatically. Note `tests/panel-token-purity.test.ts` does NOT cover `components/ui/` (its roots are `app/(admin)` and `components/staff`), which is why the hex grep above is done by hand. |
| R11 | Integration | `npx vitest run` covering the R12 test exits 0. Then live: under `npm run preview`, fetch a category page on the resolved Aheed host, save the HTML, and confirm no `<button` appears between an `<a` and its matching `</a>` inside a product card. |
| R12 | Integration | The new test renders `ProductCard` and asserts no `button` descends from an `a`. Prove it bites: temporarily nest a `<button>` back inside the link, re-run, confirm FAIL, revert. |
| R13 | Unit | `grep -n "\.stopPropagation(" components/cart/AddToCartButton.tsx components/cart/CartQuantityStepper.tsx` returns no matches. A bare `stopPropagation` may still appear in a comment explaining why it is gone — expected, and why this targets the call. |
| R14 | Regression | `npx vitest run tests/motion-reduce-coverage.test.ts` exits 0. It hard-pins both literals to `components/product/ProductCard.tsx`, so it fails if the refactor moved them elsewhere. |
| R15 | Regression | `git diff --stat origin/staging...HEAD -- components/bundle/BundleCard.tsx` prints nothing. |
| R16 | Regression | `git diff origin/staging...HEAD -- app/globals.css` prints nothing, or its diff touches no line inside the `.skew-card*` rules or the `prefers-reduced-motion` block. |
| R17 | Integration | For each of the eight column names (`brandGreenDark`, `brandGreen`, `brandOrange`, `brandRed`, `brandCream`, `brandGreenTint`, `brandOrangeTint`, `brandRedTint`), `grep -c "<name>" components/staff/StorefrontConfigForm.tsx` is non-zero, and reading the file shows each is rendered as a labelled input. **Do not grep for `name="brand..."` as a literal JSX attribute** — the fields are declared in a `BRAND_COLOR_FIELDS` array and rendered through `.map()` with `name={field.name}`, so an attribute-literal pattern returns zero on a fully correct implementation. |
| R18 | Integration | Under `npm run preview`, signed in as a vendor ADMIN on the resolved Aheed host, submit `/staff/storefront` with a distinct new value in all eight colour fields. Query that vendor's `VendorBranding` row: all eight columns hold the submitted values. |
| R19 | Unit | `grep -nE "initialConfig\s*:\s*any\|initialBranding\s*:\s*any" components/staff/StorefrontConfigForm.tsx` returns no matches, and `npm run typecheck` exits 0. |
| R20 | Unit | `sed -n '/^model Theme /,/^}/p' prisma/schema.prisma` shows a name field and eight `String` brand columns, and no line declaring a column of type `Json`. **Do not grep the block for the bare word `Json`** — the model's own comment says "never Json — CLAUDE.md's schema rules", so a correct implementation matches. Check for a `Json` column *declaration*, not the word. |
| R21 | Unit | The same `sed` output declares no `vendorId` column and no `Vendor` relation field. `npx vitest run tests/repository-vendor-scoping.test.ts` exits 0. |
| R22 | Unit | `sed -n '/^model VendorBranding /,/^}/p' prisma/schema.prisma` shows a nullable `themeId` and a relation carrying `onDelete: SetNull`. |
| R23 | Integration | `git diff origin/staging...HEAD -- lib/vendor-theme.ts` prints nothing — the file is untouched, which is the strongest form of "performs no join". **Do not grep it for `Theme`**: the file is *named* `vendor-theme.ts` and its own doc comment discusses theming throughout, so the word matches everywhere on a correct implementation. Then live: under `npm run preview` select a theme on `/staff/storefront`, edit ONE colour field to a different value and save; re-query `VendorBranding` and confirm that column differs from the theme's value while the other seven still match it. |
| R24 | Integration | Find the new migration with `ls -t prisma/migrations/ \| head -3`, then `grep -c "DROP INDEX" prisma/migrations/<new>/migration.sql` returns 0, or none of its matches names a trigram index from `20260820143949_p7_5de_order_search_trigram`. **Read this BEFORE applying** — generate with `--create-only`. |
| R25 | Integration | Run the seed twice against the dev database; after each run `prisma.theme.count()` returns the same number, and it is at least 2. |
| R26 | E2E | Under `npm run preview` as a vendor ADMIN, fetch `/staff/storefront` and confirm the control lists the seeded theme names. Submit it selecting a theme whose primitives differ from the vendor's current ones, then query `VendorBranding`: all eight columns equal that theme's values. |
| R27 | System | `sed -n '/return {/,/as CSSProperties/p' lib/vendor-theme.ts \| grep -c '"--color'` prints exactly `20`, and `npx vitest run tests/vendor-theme.test.ts` exits 0. Then fetch the storefront home on the resolved Aheed host and again on the resolved SriMart host, extract the root element's `style` attribute from each, and confirm both contain `--color-primary` with **different** values. |
| R28 | Unit | `grep -n -B1 -A8 "^enum " prisma/schema.prisma` shows the new enum with all-uppercase members, consistent with the nine existing enums. |
| R29 | Unit | `sed -n '/^model Product /,/^}/p' prisma/schema.prisma` shows a nullable net-content amount column and a nullable column typed as the R28 enum. |
| R30 | Unit | The same `sed` output shows a nullable `Int` price-per-base-unit column and an `@@index(...)` whose last field is that column. |
| R31 | Integration | Under `npm run preview`, create a product via `/staff/products` with net content set; query the DB and confirm the derived column is populated and equals what the R32 function computes. Then edit only that product's `basePrice` and confirm the derived column changed to match. |
| R32 | Unit | A vitest test asserts the pure function's output for at least a whole-kilogram case, a sub-kilogram case whose exact unit price is not a whole number of pence, and an `EACH` case. Read the function and confirm it takes `basePrice` and net content as parameters and never reads the stored column. |
| R33 | Integration | `grep -n -A30 "PRODUCT_FIELDS" lib/catalogue-form.ts` lists both new field names. Under `npm run preview`, submit `/staff/products` with a non-numeric net-content amount: the page re-renders with an error naming that field and returns HTTP 200, not 500. |
| R34 | E2E | `sed -n '/^model Product /,/^}/p' prisma/schema.prisma` shows `unitLabel String` still non-nullable. Under `npm run preview`, view one product WITH net content and one WITHOUT: the first shows the derived unit price, the second shows its `unitLabel` text unchanged. |
| R35 | Regression | Compare the model block across revisions: `git show origin/staging:prisma/schema.prisma \| sed -n '/^model OrderItem /,/^}/p' > /tmp/oi-before` and the same `sed` against the working tree; `diff` prints nothing. **Do not grep the schema diff for `OrderItem`** — an unrelated `Product` change lands `OrderItem[]` in the diff's context lines, which matches on a correct implementation. |
| R36 | Integration | Same procedure as R24, applied to the unit-pricing migration. |
| R37 | Integration | Write a `tsx` script to a file inside the repo (never `npx tsx -e`, which fails silently here once it imports a package) that calls the repository read path with unit-price ordering against the dev database and prints each row's derived unit price. Confirm the printed sequence is non-decreasing. Delete the scratch file afterwards, and run `npx tsc --noEmit` once if it was placed at the repo root. |
| R38 | Unit | `grep -n -A8 "deliberately not here yet" specs/design-system.md` no longer lists `components/` as unbuilt. `grep -m1 "^version:" specs/design-system.md` is greater than `1.11.0`. R5 covers the Shape table. |
| R39 | Unit | `grep -n "Implementation note" specs/decisions/ADR-004-multi-tenancy.md` shows a new dated note covering both the theme catalogue and the deliberate absence of vendor scoping. `grep -m1 "^version:" specs/decisions/ADR-004-multi-tenancy.md` exceeds `git show origin/staging:specs/decisions/ADR-004-multi-tenancy.md \| grep -m1 "^version:"`. |
| R40 | Acceptance | Read the `/staff/storefront` and `/staff/products` sections of the operator guides. For **each** capability sentence added, open the page's source and point at the control that delivers it — a form field, a select, or an action import. A sentence with no such control is a failure, even though nothing automated will catch it. |
| R41 | Regression | `npx vitest run tests/operator-doc-coverage.test.ts tests/staff-nav-parity.test.ts` exits 0. |
| R42 | Release | `grep -n "measured 2026-09-07 at" CLAUDE.md` (or the surrounding baseline sentence in the vitest paragraph) names this slice's measured file/test counts, and those counts equal what `npx vitest run` actually reported in R45. `git log --oneline -- CLAUDE.md` shows the change in the Build commit rather than a later documentation commit. |
| R43 | Release | `npm run kms:validate` exits 0. `npm run kms:check-generated` prints all artefacts current. Also run `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` and read its REAL exit status — do not pipe through `tail`, which reports the pipe's status rather than the build's. |
| R44 | Release | `git diff origin/staging...HEAD -- CHANGELOG.md` is non-empty and describes this slice. |
| R45 | Release | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0. `npx vitest run` — run ALONE, with no build running and none just finished — reports at least 109 files and 1456 tests, zero failures. A shortfall in the FILE count is the known forks-pool trap, not a pass: check for orphaned `node.exe`/`workerd.exe` processes and re-run. |
